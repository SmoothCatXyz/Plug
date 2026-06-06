import { streamText } from "ai";
import { resolveToolProviderSecret } from "./config-service";
import { minimalReasoningOptions, toLanguageModel } from "./provider-utils";
import { classifyIntent } from "./intent-classifier";

export type MessageKind = "chat" | "work";

/**
 * Map a model's raw classification output to a MessageKind.
 * Pure + exported so the parsing is unit-testable without an API call.
 * Ambiguous / garbage output defaults to "work": the orchestrator can handle
 * anything (worst case a menu), whereas the tool-free chat path cannot do work.
 */
export function parseKind(raw: string): MessageKind {
  const t = raw.toLowerCase();
  if (/\bwork\b/.test(t)) return "work";
  if (/\bchat\b/.test(t)) return "chat";
  return "work";
}

type HistoryTurn = { role: string; content: string };

/**
 * Decide whether a message wants Plug to actually DO something (work — needs
 * tools: research, files, browser, producing a deliverable) or is just talking
 * (chat — greeting, small talk, opinions, personal decisions).
 *
 * Greetings short-circuit to "chat" via the instant regex, saving an API call.
 * Everything else gets one cheap binary classification on the tool model — a
 * simple judgement even a small model makes reliably, unlike resisting its
 * "be exhaustively helpful" bias.
 */
export async function classifyWorkOrChat(input: {
  content: string;
  recentHistory?: HistoryTurn[];
}): Promise<MessageKind> {
  // Greetings are always chat — no need to spend a model call.
  if (classifyIntent(input.content) === "greeting") return "chat";

  try {
    const secret = await resolveToolProviderSecret();
    if (!secret.apiKey) return "work";

    const historyText = (input.recentHistory ?? [])
      .slice(-3)
      .map((turn) => `${turn.role === "assistant" ? "Plug" : "用户"}: ${turn.content}`)
      .join("\n");

    // Use streamText (doStream), not generateText (doGenerate): the APIMart
    // gateway returns a streaming SSE body ("data: {...}") even for non-stream
    // requests, which the non-streaming JSON parser chokes on ("Unexpected
    // token 'd'") — that threw on every call and silently defaulted to "work".
    // Reasoning models (gpt-5) also spend output tokens on hidden reasoning, so
    // keep a generous cap; no temperature (some reasoning models reject it).
    const providerOptions = minimalReasoningOptions(secret);
    const result = streamText({
      model: toLanguageModel(secret),
      maxOutputTokens: 512,
      ...(providerOptions ? { providerOptions } : {}),
      system: [
        "你是一个意图分类器。判断用户最新一句话属于哪一类,只回一个词:work 或 chat。",
        "",
        "核心区分:用户是在【命令你去做一件具体的事】,还是在【问/聊】。",
        "work = 用户用动作命令让你去【做/写/改/查/扫/产出】一个具体东西:写某个 PRD、改某个文件、搜某个资料、扫描仓库生成清单、操作浏览器。能立刻知道第一步动手去做什么。",
        "chat = 用户在问状态/进度/你的看法/评价,或者打招呼、闲聊、感慨、个人决定——没有让你去执行一个具体任务。包括「项目怎么样了」「完成度如何」「你觉得呢」这类【问句】:用户要的是你的一句判断,不是让你去跑一遍审计。",
        "判别窍门:如果用户是在【提问】(怎么样了/到什么程度/行不行/你觉得呢)→ chat;如果用户是在【下命令做事】(帮我写/去查/扫一下/生成)→ work。拿不准就判 chat。",
        "特别注意:用户指出【缺了某个交付物】时,哪怕用问句表达,也是让你去【补上】,判 work,不要当成单纯提问。如「为什么没有流程图」「怎么没有竞品分析」「缺了用户画像」「PRD 里没有指标」——都是 work。",
        "还要注意:【画/做/出/整一个 …图/地图/画布/矩阵/分析/评分/清单】这类是让你产出一份可视化交付物,一律 work。如「画一个用户故事地图」「做个用户旅程图」「出一张商业模式画布」「画个流程图」——都是 work,要写成文档,不是在聊天里贴文本。",
        "",
        "例子:",
        "「帮我写一份登录功能的PRD」→ work(命令:写)",
        "「打开百度并截图」→ work(命令:操作)",
        "「搜索竞品分析」→ work(命令:查)",
        "「扫一下仓库,列出还缺什么」→ work(命令:扫描+产出)",
        "「整理一下这个文档」→ work(命令:整理)",
        "「打开文档」「打开那篇调研」「给我看看 xxx 文档」→ work(命令:打开/查看,要调 open_document)",
        "「为什么没有流程图」「怎么没有竞品分析」「缺了用户画像」→ work(指出缺失=让你去补上)",
        "「画一个用户故事地图」「做个用户旅程图」「出一张商业模式画布」→ work(产出可视化交付物,写成文档)",
        "「整个项目的完成度到什么级别了?」→ chat(问状态,要的是你的判断,不是让你跑审计)",
        "「项目做得怎么样了」→ chat(问进度)",
        "「你觉得这个方向行吗」→ chat(征求看法)",
        "「hi」→ chat",
        "「我今天想去玩儿」→ chat",
        "「今天要不要休息」→ chat",
        "「但是今天我还是得推进工作」→ chat(只是表态,没说做哪件事)",
        "「最近好忙」→ chat",
        "「累了」→ chat",
        "",
        "只回 work 或 chat,不要解释。"
      ].join("\n"),
      prompt: historyText
        ? `近期对话:\n${historyText}\n\n最新一句:${input.content}`
        : input.content
    });

    let text = "";
    for await (const delta of result.textStream) {
      text += delta;
    }

    const kind = parseKind(text);
    console.log(`[classify] ${JSON.stringify(input.content)} -> ${kind} (raw: ${JSON.stringify(text)})`);
    return kind;
  } catch (error) {
    // Network / provider failure: degrade to the capable path, but make the
    // failure visible — a silent default-to-work is exactly what hides bugs.
    console.warn(`[classify] FAILED for ${JSON.stringify(input.content)}, defaulting to work:`, error);
    return "work";
  }
}

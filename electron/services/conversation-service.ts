import { streamText, type ModelMessage } from "ai";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getProjectById } from "./project-service";
import { loadWorkspace } from "./workspace-service";
import { resolveChatProviderSecret } from "./config-service";
import { toLanguageModel, MINIMAL_REASONING } from "./provider-utils";
import { withPersona } from "./persona";
import type { ChatStreamEvent } from "../../shared/types";

const MAX_HISTORY_TURNS = 8;

/**
 * The single tool-free conversational path. Handles everything that is talking
 * rather than working: greetings, small talk, opinions, personal decisions.
 *
 * It has NO tools, so a numbered task menu is structurally impossible. Voice
 * comes entirely from the shared PLUG_PERSONA; this layer only frames the
 * situation (casual conversation) and supplies project state so Plug can be
 * proactive when the user just says "hi" without asking anything specific.
 */
export async function streamConversationalReply(input: {
  streamId: string;
  projectId: string;
  messageId: string;
  history: { role: "user" | "assistant"; content: string }[];
  emit: (event: ChatStreamEvent) => void;
  trace?: (message: string) => void;
}): Promise<string> {
  const trace = input.trace ?? (() => undefined);
  const prepStart = Date.now();

  const [project, workspace] = await Promise.all([
    getProjectById(input.projectId),
    loadWorkspace(input.projectId)
  ]);

  const homeDoc =
    (await readOptional(join(project.path, "00-home.md"))) ||
    (await readOptional(join(project.path, ".plug", "memory.md"))) ||
    "（暂无项目文档）";

  const now = new Date();
  const timeStr = now.toLocaleString("zh-CN", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const providerSecret = await resolveChatProviderSecret(workspace.manifest.model.default);
  trace(`conv prep ${Date.now() - prepStart}ms (model=${providerSecret.modelId})`);

  if (!providerSecret.apiKey) {
    const text = "你好！请先在设置里配置 API Key。";
    input.emit({ streamId: input.streamId, type: "delta", messageId: input.messageId, delta: text });
    return text;
  }

  const situational = [
    "现在是日常对话,不是派活儿。用户的话可能是打招呼、闲聊、随口感慨、或者想听听你的看法。",
    "你是在一个聊天框里跟他对话,不是在写文档。像面对面聊天那样,自然回应他这句话本身。",
    "长度:默认就一两句话。聊天是你来我往,不是一口气把话说尽——给一句你的真实反应或态度,最多再抛一个具体的小问题往下聊,就停。",
    "硬性约束:不要展开成多段;不要给「节奏/计划/时间表/清单」这种结构;不要出现 A) B) C) 或 1. 2. 3.;不要罗列方案让他挑;不要在结尾问「要我帮你定哪一种」。除非用户明确开口要计划或清单。",
    "如果他只是打了个招呼、没说具体的事,你就结合下面的项目状态和当前时间,主动提一件此刻最值得推进的事——同样一两句话,别铺开。",
    "",
    `当前时间:${timeStr}`,
    `项目名称:${workspace.manifest.name}`,
    "项目文档(供你了解项目,不必复述):",
    homeDoc.slice(0, 1500)
  ].join("\n");

  const messages: ModelMessage[] = input.history.slice(-MAX_HISTORY_TURNS).map((turn) => ({
    role: turn.role,
    content: turn.content
  }));

  const result = streamText({
    model: toLanguageModel(providerSecret),
    // Chat doesn't need a reasoning chain — minimal effort keeps replies snappy.
    providerOptions: MINIMAL_REASONING,
    // No temperature: reasoning models (gpt-5) may reject a non-default value.
    // Generous token budget: even at minimal effort, leave room for the reply.
    maxOutputTokens: 1024,
    system: withPersona(situational),
    messages,
    maxRetries: 1
  });

  const modelStart = Date.now();
  let firstTokenAt = 0;
  let content = "";
  try {
    for await (const delta of result.textStream) {
      if (firstTokenAt === 0) {
        firstTokenAt = Date.now();
        // The gap before the first token is the model's hidden reasoning/queue
        // time — for reasoning models (gpt-5) this dominates a short reply.
        trace(`conv first-token ${firstTokenAt - modelStart}ms`);
      }
      content += delta;
      input.emit({ streamId: input.streamId, type: "delta", messageId: input.messageId, delta });
    }
    trace(`conv model total ${Date.now() - modelStart}ms (${content.length} chars)`);
  } catch (error) {
    console.warn(`[conversation] stream failed:`, error);
  }

  // Never leave the bubble empty (e.g. reasoning ate the whole budget, or the
  // provider errored): emit a graceful fallback so the user always gets a reply.
  if (content.trim().length === 0) {
    console.warn(`[conversation] empty reply, using fallback`);
    content = "嗨,我在。说说看,现在想从哪件事入手?";
    input.emit({ streamId: input.streamId, type: "delta", messageId: input.messageId, delta: content });
  }

  return content;
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

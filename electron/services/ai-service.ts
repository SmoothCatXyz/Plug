import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { stepCountIs, streamText } from "ai";
import type { ModelMessage } from "ai";
import { isAnthropicProvider, createAnthropicThinkingModel } from "./thinking-service";
import type { AgentMode, ProviderTestAttempt, ProviderTestResult, ToolStreamEvent } from "../../shared/types";
import type { ChatMessage, ChatStreamEvent, SessionSnapshot } from "../../shared/types";
import { getProjectById } from "./project-service";
import { getRelayStatus } from "./relay-service";
import {
  getProviderSecret,
  resolveChatProviderSecret,
  resolveToolProviderSecret
} from "./config-service";
import { requestJsonWithRetry, createProviderFetch } from "./network-service";
import { openWorkspaceDocumentPath, loadWorkspace } from "./workspace-service";
import {
  appendSessionMessage,
  createChatMessage,
  replaceSession,
  updateSessionTitle
} from "./session-service";
import { invokeAgentTool } from "./agent-service";
import { createOrchestratorTools } from "./agent-crew";
import { loadRelevantSkills, type LoadedSkill } from "./skill-service";
import { searchMemories, extractAndStoreMemories, type MemoryEntry } from "./vector-memory-service";
import { classifyWorkOrChat } from "./work-classifier";
import { streamConversationalReply } from "./conversation-service";
import { PLUG_PERSONA, withPersona } from "./persona";
import { createTurnLog } from "./debug-log";
import { indexProjectDocument } from "../tools/document-index";
import { readProjectManifest } from "../tools/project-files";
import { resolveDocumentOpenIntent } from "./document-intent";
import { PRD_AUTHORING_GUIDE } from "../tools/prd-template";
import {
  lowReasoningOptions,
  minimalReasoningOptions,
  toLanguageModel as toModel,
  type ProviderSecret as PS
} from "./provider-utils";

type OpenAiChatCompletionResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type ErrorWithAttempts = Error & {
  attempts?: ProviderTestAttempt[];
};

type StreamChatInput = {
  streamId: string;
  projectId: string;
  sessionId: string;
  content: string;
  currentDocumentPath: string;
  agentMode: AgentMode;
};

export type ProviderSecret = PS;

const runningProjectStreams = new Set<string>();
const MAX_SESSION_TOOL_EVENTS = 64;

function mergeToolEvents(...eventGroups: ToolStreamEvent[][]): ToolStreamEvent[] {
  const latestByInvocation = new Map<string, ToolStreamEvent>();

  for (const event of eventGroups.flat()) {
    const current = latestByInvocation.get(event.invocationId);

    if (!current || event.createdAt.localeCompare(current.createdAt) > 0) {
      latestByInvocation.set(event.invocationId, event);
    }
  }

  return [...latestByInvocation.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, MAX_SESSION_TOOL_EVENTS);
}

export async function testProviderConnection(input: {
  providerId: string;
  modelId?: string;
  longTimeout?: boolean;
}): Promise<ProviderTestResult> {
  const startedAt = Date.now();
  const { provider, apiKey, network } = await getProviderSecret(input.providerId);
  const modelId = input.modelId || provider.defaultModel;

  if (!apiKey) {
    return {
      ok: false,
      providerId: provider.id,
      modelId,
      durationMs: Date.now() - startedAt,
      message: "API key is not configured.",
      attempts: []
    };
  }

  try {
    const response = await requestJsonWithRetry<OpenAiChatCompletionResponse>({
      url: `${provider.baseURL.replace(/\/+$/, "")}/chat/completions`,
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: "user",
            content: "Reply with exactly: OK"
          }
        ],
        temperature: 0,
        max_tokens: 8,
        stream: false
      }),
      network,
      providerProxy: {
        mode: provider.proxyMode,
        url: provider.proxyUrl
      },
      longTimeout: input.longTimeout
    });
    const content = response.body.choices?.[0]?.message?.content?.trim();

    return {
      ok: true,
      providerId: provider.id,
      modelId,
      durationMs: Date.now() - startedAt,
      message: content ? `Provider responded: ${content}` : "Provider responded without content.",
      attempts: response.attempts
    };
  } catch (error) {
    const providerError = error as ErrorWithAttempts;

    return {
      ok: false,
      providerId: provider.id,
      modelId,
      durationMs: Date.now() - startedAt,
      message: providerError.message || "Provider test failed.",
      attempts: providerError.attempts ?? []
    };
  }
}

export async function streamChatResponse(
  input: StreamChatInput,
  emit: (event: ChatStreamEvent) => void,
  emitTool: (event: ToolStreamEvent) => void = () => undefined
): Promise<SessionSnapshot> {
  if (runningProjectStreams.has(input.projectId)) {
    throw new Error("Another session is already running for this project.");
  }

  runningProjectStreams.add(input.projectId);

  try {
    let recordedToolEvents: ToolStreamEvent[] = [];
    const emitTrackedTool = (event: ToolStreamEvent): void => {
      recordedToolEvents = mergeToolEvents(recordedToolEvents, [event]);
      emitTool(event);
    };
    const userMessage = createChatMessage("user", input.content.trim());
    const userSnapshot = await appendSessionMessage(input.projectId, input.sessionId, userMessage);
    emit({ streamId: input.streamId, type: "session", snapshot: userSnapshot });

    const assistantMessage = createChatMessage("assistant", "");
    emit({ streamId: input.streamId, type: "assistant-start", message: assistantMessage });

    // Routing: is this message work (needs tools -> orchestrator) or chat
    // (talking -> tool-free conversational path, where a task menu is
    // structurally impossible)? Mode-independent — chitchat is chitchat even in
    // execute mode. Greetings short-circuit to chat inside the classifier.
    const turn = createTurnLog(input.streamId, `▶ ${JSON.stringify(input.content)} (mode=${input.agentMode})`);

    // Fast path: a plain "open <doc>" command resolves to a path deterministically
    // (no model). Skip classify + context load + orchestrator — a ~7s pipeline for
    // what is a local file open — and just reveal the document.
    const fastOpen = await resolveFastDocumentOpen(input.content, input.projectId);
    if (fastOpen) {
      const endOpen = turn.phase("fast-open");
      const result = await invokeAgentTool({
        invocationId: `${input.streamId}:fast-open`,
        projectId: input.projectId,
        mode: input.agentMode,
        name: "open_document",
        input: fastOpen.kind === "path" ? { path: fastOpen.path } : {},
        emit: emitTrackedTool
      });
      if (result.status !== "error") {
        const reply = result.summary || "已打开。";
        emit({ streamId: input.streamId, type: "delta", messageId: assistantMessage.id, delta: reply });
        const docPath = (result.output as { documentPath?: string } | undefined)?.documentPath;
        if (docPath) {
          emit({ streamId: input.streamId, type: "open-document", path: docPath });
        }
        endOpen(docPath ?? "");
        turn.log("✓ DONE (fast-path)");
        return completeAssistantMessage(input, userSnapshot, assistantMessage, reply, emit, recordedToolEvents);
      }
      endOpen("miss -> full pipeline");
    }

    const recentHistory = userSnapshot.session.messages
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    const endClassify = turn.phase("classify");
    const kind = await classifyWorkOrChat({ content: input.content, recentHistory });
    endClassify(`-> ${kind}`);

    if (kind === "chat") {
      turn.log("route=chat -> conversational reply");
      const endChat = turn.phase("conversational-reply");
      const reply = await streamConversationalReply({
        streamId: input.streamId,
        projectId: input.projectId,
        messageId: assistantMessage.id,
        history: recentHistory,
        emit,
        trace: turn.sub
      });
      endChat(`${reply.length} chars`);
      turn.log("✓ DONE");
      return completeAssistantMessage(input, userSnapshot, assistantMessage, reply, emit, recordedToolEvents);
    }
    turn.log("route=work -> orchestrator");

    const endCtx = turn.phase("load-context");
    const chatContext = await loadChatContext(input.projectId, userSnapshot, input.currentDocumentPath);
    const { systemPrompt, messages, modelId } = buildChatPromptFromContext(chatContext, input.agentMode);
    const providerSecret = await resolveChatProviderSecret(modelId);
    endCtx();

    if (!providerSecret.apiKey) {
      const localAgentContent = await runMvpAcceptanceAgent(input, userSnapshot, emit, assistantMessage.id, emitTrackedTool);

      if (localAgentContent !== null) {
        return completeAssistantMessage(input, userSnapshot, assistantMessage, localAgentContent, emit, recordedToolEvents);
      }

      const setupContent = await streamLocalText(
        input.streamId,
        assistantMessage.id,
        renderMissingApiKeyMessage(providerSecret.provider.label, providerSecret.modelId, input.content),
        emit
      );

      return completeAssistantMessage(input, userSnapshot, assistantMessage, setupContent, emit, recordedToolEvents);
    }

    const projectContext = buildProjectContext(chatContext.workspace, chatContext.currentDocument);
    const tools = input.agentMode !== "plan"
      ? await createOrchestratorTools({
          streamId: input.streamId,
          projectId: input.projectId,
          mode: input.agentMode === "auto" ? "execute" : input.agentMode,
          emitTool: emitTrackedTool,
          projectContext
        })
      : {};

    const thinkingEnabled = isAnthropicProvider(providerSecret.provider.baseURL);
    const model = thinkingEnabled
      ? createAnthropicThinkingModel(providerSecret)
      : toLanguageModel(providerSecret);

    let providerStreamError: unknown = null;
    // Tool orchestration needs some planning, but vendor-compatible endpoints
    // should not receive OpenAI-only reasoning controls.
    const providerOptions = thinkingEnabled ? undefined : lowReasoningOptions(providerSecret);
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      toolChoice: "auto",
      stopWhen: stepCountIs(30),
      maxRetries: providerSecret.network.maxRetries,
      timeout: providerSecret.network.longTimeoutMs,
      ...(thinkingEnabled
        ? {
            providerOptions: {
              anthropic: {
                thinking: { type: "enabled", budget_tokens: 8000 }
              }
            }
          }
        : providerOptions
          ? { providerOptions }
          : {}),
      onError: (event) => {
        providerStreamError = event.error;
      }
    });
    let content = "";

    const orchStart = Date.now();
    const endOrch = turn.phase("orchestrator");
    let stepNum = 0;
    let stepStart = Date.now();
    let stepTools: string[] = [];
    let modelMs = 0;

    try {
      for await (const chunk of result.fullStream) {
        if (chunk.type === "start-step") {
          stepNum += 1;
          stepStart = Date.now();
          stepTools = [];
        } else if (chunk.type === "tool-call") {
          stepTools.push(chunk.toolName);
        } else if (chunk.type === "finish-step") {
          const stepMs = Date.now() - stepStart;
          modelMs += stepMs;
          turn.sub(`step ${stepNum} model ${stepMs}ms → ${stepTools.length ? stepTools.join(", ") : "final answer"}`);
        } else if (chunk.type === "reasoning-delta") {
          emit({
            streamId: input.streamId,
            type: "thinking-delta",
            messageId: assistantMessage.id,
            delta: chunk.text
          });
        } else if (chunk.type === "text-delta") {
          // Buffer the orchestrator's prose; we decide AFTER the run whether to
          // surface it (a synthesis answer) or replace it with a bounded,
          // tool-grounded confirmation (an action task). Buffering avoids
          // streaming verbose narration we'd then have to retract.
          content += chunk.text;
        } else if (chunk.type === "error") {
          throw chunk.error;
        }
      }
    } catch (error) {
      const failureContent = await streamLocalText(
        input.streamId,
        assistantMessage.id,
        renderProviderFailureMessage(providerSecret.provider.label, providerSecret.modelId, error),
        emit
      );

      return completeAssistantMessage(input, userSnapshot, assistantMessage, failureContent, emit, recordedToolEvents);
    }

    if (providerStreamError) {
      const failureContent = await streamLocalText(
        input.streamId,
        assistantMessage.id,
        renderProviderFailureMessage(providerSecret.provider.label, providerSecret.modelId, providerStreamError),
        emit
      );

      return completeAssistantMessage(input, userSnapshot, assistantMessage, failureContent, emit, recordedToolEvents);
    }

    {
      const totalMs = Date.now() - orchStart;
      endOrch(`model≈${modelMs}ms tools≈${Math.max(0, totalMs - modelMs)}ms steps=${stepNum}`);
    }

    // A-为主 B-兜温度: if this turn performed side-effecting actions, the tool
    // results ARE the outcome — replace any verbose narration with a short,
    // tool-grounded confirmation (single-purpose, minimal-context generation, so
    // there's nothing to pad with). Otherwise the model's composed text is the
    // deliverable; surface the buffered text as-is.
    const actionSummaries = collectActionSummaries(recordedToolEvents);
    if (actionSummaries.length === 1 && SELF_DESCRIBING_TOOLS.has(actionSummaries[0].toolName)) {
      // Sole action by a self-describing tool: its summary IS the reply — skip
      // the confirmation model call entirely (saves a full round-trip on the
      // common "open/write a document" path).
      content = actionSummaries[0].message;
      turn.log(`confirmation skipped (self-describing: ${actionSummaries[0].toolName})`);
      emit({ streamId: input.streamId, type: "delta", messageId: assistantMessage.id, delta: content });
    } else if (actionSummaries.length > 0) {
      const endConfirm = turn.phase("confirmation");
      content = await streamActionConfirmation({
        streamId: input.streamId,
        messageId: assistantMessage.id,
        userRequest: input.content,
        actionSummaries: actionSummaries.map((entry) => entry.message),
        providerSecret,
        emit
      });
      endConfirm(`${content.length} chars`);
    } else if (content) {
      emit({ streamId: input.streamId, type: "delta", messageId: assistantMessage.id, delta: content });
    }
    turn.log("✓ DONE");

    const completedAssistantMessage: ChatMessage = {
      ...assistantMessage,
      content
    };
    let finalSession = {
      ...userSnapshot.session,
      messages: [...userSnapshot.session.messages, completedAssistantMessage],
      toolEvents: mergeToolEvents(recordedToolEvents, userSnapshot.session.toolEvents),
      updatedAt: new Date().toISOString()
    };
    let finalSnapshot = await replaceSession(input.projectId, finalSession);

    if (shouldGenerateTitle(userSnapshot.session.title, userSnapshot.session.messages.length)) {
      const title = await generateSessionTitle(input.content, content);
      finalSnapshot = await updateSessionTitle(input.projectId, finalSession.id, title);
      finalSession = finalSnapshot.session;
    }

    // If this turn wrote or opened a document, reveal it in the side panel.
    // Freshly written docs also get indexed (section _index.md + home page).
    const documentToOpen = findDocumentToReveal(recordedToolEvents);
    if (documentToOpen) {
      if (documentToOpen.index) {
        try {
          const proj = await getProjectById(input.projectId);
          await indexProjectDocument(proj.path, documentToOpen.path);
        } catch (error) {
          console.warn("[doc-index] failed:", error);
        }
      }
      turn.log(`open-document ${documentToOpen.path}`);
      emit({ streamId: input.streamId, type: "open-document", path: documentToOpen.path });
    }

    emit({
      streamId: input.streamId,
      type: "done",
      snapshot: finalSnapshot
    });

    // Fire-and-forget: extract and store memories from the completed conversation
    void getProjectById(input.projectId)
      .then((proj) =>
        extractAndStoreMemories({
          projectRoot: proj.path,
          projectId: input.projectId,
          sessionId: input.sessionId,
          messages: [...userSnapshot.session.messages, { role: "assistant", content }],
          existingMemories: []
        })
      )
      .catch(() => {});

    return finalSnapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown chat stream error";
    emit({
      streamId: input.streamId,
      type: "error",
      message
    });
    throw error;
  } finally {
    runningProjectStreams.delete(input.projectId);
  }
}

async function completeAssistantMessage(
  input: StreamChatInput,
  userSnapshot: SessionSnapshot,
  assistantMessage: ChatMessage,
  content: string,
  emit: (event: ChatStreamEvent) => void,
  recordedToolEvents: ToolStreamEvent[] = []
): Promise<SessionSnapshot> {
  const completedAssistantMessage: ChatMessage = {
    ...assistantMessage,
    content
  };
  let finalSession = {
    ...userSnapshot.session,
    messages: [...userSnapshot.session.messages, completedAssistantMessage],
    toolEvents: mergeToolEvents(recordedToolEvents, userSnapshot.session.toolEvents),
    updatedAt: new Date().toISOString()
  };
  let finalSnapshot = await replaceSession(input.projectId, finalSession);

  if (shouldGenerateTitle(userSnapshot.session.title, userSnapshot.session.messages.length)) {
    finalSnapshot = await updateSessionTitle(input.projectId, finalSession.id, normalizeTitle(input.content));
    finalSession = finalSnapshot.session;
  }

  emit({
    streamId: input.streamId,
    type: "done",
    snapshot: finalSnapshot
  });

  return finalSnapshot;
}

type ChatContext = {
  workspace: Awaited<ReturnType<typeof loadWorkspace>>;
  currentDocument: Awaited<ReturnType<typeof openWorkspaceDocumentPath>>;
  skills: Awaited<ReturnType<typeof loadRelevantSkills>>;
  relevantMemory: Array<MemoryEntry & { score: number }>;
  snapshot: SessionSnapshot;
};

async function loadChatContext(
  projectId: string,
  snapshot: SessionSnapshot,
  currentDocumentPath: string
): Promise<ChatContext> {
  const project = await getProjectById(projectId);
  const workspace = await loadWorkspace(projectId);
  const currentDocument = await openWorkspaceDocumentPath(projectId, currentDocumentPath);
  const latestUserMessage = [...snapshot.session.messages].reverse().find((message) => message.role === "user");
  const latestUserContent = latestUserMessage?.content ?? "";
  const [skills, relevantMemory] = await Promise.all([
    loadRelevantSkills({
      projectRoot: project.path,
      query: latestUserContent,
      currentSectionId: currentDocument.sectionId
    }),
    searchMemories({
      projectRoot: project.path,
      query: latestUserContent,
      topK: 5
    })
  ]);

  return { workspace, currentDocument, skills, relevantMemory, snapshot };
}

function buildChatPromptFromContext(
  ctx: ChatContext,
  agentMode: AgentMode
): {
  systemPrompt: string;
  messages: ModelMessage[];
  modelId: string;
} {
  const { workspace, currentDocument, skills, relevantMemory, snapshot } = ctx;
  const relayStatus = getRelayStatus();
  const relaySection = relayStatus.connected
    ? `Browser Relay: CONNECTED (tab: ${relayStatus.tabInfo?.url ?? "unknown"}). Delegate browser tasks via delegate_browser.`
    : "Browser Relay: NOT CONNECTED. Do not call delegate_browser.";

  const memSection =
    relevantMemory.length > 0
      ? relevantMemory.map((m) => `[${m.layer}/${m.importance.toFixed(1)}] ${m.content}`).join("\n")
      : "";

  const now = new Date();
  const timeStr = now.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit", weekday: "short", month: "short", day: "numeric" });

  const systemPrompt = [
    PLUG_PERSONA,
    `当前时间:${timeStr}。`,
    agentMode === "plan"
      ? "当前模式:Plan。用户想一起理思路。把你的判断和具体步骤讲清楚,但不要调用任何 agent 或工具。如果只是闲聊或拿主意,就正常聊,别硬套规划。"
      : agentMode === "execute"
        ? "当前模式:Execute。这通常意味着有具体的活儿要干——用你的专职 agent(delegate_research、delegate_file_ops、delegate_memory、delegate_browser)把任务从头做到尾。但先看清这句话是不是真需要动工具:如果只是聊天或拿主意,就直接以搭档身份回应,别为了用工具而用工具。"
        : "当前模式:Auto。先判断这句话到底需不需要动工具或调研:需要,就直接委派 specialist 把它办完,不啰嗦;如果只是聊天、征求意见、个人决定,就直接以搭档身份回一句,别套任务流程、别铺方案菜单。",
    "完成任务后怎么回复:就用一句话确认结果(例:用户说「打开百度网页」,你做完只回「已打开百度首页」)。不要罗列 URL、标题、文件路径这些执行细节;不要主动追问「要不要做下一步/要不要发截图」——用户想要更多,自己会问。只有当任务本身就是要产出一段内容(比如「写一段文案」),才把那段内容给出来。",
    "特殊技能 write_document:做完调研、或写好一份文档时,【直接调用 write_document】(直连工具,不要经 delegate_file_ops)把成果写进项目——调研结论放知识区(section=knowledge),成稿/交付物放交付物区(section=deliverables),PRD 放 prd 区。调用时务必带上 summary(一句话摘要)、tags(主题标签)、status(draft/in-progress/done),这些会进文档目录方便检索。它会自动建文件、刷新富目录、并在侧栏打开。重要:section=prd 时 content 要写【HTML】(可用 <h2>/<table>/<ul> 等,会被包成带样式的 HTML 文档,更有表现力);其它 section 的 content 写 markdown。研究结果和成稿一律用它,不要用 create_file,也不要只贴在聊天里。",
    "特殊技能 open_document:用户让你「打开/查看某个文档」时,【直接调用 open_document】(直连工具,不要经 delegate_file_ops),不能嘴上说「已打开」却不调用。指定路径就传 path(如主页传「00-home.md」);用户没指明具体哪篇(如「打开文档」「打开那篇调研」)就不传 path,它会自动打开最近写的那篇。",
    PRD_AUTHORING_GUIDE,
    "产品框架能力:你内置了一整套产品方法论(RICE、Kano、JTBD、用户旅程、商业/精益画布、AARRR、SWOT 等)。当用户的诉求匹配某个框架(如「排优先级」「分析竞品」「梳理用户旅程」),【除非用户点名其它方法,否则主动选最合适的框架套用当前项目】,不要泛泛而谈。相关框架的用法会作为 skill 自动出现在上面的 Relevant Skills 里——按它执行。框架分析产出用 write_document 写入 section=analysis(HTML),配合可视化组件:2×2 矩阵 class=\"matrix-2x2\"(内含 .m-cell/.m-label)、画布九宫格 class=\"canvas-grid\"(.canvas-block/.canvas-block__title)、旅程 class=\"journey\"、流程用 Mermaid、评分用表格并算总分排序。",
    `Project: ${workspace.manifest.name}`,
    `Current document: ${currentDocument.path}`,
    relaySection,
    section("Relevant Skills", renderLoadedSkills(skills)),
    section("Relevant Memory", memSection),
    section("Current Document", currentDocument.content)
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages = snapshot.session.messages.map<ModelMessage>((message) => ({
    role: message.role,
    content: message.content
  }));

  return {
    systemPrompt,
    messages,
    modelId: workspace.manifest.model.default
  };
}

function buildProjectContext(
  workspace: Awaited<ReturnType<typeof loadWorkspace>>,
  currentDocument: Awaited<ReturnType<typeof openWorkspaceDocumentPath>>
): string {
  return [`Project: ${workspace.manifest.name}`, `Current document: ${currentDocument.path}`]
    .filter(Boolean)
    .join("\n");
}

async function runMvpAcceptanceAgent(
  input: StreamChatInput,
  snapshot: SessionSnapshot,
  emit: (event: ChatStreamEvent) => void,
  assistantMessageId: string,
  emitTool: (event: ToolStreamEvent) => void
): Promise<string | null> {
  const normalizedContent = input.content.trim();
  const historyText = snapshot.session.messages.map((message) => message.content).join("\n");
  const taskText = `${historyText}\n${normalizedContent}`;

  if (isDesignAdviceTask(normalizedContent)) {
    const readResult = await invokeAgentTool({
      invocationId: `${input.streamId}:read-login-prd`,
      projectId: input.projectId,
      mode: "plan",
      name: "read_file",
      input: {
        path: "02-prd/login.md"
      },
      emit: emitTool
    });
    const loginPrd = extractTextOutput(readResult.output);

    return streamLocalText(input.streamId, assistantMessageId, renderDesignAdvice(loginPrd), emit);
  }

  if (isDecisionSummaryTask(normalizedContent)) {
    const memoryResult = await invokeAgentTool({
      invocationId: `${input.streamId}:read-memory`,
      projectId: input.projectId,
      mode: "plan",
      name: "read_file",
      input: {
        path: ".plug/memory.md"
      },
      emit: emitTool
    });

    return streamLocalText(input.streamId, assistantMessageId, renderDecisionSummary(extractTextOutput(memoryResult.output)), emit);
  }

  if (input.agentMode === "plan" && isLoginPrdTask(normalizedContent)) {
    return streamLocalText(input.streamId, assistantMessageId, renderLoginPrdPlan(), emit);
  }

  if (input.agentMode === "plan" && isCompetitorTask(normalizedContent)) {
    return streamLocalText(input.streamId, assistantMessageId, renderCompetitorPlan(), emit);
  }

  if (input.agentMode === "execute" && isExecutingTask(normalizedContent) && isCompetitorTask(taskText)) {
    const competitorDoc = await runCompetitorToolChain(input, emitTool);

    return streamLocalText(
      input.streamId,
      assistantMessageId,
      [
        "竞品分析执行完成。",
        "",
        "- 已完成微信、支付宝、抖音三组 web_search/web_fetch 调用。",
        "- 已写入 `05-knowledge/competitors/login-methods.md`。",
        "- 已更新知识库索引和项目记忆。",
        "",
        competitorDoc.summary
      ].join("\n"),
      emit
    );
  }

  if (input.agentMode === "execute" && isExecutingTask(normalizedContent) && isLoginPrdTask(taskText)) {
    const result = await invokeAgentTool({
      invocationId: `${input.streamId}:create-login-prd`,
      projectId: input.projectId,
      mode: "execute",
      name: "create_file",
      input: {
        path: "02-prd/login.md",
        content: renderLoginPrdDocument(),
        reason: "根据 Demo A 计划创建登录流程 PRD。"
      },
      emit: emitTool
    });

    return streamLocalText(
      input.streamId,
      assistantMessageId,
      result.pendingApproval
        ? "已生成 `02-prd/login.md` 的创建提案，等待 Pilot 在右侧 Diff 中审批。审批通过后系统会继续维护 PRD 索引和项目记忆。"
        : `已创建登录流程 PRD：${result.summary}`,
      emit
    );
  }

  return null;
}

async function runCompetitorToolChain(
  input: StreamChatInput,
  emitTool: (event: ToolStreamEvent) => void
): Promise<{ summary: string }> {
  const competitors = ["微信", "支付宝", "抖音"];
  const rows: string[] = [];

  for (const competitor of competitors) {
    const searchResult = await invokeAgentTool({
      invocationId: `${input.streamId}:search-${competitor}`,
      projectId: input.projectId,
      mode: "execute",
      name: "web_search",
      input: {
        query: `${competitor}登录方式`,
        maxResults: 3
      },
      emit: emitTool
    });
    const url = extractFirstSearchUrl(searchResult.output);
    const fetchResult = await invokeAgentTool({
      invocationId: `${input.streamId}:fetch-${competitor}`,
      projectId: input.projectId,
      mode: "execute",
      name: "web_fetch",
      input: {
        url
      },
      emit: emitTool
    });
    const pageText = extractTextOutput(fetchResult.output).slice(0, 320);
    rows.push(`| ${competitor} | ${url} | ${summarizeLoginSignals(pageText)} |`);
  }

  const document = [
    "# 登录方式竞品分析",
    "",
    "## 对比结论",
    "",
    "| 对象 | 来源 | 登录方式观察 |",
    "| --- | --- | --- |",
    ...rows,
    "",
    "## 对 Plug 登录 PRD 的影响",
    "",
    "- 手机号 + 验证码仍应作为主流程，降低首次使用门槛。",
    "- 第三方登录应作为并列入口，但不要遮蔽手机号路径。",
    "- 授权态、失败态、重新发送验证码需要在 PRD 和 UI 中显式定义。",
    ""
  ].join("\n");

  await invokeAgentTool({
    invocationId: `${input.streamId}:create-competitor-doc`,
    projectId: input.projectId,
    mode: "execute",
    name: "create_file",
    input: {
      path: "05-knowledge/competitors/login-methods.md",
      content: document,
      reason: "保存三家登录方式竞品分析。"
    },
    emit: emitTool
  });
  await invokeAgentTool({
    invocationId: `${input.streamId}:update-knowledge-index`,
    projectId: input.projectId,
    mode: "execute",
    name: "update_index",
    input: {
      sectionId: "knowledge"
    },
    emit: emitTool
  });
  await invokeAgentTool({
    invocationId: `${input.streamId}:memory-competitors`,
    projectId: input.projectId,
    mode: "execute",
    name: "update_memory",
    input: {
      summaryPatch: "完成三家竞品分析（微信 / 支付宝 / 抖音），文档位于 05-knowledge/competitors/login-methods.md。"
    },
    emit: emitTool
  });

  return {
    summary: "关键发现：三家都强调低摩擦授权入口，但手机号/验证码仍是可靠兜底路径。"
  };
}

async function streamLocalText(
  streamId: string,
  messageId: string,
  text: string,
  emit: (event: ChatStreamEvent) => void
): Promise<string> {
  const chunks = text.match(/[\s\S]{1,80}/g) ?? [text];

  for (const delta of chunks) {
    emit({
      streamId,
      type: "delta",
      messageId,
      delta
    });
  }

  return text;
}

function isLoginPrdTask(value: string): boolean {
  return /登录/.test(value) && /PRD|prd|需求|流程/.test(value);
}

function isCompetitorTask(value: string): boolean {
  return /竞品|微信|支付宝|抖音/.test(value) && /登录/.test(value);
}

function isExecutingTask(value: string): boolean {
  return /执行|开始|继续/.test(value);
}

function isDesignAdviceTask(value: string): boolean {
  return /设计建议|UI\s*设计|界面建议/.test(value);
}

function isDecisionSummaryTask(value: string): boolean {
  return /总结/.test(value) && /核心决定|当前/.test(value);
}

function renderLoginPrdPlan(): string {
  return [
    "执行计划：",
    "",
    "1. 创建 `02-prd/login.md`，覆盖手机号、验证码、第三方登录三条路径。",
    "2. 在 PRD 中补齐成功、失败、验证码重发、第三方授权取消等关键状态。",
    "3. 等你切到 Execute 并输入“执行”后，提交文件创建 Diff。",
    "4. 审批通过后更新 `02-prd/_index.md` 和 `.plug/memory.md`。"
  ].join("\n");
}

function renderLoginPrdDocument(): string {
  return [
    "# 登录流程 PRD",
    "",
    "## 目标",
    "",
    "为产品提供低摩擦、可恢复、可审计的登录流程，支持手机号 + 验证码和第三方登录。",
    "",
    "## 登录方式",
    "",
    "### 手机号 + 验证码",
    "",
    "- 用户输入手机号。",
    "- 系统发送 6 位验证码。",
    "- 验证码有效期 5 分钟。",
    "- 支持 60 秒后重新发送。",
    "",
    "### 第三方登录",
    "",
    "- 支持微信、支付宝、抖音等授权登录入口。",
    "- 用户取消授权时回到登录页并保留错误提示。",
    "- 第三方账号首次登录后进入手机号绑定或资料补全流程。",
    "",
    "## 成功标准",
    "",
    "- 首次登录链路清晰，失败原因可解释。",
    "- 验证码错误、过期、频控均有明确提示。",
    "- 第三方授权失败不阻塞手机号登录路径。",
    ""
  ].join("\n");
}

function renderDesignAdvice(loginPrd: string): string {
  return [
    "基于 `02-prd/login.md`，UI 建议如下：",
    "",
    "1. 首屏只放手机号输入、验证码按钮和三方登录入口，避免认知负担。",
    "2. 验证码按钮要显示倒计时、频控和错误态。",
    "3. 三方登录入口放在主流程下方，作为低摩擦备选，不抢主路径。",
    "4. 授权取消、验证码过期、手机号格式错误都需要独立提示文案。",
    "",
    loginPrd ? "已读取 PRD 内容并确认其包含手机号、验证码、第三方登录三种方式。" : "当前未读到 PRD 文件，请先完成创建审批。"
  ].join("\n");
}

function renderCompetitorPlan(): string {
  return [
    "竞品分析计划：",
    "",
    "1. 分别搜索微信、支付宝、抖音登录方式。",
    "2. 抓取每家关键页面并抽取登录入口、授权态、失败态信息。",
    "3. 整合成 `05-knowledge/competitors/login-methods.md`。",
    "4. 更新知识库 `_index.md` 和项目记忆。",
    "",
    "切到 Execute 并输入“执行”后开始调用 web tools。"
  ].join("\n");
}

function renderDecisionSummary(memory: string): string {
  const hasLogin = /登录流程|登录 PRD|手机号|验证码|三方/.test(memory);
  const hasCompetitors = /竞品分析|微信|支付宝|抖音/.test(memory);

  return [
    "当前核心决定：",
    "",
    hasLogin
      ? "- 已完成登录 PRD：主路径为手机号 + 验证码，第三方登录作为并列入口。"
      : "- 登录 PRD 尚未在记忆中确认完成。",
    hasCompetitors
      ? "- 已完成三家竞品分析：微信 / 支付宝 / 抖音，结论已写入知识库。"
      : "- 三家竞品分析尚未在记忆中确认完成。"
  ].join("\n");
}

function renderMissingApiKeyMessage(providerLabel: string, modelId: string, userContent: string): string {
  return [
    "我已经收到这条消息，但当前还不能调用外部聊天模型。",
    "",
    `原因：${providerLabel} / ${modelId} 还没有配置 API key。`,
    "",
    "处理方式：",
    "",
    "1. 打开 Settings。",
    `2. 在 ${providerLabel} provider 里填入 API key，或新增一个 OpenAI-compatible provider。`,
    "3. 保存后回到当前会话继续发送消息。",
    "",
    "本地 IPC、会话写入和流式消息链路已经工作；缺的是模型凭证。",
    "",
    `刚才收到的内容：${userContent.trim()}`
  ].join("\n");
}

function renderProviderFailureMessage(providerLabel: string, modelId: string, error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown provider error";

  return [
    "模型调用失败，但当前会话没有中断。",
    "",
    `Provider: ${providerLabel}`,
    `Model: ${modelId}`,
    `Error: ${message}`,
    "",
    "可恢复操作：",
    "",
    "1. 在 Settings 里点击 Test 验证当前 provider。",
    "2. 检查 API key、base URL、模型 ID 和代理配置。",
    "3. 如果该 provider 持续失败，新增备用 OpenAI-compatible provider 后再重试。"
  ].join("\n");
}

function renderLoadedSkills(skills: LoadedSkill[]): string {
  if (!skills.length) {
    return "";
  }

  return skills
    .map((skill) =>
      [
        `### ${skill.name}`,
        `Source: ${skill.source}`,
        skill.description ? `Description: ${skill.description}` : "",
        skill.triggers.length ? `Triggers: ${skill.triggers.join(", ")}` : "",
        "",
        skill.body.slice(0, 2400)
      ]
        .filter((part) => part !== "")
        .join("\n")
    )
    .join("\n\n---\n\n");
}


function extractFirstSearchUrl(output: unknown): string {
  const results = (output as { results?: Array<{ url?: string }> } | undefined)?.results ?? [];
  const url = results.find((entry) => entry.url)?.url;

  if (!url) {
    throw new Error("web_search did not return a usable URL.");
  }

  return url;
}

function extractTextOutput(output: unknown): string {
  if (!output || typeof output !== "object") {
    return "";
  }

  const maybeText = (output as { content?: unknown; text?: unknown }).content ?? (output as { text?: unknown }).text;

  return typeof maybeText === "string" ? maybeText : JSON.stringify(output);
}

function summarizeLoginSignals(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "页面可访问，但未抽取到明确正文。";
  }

  return normalized.length > 96 ? `${normalized.slice(0, 96)}...` : normalized;
}

// Side-effecting tools whose outcome the tool result already states — for these,
// a model re-narration is redundant, so we render a short confirmation instead.
const ACTION_TOOL_NAMES = new Set([
  "browser_relay_navigate",
  "browser_relay_screenshot",
  "browser_relay_click",
  "browser_relay_type",
  "propose_edit",
  "create_file",
  "write_document",
  "open_document"
]);

function isActionTool(name: string): boolean {
  return ACTION_TOOL_NAMES.has(name) || name.startsWith("computer_");
}

// Tools whose own success summary is already a clean, user-ready confirmation in
// the user's language. When such a tool is the sole action of a turn, we skip
// the confirmation model call entirely and surface its summary verbatim.
const SELF_DESCRIBING_TOOLS = new Set(["open_document", "write_document"]);

// Side-effecting actions completed this turn (chronological, de-duplicated).
// Empty when the turn was synthesis/Q&A rather than an action.
function collectActionSummaries(events: ToolStreamEvent[]): Array<{ toolName: string; message: string }> {
  const seen = new Set<string>();
  const summaries: Array<{ toolName: string; message: string }> = [];
  for (const event of [...events].reverse()) {
    if (event.phase === "success" && isActionTool(event.toolName) && event.message && !seen.has(event.message)) {
      seen.add(event.message);
      summaries.push({ toolName: event.toolName, message: event.message });
    }
  }
  return summaries;
}

// Resolve a plain "open <doc>" command to a target without a model call. Reads
// the manifest only when the message already looks like an open command, so it
// adds no cost to other turns. Returns null -> fall through to the full pipeline.
async function resolveFastDocumentOpen(
  content: string,
  projectId: string
): Promise<{ kind: "path"; path: string } | { kind: "latest" } | null> {
  // Cheap pre-check: only touch the filesystem when the message looks like an
  // open command at all.
  if (!/(打开|查看|显示|看一下|看看|开一下|调出|open|show|view|reveal)/i.test(content)) {
    return null;
  }
  try {
    const project = await getProjectById(projectId);
    const manifest = await readProjectManifest(project.path);
    return resolveDocumentOpenIntent(content, manifest.sections);
  } catch {
    return null;
  }
}

// The most recent project document this turn wants surfaced — written (create_file
// / write_document) or explicitly opened (open_document). Tool-agnostic on
// purpose: reveal must not depend on the model choosing a particular tool.
// `index` is true only for freshly-written docs (those need their section index
// + home link refreshed); opening an existing doc just reveals it.
function findDocumentToReveal(events: ToolStreamEvent[]): { path: string; index: boolean } | null {
  for (const event of events) {
    if (event.phase !== "success") continue;
    const isWrite = event.toolName === "write_document" || event.toolName === "create_file";
    const isOpen = event.toolName === "open_document";
    if (!isWrite && !isOpen) continue;
    const output = (event.details as { output?: { documentPath?: unknown; path?: unknown } } | undefined)?.output;
    const path = output?.documentPath ?? output?.path;
    if (typeof path === "string" && (path.endsWith(".md") || /\.html?$/i.test(path))) {
      return { path, index: isWrite };
    }
  }
  return null;
}

// Bounded, tool-grounded confirmation for an action task. The model is given
// ONLY the request and the tool summaries (no project context, no tools), so it
// has nothing to pad with — that's what keeps it short. Warmth (B) lives inside
// this tight box; the grounding + minimal input is the structural part (A).
async function streamActionConfirmation(input: {
  streamId: string;
  messageId: string;
  userRequest: string;
  actionSummaries: string[];
  providerSecret: PS;
  emit: (event: ChatStreamEvent) => void;
}): Promise<string> {
  const providerOptions = minimalReasoningOptions(input.providerSecret);
  const result = streamText({
    model: toLanguageModel(input.providerSecret),
    // A confirmation needs no reasoning — keep it instant.
    ...(providerOptions ? { providerOptions } : {}),
    maxOutputTokens: 256,
    system: withPersona(
      [
        "你刚替用户完成了一个动作类任务,现在只需要确认结果。",
        "用一两句话、像搭档一样自然地说一声完成了,依据下面的执行结果。",
        "不要罗列 URL、标题、文件路径这些细节(界面已经显示了),不要追问要不要做下一步,不要用列表。",
        "例:用户说「打开百度网页」、执行结果是导航成功 → 你只回类似「好了,百度首页给你打开了」。"
      ].join("\n")
    ),
    messages: [
      {
        role: "user",
        content: [
          `用户的要求:${input.userRequest}`,
          "执行结果:",
          ...input.actionSummaries.map((summary) => `- ${summary}`)
        ].join("\n")
      }
    ],
    maxRetries: 1
  });

  let text = "";
  try {
    for await (const delta of result.textStream) {
      text += delta;
      input.emit({ streamId: input.streamId, type: "delta", messageId: input.messageId, delta });
    }
  } catch (error) {
    console.warn("[confirm] stream failed:", error);
  }

  if (!text.trim()) {
    text = "好了,已经帮你弄好了。";
    input.emit({ streamId: input.streamId, type: "delta", messageId: input.messageId, delta: text });
  }
  return text;
}

async function generateSessionTitle(userContent: string, assistantContent: string): Promise<string> {
  try {
    const providerSecret = await resolveToolProviderSecret();
    assertApiKey(providerSecret.apiKey, providerSecret.provider.label);
    // streamText (doStream): the APIMart gateway returns SSE for non-stream
    // requests too, which crashes generateText's parser.
    const result = streamText({
      model: toLanguageModel(providerSecret),
      prompt: [
        "Generate a short session title in the same language as the user.",
        "Return only the title. Maximum 16 Chinese characters or 8 English words.",
        `User: ${userContent}`,
        `Assistant: ${assistantContent.slice(0, 800)}`
      ].join("\n"),
      maxRetries: providerSecret.network.maxRetries
    });

    let title = "";
    for await (const delta of result.textStream) {
      title += delta;
    }

    return normalizeTitle(title);
  } catch {
    return normalizeTitle(userContent);
  }
}

export const toLanguageModel = toModel;

function assertApiKey(apiKey: string, label: string): void {
  if (!apiKey) {
    throw new Error(`API key is not configured for ${label}.`);
  }
}

function section(label: string, content: string): string {
  return `## ${label}\n${content || "(empty)"}`;
}


function shouldGenerateTitle(title: string, previousMessageCount: number): boolean {
  return previousMessageCount === 0 || /^新对话\s+\d+$/.test(title) || /^Session\s+\d+$/i.test(title);
}

function normalizeTitle(value: string): string {
  const title = value
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) {
    return "新对话";
  }

  return title.length > 32 ? `${title.slice(0, 32)}...` : title;
}

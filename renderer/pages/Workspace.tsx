import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactElement } from "react";
import type {
  AgentMode,
  AppInfo,
  ChatMessage,
  CustomPromptApp,
  PendingToolApproval,
  PromptAppDraft,
  ProjectSection,
  SessionSnapshot,
  ToolDescriptor,
  ToolStreamEvent,
  WorkspaceSnapshot
} from "../../shared/types";
import { MarkdownViewer } from "../components/MarkdownViewer";
import { HUDPanel, NumericText, StatusDot } from "../components/hud";
import { playUiSound } from "../services/audio-service";
import { startRecording, stopAndTranscribe } from "../services/whisper-service";
import { useChatScroll } from "../hooks/useChatScroll";
import "./workspace.css";

const EMPTY_MESSAGES: ChatMessage[] = [];

function isHtmlDocument(path: string): boolean {
  return /\.html?$/i.test(path);
}

// Hide a leading YAML front-matter block from the rendered markdown view.
function stripFrontMatter(content: string): string {
  const match = content.match(/^﻿?---\s*\n[\s\S]*?\n---\s*\n?/);
  return match ? content.slice(match[0].length) : content;
}

const MarkdownEditor = lazy(async () => {
  const module = await import("../components/MarkdownEditor");
  return { default: module.MarkdownEditor };
});

type WorkspaceProps = {
  appInfo: AppInfo | null;
  workspace: WorkspaceSnapshot;
  statusMessage: string | null;
  error: string | null;
  revealDocumentNonce?: number;
  onBackToLauncher: () => void;
  onOpenSection: (sectionId: string) => Promise<void> | void;
  onOpenDocumentPath: (path: string, fromPath: string) => Promise<void> | void;
  onSaveDocument: (path: string, content: string) => Promise<void> | void;
  onShowSettings: () => void;
  sessionSnapshot: SessionSnapshot | null;
  chatRunning: boolean;
  agentMode: AgentMode;
  toolDescriptors: ToolDescriptor[];
  toolEvents: ToolStreamEvent[];
  customPromptApps: CustomPromptApp[];
  promptAppsPath: string | null;
  pendingApprovals: PendingToolApproval[];
  activeApproval: PendingToolApproval | null;
  onSelectApproval: (approvalId: string) => void;
  onResolveApproval: (approvalId: string, decision: "approve" | "reject") => Promise<void> | void;
  onSetAgentMode: (mode: AgentMode) => Promise<void> | void;
  onCreateSession: () => Promise<void> | void;
  onOpenSession: (sessionId: string) => Promise<void> | void;
  onRenameSession: (sessionId: string, title: string) => Promise<void> | void;
  onUpsertPromptApp: (draft: PromptAppDraft) => Promise<CustomPromptApp[]> | CustomPromptApp[];
  onDeletePromptApp: (id: string) => Promise<CustomPromptApp[]> | CustomPromptApp[];
  onReloadPromptApps: () => Promise<CustomPromptApp[]> | CustomPromptApp[];
  onSendMessage: (content: string) => Promise<void> | void;
  thinkingByMessageId?: Record<string, string>;
};

type WorkspaceStyle = CSSProperties & {
  "--workspace-right-width": string;
};

const DOC_PANEL_MIN = 320;
const DOC_PANEL_MAX = 960;

type PromptAppField = {
  id: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
};

type PromptAppDefinition = {
  id: string;
  name: string;
  description: string;
  outputSection: string;
  fields: PromptAppField[];
  source: "built-in" | "custom";
  customApp?: CustomPromptApp;
  renderPrompt: (values: Record<string, string>) => string;
};

const BUILT_IN_PROMPT_APPS: PromptAppDefinition[] = [
  {
    id: "write-prd",
    name: "写 PRD",
    description: "把一个功能想法整理成可执行 PRD，并归档到 PRD 区。",
    outputSection: "02-prd",
    source: "built-in",
    fields: [
      { id: "feature", label: "Feature", placeholder: "手机号验证码登录" },
      { id: "userRole", label: "User Role", placeholder: "首次使用产品的普通用户" },
      { id: "goal", label: "Goal", placeholder: "降低首次登录阻力并保证失败态清晰", multiline: true }
    ],
    renderPrompt: (values) =>
      [
        `请为「${values.feature || "未命名功能"}」写一份 PRD。`,
        "",
        `目标用户：${values.userRole || "待定义用户"}`,
        `目标：${values.goal || "请根据项目目的补齐"}`,
        "",
        "要求：",
        "1. 先给执行计划，不要直接写文件，除非我切到 Execute。",
        "2. PRD 需要包含目标、范围、用户故事、主流程、异常态、验收标准。",
        "3. 如果进入 Execute，请优先写入 `02-prd/` 并维护 `_index.md` 和项目记忆。"
      ].join("\n")
  },
  {
    id: "competitor-analysis",
    name: "竞品分析",
    description: "生成竞品研究任务提示，适合配合 web_search / web_fetch。",
    outputSection: "05-knowledge",
    source: "built-in",
    fields: [
      { id: "competitors", label: "Competitors", placeholder: "微信、支付宝、抖音" },
      { id: "scope", label: "Scope", placeholder: "登录方式、授权态、失败态", multiline: true }
    ],
    renderPrompt: (values) =>
      [
        `请做竞品分析：${values.competitors || "待分析竞品"}。`,
        "",
        `分析范围：${values.scope || "核心流程、关键状态、对本项目的影响"}`,
        "",
        "要求：",
        "1. Plan 模式先列搜索和抓取计划。",
        "2. Execute 模式调用 web tools 后，把结论整理到 `05-knowledge/competitors/`。",
        "3. 输出需要包含对比表、关键发现、对当前 PRD/设计的影响。"
      ].join("\n")
  },
  {
    id: "release-notes",
    name: "写 Release Notes",
    description: "把版本变更整理成可交付发布说明。",
    outputSection: "06-deliverables",
    source: "built-in",
    fields: [
      { id: "version", label: "Version", placeholder: "v0.2.0" },
      { id: "changes", label: "Key Changes", placeholder: "新增登录 PRD、竞品分析、审批流", multiline: true }
    ],
    renderPrompt: (values) =>
      [
        `请为 ${values.version || "当前版本"} 写 release notes。`,
        "",
        `关键变更：${values.changes || "请从项目记忆和当前文档中整理"}`,
        "",
        "要求：",
        "1. 面向真实用户，不写内部实现流水账。",
        "2. 分为新增、改进、修复、已知限制。",
        "3. Execute 模式下归档到 `06-deliverables/`。"
      ].join("\n")
  }
];

export function Workspace({
  appInfo,
  workspace,
  statusMessage,
  error,
  revealDocumentNonce = 0,
  onBackToLauncher,
  onOpenSection,
  onOpenDocumentPath,
  onSaveDocument,
  onShowSettings,
  sessionSnapshot,
  chatRunning,
  agentMode,
  toolDescriptors,
  toolEvents,
  customPromptApps,
  promptAppsPath,
  pendingApprovals,
  activeApproval,
  onSelectApproval,
  onResolveApproval,
  onSetAgentMode,
  onCreateSession,
  onOpenSession,
  onRenameSession,
  onUpsertPromptApp,
  onDeletePromptApp,
  onReloadPromptApps,
  onSendMessage,
  thinkingByMessageId = {}
}: WorkspaceProps): ReactElement {
  const [docPanelCollapsed, setDocPanelCollapsed] = useState(true);
  const [navPanelCollapsed, setNavPanelCollapsed] = useState(true);
  const [docPanelWidth, setDocPanelWidth] = useState(380);
  const [documentMode, setDocumentMode] = useState<"read" | "edit">("read");
  const [draftContent, setDraftContent] = useState(workspace.document.content);
  const [documentNotice, setDocumentNotice] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [titleDraft, setTitleDraft] = useState(sessionSnapshot?.session.title ?? "");
  const [authorizationModalOpen, setAuthorizationModalOpen] = useState(false);
  const [missionControlState, setMissionControlState] = useState<"active" | "paused" | "override" | "aborted">("active");
  const [overrideDraft, setOverrideDraft] = useState("");
  const [soundMuted, setSoundMuted] = useState(false);
  const [soundVolume, setSoundVolume] = useState(0.3);
  const [promptAppsOpen, setPromptAppsOpen] = useState(false);
  const [selectedPromptAppId, setSelectedPromptAppId] = useState(BUILT_IN_PROMPT_APPS[0]?.id ?? "");
  const [promptAppValues, setPromptAppValues] = useState<Record<string, string>>({});
  const [dismissedTraceVersion, setDismissedTraceVersion] = useState("");
  const [missionPanelOpen, setMissionPanelOpen] = useState(false);
  const [navMode, setNavMode] = useState<"sections" | "system">("sections");
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

  // When the agent writes a document, reveal the side panel so it's visible.
  useEffect(() => {
    if (revealDocumentNonce > 0) {
      setDocPanelCollapsed(false);
    }
  }, [revealDocumentNonce]);

  // Drag the divider on the doc panel's left edge to resize it. The panel hugs
  // the right edge, so width = viewport width minus the pointer's X.
  const startDocResize = useCallback((event: ReactPointerEvent) => {
    event.preventDefault();
    // Capture the pointer to the handle so move/up events still arrive even when
    // the cursor passes over the document iframe (which would otherwise swallow
    // them and leave the drag stuck "on").
    const handle = event.currentTarget as HTMLElement;
    const pointerId = event.pointerId;
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // pointer capture unsupported — listeners below still work for non-iframe
    }
    const onMove = (move: PointerEvent) => {
      const next = Math.round(window.innerWidth - move.clientX);
      setDocPanelWidth(Math.max(DOC_PANEL_MIN, Math.min(DOC_PANEL_MAX, next)));
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // already released
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const chatMessages = sessionSnapshot?.session.messages ?? EMPTY_MESSAGES;
  const chatScroll = useChatScroll({
    total: chatMessages.length,
    streamTick: chatMessages[chatMessages.length - 1]?.content.length ?? 0,
    sessionKey: sessionSnapshot?.activeSessionId ?? null
  });

  const activeSection = useMemo(
    () => workspace.manifest.sections.find((section) => section.id === workspace.document.sectionId),
    [workspace.document.sectionId, workspace.manifest.sections]
  );
  const documentDirty = draftContent !== workspace.document.content;
  const shellStyle: WorkspaceStyle = {
    "--workspace-right-width": `${docPanelWidth}px`
  };
  const shellClasses = [
    "workspace-shell",
    navPanelCollapsed ? "workspace-shell--nav-collapsed" : "",
    docPanelCollapsed ? "workspace-shell--doc-collapsed" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const runtimeLabel = appInfo ? `${appInfo.environment} v${appInfo.version}` : "runtime pending";
  const lastToolEvent = toolEvents[0] ?? null;
  const readToolCount = toolDescriptors.filter((tool) => tool.aiWriteLevel === "read").length;
  const mission = useMemo(
    () => buildMissionState(toolEvents, pendingApprovals, missionControlState),
    [missionControlState, pendingApprovals, toolEvents]
  );
  const traceVersion = useMemo(() => buildTraceVersion(toolEvents, pendingApprovals), [pendingApprovals, toolEvents]);
  const traceDismissed = Boolean(traceVersion && dismissedTraceVersion === traceVersion);
  const traceVisible = Boolean(traceVersion && !traceDismissed);
  const activeApprovalId = activeApproval?.id ?? null;
  const promptAppDefinitions = useMemo(
    () => [...BUILT_IN_PROMPT_APPS, ...customPromptApps.map(toPromptAppDefinition)],
    [customPromptApps]
  );
  const selectedPromptApp =
    promptAppDefinitions.find((promptApp) => promptApp.id === selectedPromptAppId) ?? promptAppDefinitions[0];
  const missionStatusText = mission
    ? `${mission.status.toUpperCase()} · ${mission.steps.length} STEPS PLANNED · ${mission.completedCount} COMPLETE`
    : null;

  useEffect(() => {
    setDocumentMode("read");
    setDraftContent(workspace.document.content);
    setDocumentNotice(null);
  }, [workspace.document.content, workspace.document.path]);

  useEffect(() => {
    setTitleDraft(sessionSnapshot?.session.title ?? "");
  }, [sessionSnapshot?.session.title]);

  useEffect(() => {
    if (promptAppDefinitions.length && !promptAppDefinitions.some((promptApp) => promptApp.id === selectedPromptAppId)) {
      setSelectedPromptAppId(promptAppDefinitions[0].id);
      setPromptAppValues({});
    }
  }, [promptAppDefinitions, selectedPromptAppId]);

  useEffect(() => {
    if (!activeApprovalId) {
      setAuthorizationModalOpen(false);
      return;
    }

    setAuthorizationModalOpen(true);
    playUiSound("approval-required", { muted: soundMuted, volume: soundVolume });
  }, [activeApprovalId, soundMuted, soundVolume]);

  useEffect(() => {
    if (!lastToolEvent) {
      return;
    }

    if (lastToolEvent.phase === "success") {
      playUiSound("tool-success", { muted: soundMuted, volume: soundVolume });
    }

    if (lastToolEvent.phase === "error") {
      playUiSound("tool-failure", { muted: soundMuted, volume: soundVolume });
    }
  }, [lastToolEvent, soundMuted, soundVolume]);

  useEffect(() => {
    if (!traceVersion) {
      setDismissedTraceVersion("");
    }
  }, [traceVersion]);

  // Auto-dismiss historical trace when a session is first loaded or switched and no chat is running.
  // This prevents the mission panel from re-appearing every time the app restarts with persisted tool events.
  const sessionId = sessionSnapshot?.session.id;
  useEffect(() => {
    setMissionPanelOpen(false);
    if (!chatRunning && traceVersion) {
      setDismissedTraceVersion(traceVersion);
    }
    // Intentionally only run when session identity changes, not on every traceVersion tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    function handleWorkspaceShortcut(event: globalThis.KeyboardEvent): void {
      const isCommand = event.metaKey || event.ctrlKey;

      if (!isCommand) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "b") {
        event.preventDefault();
        setNavPanelCollapsed((current) => !current);
      }

      if (key === "\\") {
        event.preventDefault();
        setDocPanelCollapsed((current) => !current);
      }
    }

    window.addEventListener("keydown", handleWorkspaceShortcut);
    return () => window.removeEventListener("keydown", handleWorkspaceShortcut);
  }, [agentMode, onSetAgentMode, soundMuted, soundVolume]);

  useEffect(() => {
    function handleAuthorizationShortcut(event: globalThis.KeyboardEvent): void {
      if (!authorizationModalOpen || !activeApproval) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key !== "y" && key !== "n") {
        return;
      }

      event.preventDefault();
      void resolveActiveApproval(key === "y" ? "approve" : "reject");
    }

    window.addEventListener("keydown", handleAuthorizationShortcut);
    return () => window.removeEventListener("keydown", handleAuthorizationShortcut);
  }, [activeApproval, authorizationModalOpen]);

  const openLinkedDocument = useCallback(
    async (path: string): Promise<void> => {
      setDocPanelCollapsed(false);
      await onOpenDocumentPath(path, workspace.document.path);
    },
    [onOpenDocumentPath, workspace.document.path]
  );

  const handleOpenSection = useCallback(
    async (sectionId: string): Promise<void> => {
      setDocPanelCollapsed(false);
      await onOpenSection(sectionId);
    },
    [onOpenSection]
  );

  const copyDocument = useCallback(async (): Promise<void> => {
    const content = documentMode === "edit" ? draftContent : workspace.document.content;

    try {
      await navigator.clipboard.writeText(content);
      setDocumentNotice("Copied document markdown.");
    } catch {
      setDocumentNotice("Clipboard is unavailable in this runtime.");
    }
  }, [documentMode, draftContent, workspace.document.content]);

  const saveDocument = useCallback(async (): Promise<void> => {
    try {
      await onSaveDocument(workspace.document.path, draftContent);
      setDocumentMode("read");
      setDocumentNotice("Saved document.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown document save error";
      setDocumentNotice(message);
    }
  }, [draftContent, onSaveDocument, workspace.document.path]);

  const cancelEdit = useCallback((): void => {
    setDraftContent(workspace.document.content);
    setDocumentMode("read");
    setDocumentNotice("Discarded local edits.");
  }, [workspace.document.content]);

  const submitChat = useCallback(async (): Promise<void> => {
    const content = chatInput.trim();

    if (!content || chatRunning || !sessionSnapshot) {
      return;
    }

    setChatInput("");
    await onSendMessage(content);
  }, [chatInput, chatRunning, onSendMessage, sessionSnapshot]);

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitChat();
    }
  }

  async function handleMicToggle(): Promise<void> {
    if (isRecording) {
      const recorder = recorderRef.current;
      if (!recorder) {
        return;
      }
      setIsRecording(false);
      recorderRef.current = null;
      try {
        const config = await window.plug?.invoke("whisper.getConfig", {});
        if (!config) {
          return;
        }
        const text = await stopAndTranscribe(recorder, config.apiKey, config.baseURL);
        if (text) {
          setChatInput((prev) => (prev ? `${prev} ${text}` : text));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Voice transcription failed";
        console.error("[whisper]", message);
      }
    } else {
      try {
        const recorder = await startRecording();
        recorderRef.current = recorder;
        setIsRecording(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Microphone access denied";
        console.error("[whisper]", message);
      }
    }
  }

  async function handleRenameSession(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();

    if (!sessionSnapshot) {
      return;
    }

    const title = titleDraft.trim();

    if (title && title !== sessionSnapshot.session.title) {
      await onRenameSession(sessionSnapshot.session.id, title);
    }
  }

  async function switchAgentMode(mode: AgentMode): Promise<void> {
    if (mode === agentMode) {
      return;
    }

    playUiSound("mode-switch", { muted: soundMuted, volume: soundVolume });
    await onSetAgentMode(mode);
  }

  async function resolveActiveApproval(decision: "approve" | "reject"): Promise<void> {
    if (!activeApproval) {
      return;
    }

    playUiSound(decision === "approve" ? "approval-accepted" : "approval-rejected", {
      muted: soundMuted,
      volume: soundVolume
    });
    await onResolveApproval(activeApproval.id, decision);
    setAuthorizationModalOpen(false);
  }

  function handleMissionControl(action: "pause" | "override" | "abort"): void {
    playUiSound("mission-control", { muted: soundMuted, volume: soundVolume });

    if (action === "pause") {
      setMissionControlState((current) => (current === "paused" ? "active" : "paused"));
      return;
    }

    if (action === "override") {
      setMissionControlState("override");
      return;
    }

    setMissionControlState("aborted");
  }

  function insertPromptAppPrompt(): void {
    if (!selectedPromptApp) {
      return;
    }

    setChatInput(selectedPromptApp.renderPrompt(promptAppValues));
    setPromptAppsOpen(false);
    playUiSound("mission-control", { muted: soundMuted, volume: soundVolume });
  }

  return (
    <main className={shellClasses} style={shellStyle}>
      <header className="workspace-topbar">
        <button className="workspace-wordmark" type="button" onClick={onBackToLauncher}>
          <span className="workspace-wordmark__mark">PL</span>
          <span>
            <strong>Plug</strong>
            <em>{workspace.project.name}</em>
          </span>
        </button>

        <div className="workspace-topbar__readouts" aria-label="Workspace instrumentation">
          <Metric label="SYNC" value="LOCAL" tone="complete" />
          <Metric label="MODEL" value={workspace.manifest.model.default} tone="running" />
          <Metric label="PLAN" value={workspace.manifest.model.planning} tone="pending" />
          <Metric label="APP" value={runtimeLabel} tone="pending" />
        </div>
        <button className="workspace-icon-button" type="button" onClick={onShowSettings}>
          Settings
        </button>
      </header>

      <div className="workspace-shell__main">
        <aside className="workspace-nav" aria-label="Project sections">
          {/* Dual-zone rail: SECTIONS (top) and SYS (bottom) */}
          <div className="workspace-nav__rail-wrap">
            <button
              className="workspace-nav__rail-section"
              type="button"
              title="Hover to preview sections, click to pin"
              onMouseEnter={() => setNavMode("sections")}
              onClick={() => { setNavMode("sections"); setNavPanelCollapsed(false); }}
            >
              Sections
            </button>
            <button
              className={navMode === "system" ? "workspace-nav__rail-sys workspace-nav__rail-sys--active" : "workspace-nav__rail-sys"}
              type="button"
              title="Hover to view system status"
              onMouseEnter={() => setNavMode("system")}
              onClick={() => setNavMode("system")}
            >
              SYS
            </button>
          </div>

          <div className="workspace-nav__panel">
              <div className="workspace-nav__header">
                <span className="hud-label">{navMode === "system" ? "System" : "Sections"}</span>
                <div className="workspace-nav__header-actions">
                  {navMode === "sections" ? (
                    <NumericText>{workspace.manifest.sections.length.toString().padStart(2, "0")}</NumericText>
                  ) : null}
                  <button
                    className="workspace-icon-button"
                    type="button"
                    title={navPanelCollapsed ? "Pin panel" : "Collapse panel"}
                    onClick={() => setNavPanelCollapsed((current) => !current)}
                  >
                    {navPanelCollapsed ? "Pin" : "Hide"}
                  </button>
                </div>
              </div>

              <div className="workspace-nav__scroll">
                {navMode === "sections" ? (
                  <nav className="workspace-section-list">
                    {workspace.manifest.sections.map((section) => (
                      <SectionButton
                        key={section.id}
                        section={section}
                        active={section.id === workspace.document.sectionId}
                        onOpenSection={handleOpenSection}
                      />
                    ))}
                  </nav>
                ) : (
                  <div className="workspace-system-section">
                    <div className="workspace-nav__instrument-row">
                      <span>MCP</span>
                      <NumericText muted>00/00</NumericText>
                    </div>
                    <div className="workspace-nav__instrument-row">
                      <span>TOOLS</span>
                      <NumericText muted>{toolDescriptors.length.toString().padStart(2, "0")}</NumericText>
                    </div>
                    <div className="workspace-nav__instrument-row">
                      <span>MODE</span>
                      <StatusDot status="complete" label="auto" />
                    </div>
                    <div className="workspace-nav__instrument-row">
                      <span>AUTH</span>
                      <NumericText muted>{pendingApprovals.length.toString().padStart(2, "0")}</NumericText>
                    </div>
                    <div className="workspace-tool-list" aria-label="Enabled tools">
                      {toolDescriptors.map((tool) => (
                        <div className="workspace-tool-row" key={tool.name}>
                          <span>{tool.name}</span>
                          <em>{tool.aiWriteLevel}</em>
                        </div>
                      ))}
                    </div>
                    {lastToolEvent ? (
                      <div className="workspace-tool-event">
                        <StatusDot
                          status={lastToolEvent.phase === "error" ? "error" : lastToolEvent.phase === "success" ? "complete" : "running"}
                          label={lastToolEvent.phase}
                        />
                        <p>{lastToolEvent.message}</p>
                      </div>
                    ) : null}
                    <div className="workspace-sound-controls" aria-label="Sound controls">
                      <button
                        className={soundMuted ? "workspace-icon-button workspace-icon-button--active" : "workspace-icon-button"}
                        type="button"
                        onClick={() => setSoundMuted((current) => !current)}
                      >
                        {soundMuted ? "SFX OFF" : "SFX ON"}
                      </button>
                      <label>
                        <span>VOL</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={soundVolume}
                          onChange={(event) => setSoundVolume(Number(event.target.value))}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className="workspace-nav__footer">
                <NumericText muted>{toolDescriptors.length.toString().padStart(2, "0")}</NumericText>
                <StatusDot status="complete" label="auto" />
              </div>
          </div>
        </aside>

        <section className="workspace-center" aria-label="Conversation">
          <div className="workspace-center__session-bar">
            <form className="workspace-session-editor" onSubmit={(event) => void handleRenameSession(event)}>
              <span className="hud-label">Session</span>
              <div className="workspace-session-editor__row">
                <select
                  value={sessionSnapshot?.activeSessionId ?? ""}
                  disabled={!sessionSnapshot || chatRunning}
                  onChange={(event) => void onOpenSession(event.target.value)}
                >
                  {sessionSnapshot?.sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.title}
                    </option>
                  ))}
                </select>
                <input
                  value={titleDraft}
                  disabled={!sessionSnapshot || chatRunning}
                  onBlur={() => void handleRenameSession()}
                  onChange={(event) => setTitleDraft(event.target.value)}
                />
                <button className="workspace-icon-button" type="button" disabled={chatRunning} onClick={() => void onCreateSession()}>
                  New
                </button>
              </div>
            </form>
            <div className="workspace-mode-cluster" aria-label="Agent mode">
              <span className="hud-label">Mode</span>
              <span className="workspace-mode-auto">AUTO</span>
              <NumericText muted>{`${readToolCount}/${toolDescriptors.length}`}</NumericText>
            </div>
            <StatusDot status={error ? "error" : chatRunning ? "running" : "complete"} label={error ? "blocked" : chatRunning ? "streaming" : "ready"} />
          </div>

          <div className="workspace-center__body">
            <HUDPanel className="workspace-conversation" tone={error ? "red" : "cyan"} active={chatRunning} label="Conversation surface">
              {chatMessages.length ? (
                <>
                  <ol
                    className="workspace-message-list"
                    ref={chatScroll.containerRef}
                    onScroll={chatScroll.handleScroll}
                  >
                    {chatScroll.startIndex > 0 ? (
                      <li className="workspace-message-list__older" aria-hidden="true">
                        ↑ {chatScroll.startIndex} earlier message{chatScroll.startIndex > 1 ? "s" : ""} — scroll up to load
                      </li>
                    ) : null}
                    {chatMessages.slice(chatScroll.startIndex).map((message, sliceIndex) => {
                      const index = chatScroll.startIndex + sliceIndex;
                      const isLastAssistant =
                        message.role === "assistant" && index === chatMessages.length - 1;
                      return (
                        <ChatMessageRow
                          key={message.id}
                          message={message}
                          streaming={chatRunning && isLastAssistant}
                          toolEvents={chatRunning && isLastAssistant ? toolEvents : undefined}
                          thinkingContent={thinkingByMessageId[message.id]}
                        />
                      );
                    })}
                  </ol>
                  {chatScroll.hasMoreBelow ? (
                    <button
                      type="button"
                      className="workspace-scroll-bottom"
                      onClick={() => chatScroll.scrollToBottom(true)}
                      aria-label="Scroll to latest message"
                    >
                      ↓ Latest
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="workspace-conversation__empty">
                <span className="workspace-conversation__glyph">PLUG</span>
                <h2>Session ready</h2>
                <p>{workspace.project.path}</p>
              </div>
            )}
            </HUDPanel>
          </div>

          {missionPanelOpen && traceVersion && mission ? (
            <MissionPanel
              mission={mission}
              controlState={missionControlState}
              overrideDraft={overrideDraft}
              onOverrideDraftChange={setOverrideDraft}
              onPause={() => handleMissionControl("pause")}
              onOverride={() => handleMissionControl("override")}
              onAbort={() => handleMissionControl("abort")}
              onDismiss={() => setMissionPanelOpen(false)}
            />
          ) : null}

          {traceVersion && !missionPanelOpen ? (
            <button className="workspace-trace-reveal" type="button" onClick={() => setMissionPanelOpen(true)}>
              <span>{traceDismissed ? "Tool trace hidden" : "Mission log"}</span>
              <em>{missionStatusText ?? `${toolEvents.length} EVENTS`}</em>
              <strong>Show</strong>
            </button>
          ) : null}

          <form className="workspace-compose" onSubmit={(event) => { event.preventDefault(); void submitChat(); }}>
            <textarea
              value={chatInput}
              disabled={!sessionSnapshot || chatRunning}
              placeholder={chatRunning ? "Streaming response..." : "Send a message to the active session"}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
            />
            <button
              className={isRecording ? "workspace-icon-button workspace-icon-button--active" : "workspace-icon-button"}
              type="button"
              disabled={chatRunning}
              title={isRecording ? "Stop recording and transcribe" : "Record voice input (Whisper)"}
              onClick={() => void handleMicToggle()}
            >
              {isRecording ? "■ REC" : "MIC"}
            </button>
            <button
              className="workspace-icon-button"
              type="button"
              disabled={chatRunning}
              onClick={() => setPromptAppsOpen(true)}
            >
              Apps
            </button>
            <button className="workspace-icon-button workspace-icon-button--primary" type="submit" disabled={!chatInput.trim() || chatRunning || !sessionSnapshot}>
              SEND
            </button>
          </form>
        </section>

        <aside className="workspace-doc" aria-label="Document viewer">
          {!docPanelCollapsed ? (
            <div
              className="workspace-doc__resize"
              onPointerDown={startDocResize}
              role="separator"
              aria-orientation="vertical"
              title="拖动调整宽度"
            />
          ) : null}
          <button
            className="workspace-doc__rail"
            type="button"
            title="Hover to preview document, click to pin"
            onClick={() => setDocPanelCollapsed(false)}
          >
            Document
          </button>
          <div className="workspace-doc__panel">
              <div className="workspace-doc__header">
                <div>
                  <div className="workspace-doc__meta-top">
                    <span className="hud-label">Document</span>
                    {activeApproval ? (
                      <StatusDot status="waiting" label="awaiting" />
                    ) : documentMode === "edit" ? (
                      <StatusDot status={documentDirty ? "waiting" : "complete"} label={documentDirty ? "dirty" : "clean"} />
                    ) : (
                      <StatusDot status="complete" label="read-only" />
                    )}
                  </div>
                  <h2>{activeApproval ? "Authorization Diff" : workspace.document.title}</h2>
                  <p>{activeApproval ? getApprovalTarget(activeApproval) : workspace.document.path}</p>
                </div>
                <div className="workspace-doc__actions">
                  {activeApproval ? (
                    <>
                      <button
                        className="workspace-icon-button workspace-icon-button--active"
                        type="button"
                        title="View pending diff"
                        onClick={() => setAuthorizationModalOpen(false)}
                      >
                        Diff
                      </button>
                      <button
                        className="workspace-icon-button workspace-icon-button--primary"
                        type="button"
                        title="Approve pending change"
                        onClick={() => void resolveActiveApproval("approve")}
                      >
                        Y
                      </button>
                      <button
                        className="workspace-icon-button workspace-icon-button--danger"
                        type="button"
                        title="Reject pending change"
                        onClick={() => void resolveActiveApproval("reject")}
                      >
                        N
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={documentMode === "read" ? "workspace-icon-button workspace-icon-button--active" : "workspace-icon-button"}
                        type="button"
                        title="Read-only markdown preview"
                        onClick={() => setDocumentMode("read")}
                      >
                        View
                      </button>
                      <button
                        className={documentMode === "edit" ? "workspace-icon-button workspace-icon-button--active" : "workspace-icon-button"}
                        type="button"
                        title="Edit markdown"
                        onClick={() => setDocumentMode("edit")}
                      >
                        Edit
                      </button>
                      <button className="workspace-icon-button" type="button" title="Copy markdown" onClick={() => void copyDocument()}>
                        Copy
                      </button>
                    </>
                  )}
                  <button
                    className="workspace-icon-button"
                    type="button"
                    title="Close document panel"
                    onClick={() => setDocPanelCollapsed(true)}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="workspace-doc__toolbar">
                {activeApproval && pendingApprovals.length > 1 ? (
                  <select
                    className="workspace-approval-select"
                    value={activeApproval.id}
                    onChange={(event) => onSelectApproval(event.target.value)}
                  >
                    {pendingApprovals.map((approval) => (
                      <option key={approval.id} value={approval.id}>
                        {approval.title}
                      </option>
                    ))}
                  </select>
                ) : documentMode === "edit" && !activeApproval ? (
                  <div className="workspace-doc__edit-controls">
                    <button
                      className="workspace-icon-button workspace-icon-button--primary"
                      type="button"
                      disabled={!documentDirty}
                      onClick={() => void saveDocument()}
                    >
                      Save
                    </button>
                    <button className="workspace-icon-button" type="button" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                ) : documentNotice ? (
                  <span className="workspace-doc__notice">{documentNotice}</span>
                ) : null}
              </div>

              <div className="workspace-doc__body">
                {activeApproval ? (
                  <DiffPanel approval={activeApproval} />
                ) : isHtmlDocument(workspace.document.path) ? (
                  <iframe
                    key={workspace.document.path}
                    className="workspace-doc__html"
                    title={workspace.document.title}
                    sandbox="allow-scripts"
                    srcDoc={workspace.document.content}
                  />
                ) : documentMode === "edit" ? (
                  <Suspense fallback={<div className="workspace-doc__loading">Loading Milkdown editor...</div>}>
                    <MarkdownEditor
                      key={workspace.document.path}
                      value={draftContent}
                      onChange={setDraftContent}
                    />
                  </Suspense>
                ) : (
                  <MarkdownViewer content={stripFrontMatter(workspace.document.content)} onOpenDocumentPath={openLinkedDocument} />
                )}
              </div>
          </div>
        </aside>
      </div>

      {authorizationModalOpen && activeApproval ? (
        <AuthorizationModal
          approval={activeApproval}
          onViewDiff={() => setAuthorizationModalOpen(false)}
          onApprove={() => void resolveActiveApproval("approve")}
          onReject={() => void resolveActiveApproval("reject")}
        />
      ) : null}

      {promptAppsOpen ? (
        <PromptAppsModal
          promptApps={promptAppDefinitions}
          selectedPromptApp={selectedPromptApp}
          promptAppsPath={promptAppsPath}
          values={promptAppValues}
          onSelect={(promptAppId) => {
            setSelectedPromptAppId(promptAppId);
            setPromptAppValues({});
          }}
          onChangeValue={(fieldId, value) => setPromptAppValues((current) => ({ ...current, [fieldId]: value }))}
          onResetValues={() => setPromptAppValues({})}
          onInsert={insertPromptAppPrompt}
          onUpsert={async (draft) => {
            const apps = await onUpsertPromptApp(draft);
            const savedApp = draft.id
              ? apps.find((app) => app.id === draft.id)
              : apps.find((app) => app.name === draft.name) ?? apps[0];

            if (savedApp) {
              setSelectedPromptAppId(savedApp.id);
              setPromptAppValues({});
            }

            return apps;
          }}
          onDelete={async (id) => {
            const apps = await onDeletePromptApp(id);
            setSelectedPromptAppId(BUILT_IN_PROMPT_APPS[0]?.id ?? apps[0]?.id ?? "");
            setPromptAppValues({});
            return apps;
          }}
          onReload={onReloadPromptApps}
          onClose={() => setPromptAppsOpen(false)}
        />
      ) : null}

      <footer className="workspace-statusbar">
        <span>{error ? "ERROR" : "STATUS"}</span>
        <p>
          {error ??
            missionStatusText ??
            documentNotice ??
            statusMessage ??
            `Active document: ${activeSection?.path ?? workspace.document.path}`}
        </p>
      </footer>
    </main>
  );
}

type MissionStepStatus = "complete" | "running" | "pending" | "awaiting" | "failed";

type MissionStep = {
  id: string;
  label: string;
  detail: string;
  status: MissionStepStatus;
};

type MissionState = {
  title: string;
  status: "executing" | "awaiting" | "paused" | "override" | "aborted" | "complete" | "failed";
  steps: MissionStep[];
  completedCount: number;
};

type MissionPanelProps = {
  mission: MissionState;
  controlState: "active" | "paused" | "override" | "aborted";
  overrideDraft: string;
  onOverrideDraftChange: (value: string) => void;
  onPause: () => void;
  onOverride: () => void;
  onAbort: () => void;
  onDismiss: () => void;
};

function MissionPanel({
  mission,
  controlState,
  overrideDraft,
  onOverrideDraftChange,
  onPause,
  onOverride,
  onAbort,
  onDismiss
}: MissionPanelProps): ReactElement {
  return (
    <HUDPanel className="workspace-mission" tone={mission.status === "failed" || mission.status === "aborted" ? "red" : "cyan"} label="Mission">
      <div className="workspace-mission__header">
        <div className="workspace-mission__title">
          <span>MISSION: {mission.title}</span>
          <em>{`STATUS: ${mission.status.toUpperCase()} · ${mission.completedCount}/${mission.steps.length} COMPLETE`}</em>
        </div>
        <button className="workspace-mission__dismiss" type="button" title="Hide tool trace" onClick={onDismiss}>
          Close
        </button>
      </div>
      <ol className="workspace-mission__steps">
        {mission.steps.map((step, index) => (
          <li className={`workspace-mission__step workspace-mission__step--${step.status}`} key={step.id}>
            <span>{missionStepGlyph(step.status)}</span>
            <strong>{`[${String(index + 1).padStart(2, "0")}] ${step.label}`}</strong>
            <em>{step.detail}</em>
          </li>
        ))}
      </ol>
      {controlState === "override" ? (
        <div className="workspace-mission__override">
          <input
            value={overrideDraft}
            placeholder="Steering message"
            onChange={(event) => onOverrideDraftChange(event.target.value)}
          />
        </div>
      ) : null}
      <div className="workspace-mission__controls">
        <button className="workspace-mission__button workspace-mission__button--pause" type="button" onClick={onPause}>
          {controlState === "paused" ? "RESUME" : "PAUSE"}
        </button>
        <button className="workspace-mission__button workspace-mission__button--override" type="button" onClick={onOverride}>
          OVERRIDE
        </button>
        <button className="workspace-mission__button workspace-mission__button--abort" type="button" onClick={onAbort}>
          ABORT
        </button>
      </div>
    </HUDPanel>
  );
}

type ToolStreamPanelProps = {
  toolEvents: ToolStreamEvent[];
};

function ToolStreamPanel({ toolEvents }: ToolStreamPanelProps): ReactElement {
  return (
    <div className="workspace-tool-stream" aria-label="Tool stream">
      {toolEvents.map((event) => {
        const durationMs = getToolEventDuration(event);

        return (
          <div className={`workspace-tool-stream__row workspace-tool-stream__row--${event.phase}`} key={event.invocationId}>
            <span>{toolPhaseGlyph(event.phase)}</span>
            <strong>{event.toolName}</strong>
            <p>{event.message}</p>
            <em>{durationMs === null ? event.phase.toUpperCase() : `${event.phase.toUpperCase()} · ${durationMs}ms`}</em>
          </div>
        );
      })}
    </div>
  );
}

type AuthorizationModalProps = {
  approval: PendingToolApproval;
  onViewDiff: () => void;
  onApprove: () => void;
  onReject: () => void;
};

type PromptAppsModalProps = {
  promptApps: PromptAppDefinition[];
  selectedPromptApp: PromptAppDefinition | undefined;
  promptAppsPath: string | null;
  values: Record<string, string>;
  onSelect: (promptAppId: string) => void;
  onChangeValue: (fieldId: string, value: string) => void;
  onResetValues: () => void;
  onInsert: () => void;
  onUpsert: (draft: PromptAppDraft) => Promise<CustomPromptApp[]> | CustomPromptApp[];
  onDelete: (id: string) => Promise<CustomPromptApp[]> | CustomPromptApp[];
  onReload: () => Promise<CustomPromptApp[]> | CustomPromptApp[];
  onClose: () => void;
};

function PromptAppsModal({
  promptApps,
  selectedPromptApp,
  promptAppsPath,
  values,
  onSelect,
  onChangeValue,
  onResetValues,
  onInsert,
  onUpsert,
  onDelete,
  onReload,
  onClose
}: PromptAppsModalProps): ReactElement {
  const [editorMode, setEditorMode] = useState<"run" | "edit">("run");
  const [draft, setDraft] = useState<PromptAppDraft>(() => createEmptyPromptAppDraft());
  const [fieldLines, setFieldLines] = useState(formatPromptAppFieldLines(draft.fields));
  const [notice, setNotice] = useState<string | null>(null);
  const customApp = selectedPromptApp?.customApp;

  useEffect(() => {
    if (editorMode === "run") {
      setDraft(customApp ? draftFromCustomPromptApp(customApp) : createEmptyPromptAppDraft());
      setFieldLines(formatPromptAppFieldLines(customApp?.fields ?? createEmptyPromptAppDraft().fields));
      setNotice(null);
    }
  }, [customApp, editorMode]);

  async function handleSavePromptApp(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const fields = parsePromptAppFieldLines(fieldLines);
    const nextDraft: PromptAppDraft = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      outputSection: draft.outputSection.trim() || "current-session",
      fields,
      promptTemplate: draft.promptTemplate.trim()
    };

    if (!nextDraft.name || !nextDraft.promptTemplate) {
      setNotice("Name and prompt template are required.");
      return;
    }

    await onUpsert(nextDraft);
    onResetValues();
    setEditorMode("run");
    setNotice("Prompt App saved.");
  }

  async function handleDeletePromptApp(): Promise<void> {
    if (!customApp) {
      return;
    }

    await onDelete(customApp.id);
    onResetValues();
    setEditorMode("run");
    setNotice("Prompt App deleted.");
  }

  async function handleReloadPromptApps(): Promise<void> {
    await onReload();
    setNotice("Prompt Apps reloaded.");
  }

  function startNewPromptApp(): void {
    const nextDraft = createEmptyPromptAppDraft();
    setDraft(nextDraft);
    setFieldLines(formatPromptAppFieldLines(nextDraft.fields));
    setNotice(null);
    setEditorMode("edit");
  }

  function startEditPromptApp(): void {
    if (!customApp) {
      return;
    }

    const nextDraft = draftFromCustomPromptApp(customApp);
    setDraft(nextDraft);
    setFieldLines(formatPromptAppFieldLines(nextDraft.fields));
    setNotice(null);
    setEditorMode("edit");
  }

  return (
    <div className="workspace-prompt-apps" role="dialog" aria-modal="true" aria-labelledby="workspace-prompt-apps-title">
      <div className="workspace-prompt-apps__panel">
        <header className="workspace-prompt-apps__header">
          <div>
            <span className="hud-label">Prompt Apps</span>
            <h2 id="workspace-prompt-apps-title">{selectedPromptApp?.name ?? "Prompt App"}</h2>
            <p>{selectedPromptApp?.description ?? "Select a reusable mission template."}</p>
          </div>
          <div className="workspace-prompt-apps__header-actions">
            <button className="workspace-icon-button" type="button" onClick={startNewPromptApp}>
              New
            </button>
            <button className="workspace-icon-button" type="button" disabled={!customApp} onClick={startEditPromptApp}>
              Edit
            </button>
            <button className="workspace-icon-button" type="button" onClick={() => void handleReloadPromptApps()}>
              Reload
            </button>
            <button className="workspace-icon-button" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className="workspace-prompt-apps__body">
          <nav className="workspace-prompt-apps__list" aria-label="Prompt apps">
            {promptApps.map((promptApp) => (
              <button
                className={
                  promptApp.id === selectedPromptApp?.id
                    ? "workspace-prompt-apps__item workspace-prompt-apps__item--active"
                    : "workspace-prompt-apps__item"
                }
                key={promptApp.id}
                type="button"
                onClick={() => onSelect(promptApp.id)}
              >
                <strong>{promptApp.name}</strong>
                <em>{`${promptApp.source === "custom" ? "CUSTOM" : "BUILT-IN"} · ${promptApp.outputSection}`}</em>
              </button>
            ))}
          </nav>

          {editorMode === "edit" ? (
            <form className="workspace-prompt-apps__form" onSubmit={(event) => void handleSavePromptApp(event)}>
              <label className="workspace-prompt-apps__field">
                <span>Name</span>
                <input
                  value={draft.name}
                  placeholder="Sprint Planning"
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="workspace-prompt-apps__field">
                <span>Description</span>
                <input
                  value={draft.description}
                  placeholder="Turn a topic into an execution-ready prompt."
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
              <label className="workspace-prompt-apps__field">
                <span>Output Target</span>
                <input
                  value={draft.outputSection}
                  placeholder="02-prd"
                  onChange={(event) => setDraft((current) => ({ ...current, outputSection: event.target.value }))}
                />
              </label>
              <label className="workspace-prompt-apps__field">
                <span>Fields</span>
                <textarea
                  value={fieldLines}
                  placeholder="topic | Topic | Checkout flow | false"
                  onChange={(event) => setFieldLines(event.target.value)}
                />
              </label>
              <label className="workspace-prompt-apps__field workspace-prompt-apps__field--template">
                <span>Prompt Template</span>
                <textarea
                  value={draft.promptTemplate}
                  placeholder="请围绕 {{topic}} 输出..."
                  onChange={(event) => setDraft((current) => ({ ...current, promptTemplate: event.target.value }))}
                />
              </label>
              {notice ? <p className="workspace-prompt-apps__notice">{notice}</p> : null}
              <div className="workspace-prompt-apps__editor-actions">
                <button className="workspace-icon-button" type="button" onClick={() => setEditorMode("run")}>
                  Cancel
                </button>
                {customApp ? (
                  <button className="workspace-icon-button workspace-icon-button--danger" type="button" onClick={() => void handleDeletePromptApp()}>
                    Delete
                  </button>
                ) : null}
                <button className="workspace-icon-button workspace-icon-button--primary" type="submit">
                  Save
                </button>
              </div>
            </form>
          ) : (
            <div className="workspace-prompt-apps__form">
              {selectedPromptApp?.fields.length ? (
                selectedPromptApp.fields.map((field) => (
                  <label className="workspace-prompt-apps__field" key={field.id}>
                    <span>{field.label}</span>
                    {field.multiline ? (
                      <textarea
                        value={values[field.id] ?? ""}
                        placeholder={field.placeholder}
                        onChange={(event) => onChangeValue(field.id, event.target.value)}
                      />
                    ) : (
                      <input
                        value={values[field.id] ?? ""}
                        placeholder={field.placeholder}
                        onChange={(event) => onChangeValue(field.id, event.target.value)}
                      />
                    )}
                  </label>
                ))
              ) : (
                <div className="workspace-prompt-apps__empty">
                  <strong>No fields</strong>
                  <p>This Prompt App inserts its template directly.</p>
                </div>
              )}
              {notice ? <p className="workspace-prompt-apps__notice">{notice}</p> : null}
            </div>
          )}
        </div>

        <footer className="workspace-prompt-apps__footer">
          <span>{promptAppsPath ?? (selectedPromptApp ? `Output target: ${selectedPromptApp.outputSection}` : "Select app")}</span>
          {editorMode === "run" ? (
            <button className="workspace-icon-button workspace-icon-button--primary" type="button" onClick={onInsert}>
              Insert
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

function toPromptAppDefinition(app: CustomPromptApp): PromptAppDefinition {
  return {
    id: app.id,
    name: app.name,
    description: app.description,
    outputSection: app.outputSection,
    source: "custom",
    customApp: app,
    fields: app.fields,
    renderPrompt: (values) => renderPromptTemplate(app.promptTemplate, values)
  };
}

function renderPromptTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (_match, fieldId: string) => values[fieldId]?.trim() ?? "");
}

function createEmptyPromptAppDraft(): PromptAppDraft {
  return {
    name: "",
    description: "",
    outputSection: "current-session",
    fields: [
      {
        id: "topic",
        label: "Topic",
        placeholder: "Checkout flow",
        multiline: false
      }
    ],
    promptTemplate: "请围绕 {{topic}} 输出一份可执行计划。"
  };
}

function draftFromCustomPromptApp(app: CustomPromptApp): PromptAppDraft {
  return {
    id: app.id,
    name: app.name,
    description: app.description,
    outputSection: app.outputSection,
    fields: app.fields,
    promptTemplate: app.promptTemplate
  };
}

function formatPromptAppFieldLines(fields: PromptAppDraft["fields"]): string {
  return fields
    .map((field) => `${field.id} | ${field.label} | ${field.placeholder} | ${field.multiline ? "true" : "false"}`)
    .join("\n");
}

function parsePromptAppFieldLines(value: string): PromptAppDraft["fields"] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id = "", label = "", placeholder = "", multiline = "false"] = line.split("|").map((part) => part.trim());

      return {
        id: id || "field",
        label: label || id || "Field",
        placeholder,
        multiline: /^(1|true|yes|multi|multiline)$/i.test(multiline)
      };
    });
}

function AuthorizationModal({ approval, onViewDiff, onApprove, onReject }: AuthorizationModalProps): ReactElement {
  return (
    <div className="workspace-auth-modal" role="dialog" aria-modal="true" aria-labelledby="workspace-auth-modal-title">
      <div className="workspace-auth-modal__panel">
        <h2 id="workspace-auth-modal-title">REQUIRES PILOT AUTHORIZATION</h2>
        <div className="workspace-auth-modal__divider" />
        <dl>
          <dt>AI proposes</dt>
          <dd>{`${approval.toolName}("${getApprovalTarget(approval)}")`}</dd>
          <dt>Reason</dt>
          <dd>{approval.reason}</dd>
        </dl>
        <button className="workspace-auth-modal__link" type="button" onClick={onViewDiff}>
          View Diff →
        </button>
        <div className="workspace-auth-modal__actions">
          <button type="button" onClick={onApprove}>
            <span>[ Y ]</span>
            APPROVE
          </button>
          <button type="button" onClick={onReject}>
            <span>[ N ]</span>
            REJECT
          </button>
        </div>
      </div>
    </div>
  );
}

type DiffPanelProps = {
  approval: PendingToolApproval;
};

function DiffPanel({ approval }: DiffPanelProps): ReactElement {
  const lines = buildDiffLines(approval);

  return (
    <div className="workspace-diff">
      <div className="workspace-diff__summary">
        <span className={`workspace-diff__badge workspace-diff__badge--${approval.preview.action}`}>
          {approval.preview.action}
        </span>
        <div>
          <strong>{approval.title}</strong>
          <p>{approval.reason}</p>
        </div>
      </div>
      <div className="workspace-diff__grid">
        {lines.map((line, index) => (
          <div className={`workspace-diff__line workspace-diff__line--${line.kind}`} key={`${line.kind}-${index}-${line.text}`}>
            <span>{line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}</span>
            <code>{line.text || " "}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function getApprovalTarget(approval: PendingToolApproval): string {
  if (approval.preview.action === "command") {
    return approval.preview.cwd;
  }

  if (approval.preview.action === "mcp") {
    return `${approval.preview.serverLabel}:${approval.preview.toolName}`;
  }

  if (approval.preview.action === "move") {
    return `${approval.preview.fromPath} → ${approval.preview.toPath}`;
  }

  return approval.preview.path;
}

function buildMissionState(
  toolEvents: ToolStreamEvent[],
  pendingApprovals: PendingToolApproval[],
  controlState: "active" | "paused" | "override" | "aborted"
): MissionState | null {
  if (!toolEvents.length && !pendingApprovals.length) {
    return null;
  }

  const stepsById = new Map<string, MissionStep>();

  for (const event of [...toolEvents].reverse()) {
    stepsById.set(event.invocationId, {
      id: event.invocationId,
      label: event.toolName,
      detail: event.message,
      status: eventPhaseToMissionStatus(event.phase)
    });
  }

  for (const approval of pendingApprovals) {
    stepsById.set(approval.id, {
      id: approval.id,
      label: approval.title,
      detail: approval.reason,
      status: "awaiting"
    });
  }

  const steps = [...stepsById.values()];
  const completedCount = steps.filter((step) => step.status === "complete").length;
  let status: MissionState["status"] = "executing";

  if (controlState === "aborted") {
    status = "aborted";
  } else if (controlState === "paused") {
    status = "paused";
  } else if (controlState === "override") {
    status = "override";
  } else if (steps.some((step) => step.status === "failed")) {
    status = "failed";
  } else if (steps.some((step) => step.status === "awaiting")) {
    status = "awaiting";
  } else if (steps.length > 0 && completedCount === steps.length) {
    status = "complete";
  }

  return {
    title: pendingApprovals[0]?.title ?? steps[0]?.label ?? "Tool Execution",
    status,
    steps,
    completedCount
  };
}

function buildTraceVersion(toolEvents: ToolStreamEvent[], pendingApprovals: PendingToolApproval[]): string {
  const latestEvent = toolEvents[0];
  const approvalIds = pendingApprovals.map((approval) => approval.id).join(",");

  if (!latestEvent && !approvalIds) {
    return "";
  }

  return [
    latestEvent?.invocationId ?? "none",
    latestEvent?.phase ?? "none",
    latestEvent?.createdAt ?? "none",
    approvalIds || "none"
  ].join("|");
}

function eventPhaseToMissionStatus(phase: ToolStreamEvent["phase"]): MissionStepStatus {
  if (phase === "success") {
    return "complete";
  }

  if (phase === "error") {
    return "failed";
  }

  if (phase === "pending_approval") {
    return "awaiting";
  }

  return "running";
}

function toolPhaseGlyph(phase: ToolStreamEvent["phase"]): string {
  if (phase === "success") {
    return "✓";
  }

  if (phase === "error") {
    return "✗";
  }

  if (phase === "pending_approval") {
    return "⚠";
  }

  if (phase === "retry") {
    return "↻";
  }

  return "▶";
}

function getToolEventDuration(event: ToolStreamEvent): number | null {
  if (!event.details || typeof event.details !== "object") {
    return null;
  }

  const maybeDuration = (event.details as { durationMs?: unknown }).durationMs;
  return typeof maybeDuration === "number" ? maybeDuration : null;
}

function missionStepGlyph(status: MissionStepStatus): string {
  if (status === "complete") {
    return "✓";
  }

  if (status === "running") {
    return "▶";
  }

  if (status === "awaiting") {
    return "⚠";
  }

  if (status === "failed") {
    return "✗";
  }

  return "○";
}

type DiffLine = {
  kind: "same" | "add" | "remove";
  text: string;
};

function buildDiffLines(approval: PendingToolApproval): DiffLine[] {
  const preview = approval.preview;

  if (preview.action === "create") {
    return preview.content.split("\n").map((text) => ({ kind: "add", text }));
  }

  if (preview.action === "delete") {
    return preview.oldContent.split("\n").map((text) => ({ kind: "remove", text }));
  }

  if (preview.action === "command") {
    return [`$ ${preview.cmd}`, `cwd: ${preview.cwd}`, "", "Command execution is disabled unless explicitly enabled and approved."].map(
      (text) => ({ kind: "add", text })
    );
  }

  if (preview.action === "mcp") {
    return [
      `server: ${preview.serverLabel} (${preview.serverId})`,
      `tool: ${preview.toolName}`,
      "arguments:",
      ...JSON.stringify(preview.arguments, null, 2).split("\n")
    ].map((text) => ({ kind: "add", text }));
  }

  if (preview.action === "move") {
    return [
      `from: ${preview.fromPath}`,
      `to:   ${preview.toPath}`
    ].map((text) => ({ kind: "add", text }));
  }

  return diffTextByLine(preview.oldContent, preview.newContent);
}

function diffTextByLine(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const matrix = Array.from({ length: oldLines.length + 1 }, () => Array<number>(newLines.length + 1).fill(0));

  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      matrix[oldIndex][newIndex] =
        oldLines[oldIndex] === newLines[newIndex]
          ? matrix[oldIndex + 1][newIndex + 1] + 1
          : Math.max(matrix[oldIndex + 1][newIndex], matrix[oldIndex][newIndex + 1]);
    }
  }

  const diffLines: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      diffLines.push({ kind: "same", text: oldLines[oldIndex] });
      oldIndex += 1;
      newIndex += 1;
    } else if (matrix[oldIndex + 1][newIndex] >= matrix[oldIndex][newIndex + 1]) {
      diffLines.push({ kind: "remove", text: oldLines[oldIndex] });
      oldIndex += 1;
    } else {
      diffLines.push({ kind: "add", text: newLines[newIndex] });
      newIndex += 1;
    }
  }

  while (oldIndex < oldLines.length) {
    diffLines.push({ kind: "remove", text: oldLines[oldIndex] });
    oldIndex += 1;
  }

  while (newIndex < newLines.length) {
    diffLines.push({ kind: "add", text: newLines[newIndex] });
    newIndex += 1;
  }

  return diffLines;
}

type ChatMessageRowProps = {
  message: ChatMessage;
  streaming: boolean;
  toolEvents?: ToolStreamEvent[];
  thinkingContent?: string;
};

function ChatMessageRow({ message, streaming, toolEvents, thinkingContent }: ChatMessageRowProps): ReactElement {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);

  // Show the thinking pulse while a response is forming but has no text yet.
  const showPulse = streaming && !message.content;
  // Only name the action if a tool is genuinely in flight right now — this
  // ignores the instant 1ms reads and any stale events left on the session.
  const activeTool =
    toolEvents && toolEvents.length > 0 && isActiveToolPhase(toolEvents[0].phase) ? toolEvents[0] : null;

  return (
    <li className={`workspace-message workspace-message--${message.role}`}>
      <div className="workspace-message__meta">
        <span>{message.role === "user" ? "PILOT" : "PLUG"}</span>
        <NumericText muted>{formatMessageTime(message.createdAt)}</NumericText>
        {streaming ? <StatusDot status="running" label="stream" /> : null}
      </div>
      {thinkingContent ? (
        <div className="workspace-message__thinking">
          <button
            className="workspace-message__thinking-toggle"
            type="button"
            onClick={() => setThinkingExpanded((open) => !open)}
          >
            <span>{thinkingExpanded ? "▾" : "▸"}</span>
            <em>Thinking</em>
            {!thinkingExpanded ? <span className="workspace-message__thinking-hint">{thinkingContent.slice(0, 60).replace(/\n/g, " ")}…</span> : null}
          </button>
          {thinkingExpanded ? (
            <pre className="workspace-message__thinking-content">{thinkingContent}</pre>
          ) : null}
        </div>
      ) : null}
      {showPulse ? (
        <div className="workspace-message__pulse" role="status" aria-live="polite">
          <span className="workspace-message__pulse-orb" aria-hidden="true" />
          <em>{activeTool ? activeTool.toolName : "Thinking"}</em>
          {activeTool ? <span className="workspace-message__pulse-detail">{activeTool.message}</span> : null}
        </div>
      ) : null}
      <div className="workspace-message__content">{message.content}</div>
    </li>
  );
}

// A tool step still in flight (i.e. actually taking time) — used to surface the
// one live action during the thinking pulse, while skipping the instant
// completed/stale steps the user doesn't care about.
function isActiveToolPhase(phase: ToolStreamEvent["phase"]): boolean {
  return phase !== "success" && phase !== "error" && phase !== "pending_approval";
}

function formatMessageTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

type MetricProps = {
  label: string;
  value: string;
  tone: "running" | "complete" | "pending";
};

function Metric({ label, value, tone }: MetricProps): ReactElement {
  return (
    <div className="workspace-metric">
      <span>{label}</span>
      <StatusDot status={tone} label={value} />
    </div>
  );
}

type SectionButtonProps = {
  section: ProjectSection;
  active: boolean;
  onOpenSection: (sectionId: string) => Promise<void> | void;
};

function SectionButton({ section, active, onOpenSection }: SectionButtonProps): ReactElement {
  return (
    <button
      className={["workspace-section", active ? "workspace-section--active" : ""].filter(Boolean).join(" ")}
      type="button"
      onClick={() => void onOpenSection(section.id)}
      aria-current={active ? "page" : undefined}
    >
      <span className="workspace-section__icon" aria-hidden="true">
        {section.icon.slice(0, 2).toUpperCase()}
      </span>
      <span className="workspace-section__body">
        <strong>{section.label}</strong>
        <em>{section.path}</em>
      </span>
      <span className={`workspace-section__policy workspace-section__policy--${section.aiWrite}`}>
        {section.aiWrite}
      </span>
    </button>
  );
}

import { useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import type {
  AppConfigSnapshot,
  AppInfo,
  AgentMode,
  ChatStreamEvent,
  McpServerConfig,
  McpServerDraft,
  McpServerHealth,
  NetworkConfig,
  PendingToolApproval,
  CustomPromptApp,
  PromptAppDraft,
  ProviderDraft,
  ProviderTestResult,
  ProjectSummary,
  SessionSnapshot,
  TemplateSummary,
  TokenSavingsSnapshot,
  ToolDescriptor,
  ToolModelSelection,
  ToolStreamEvent,
  WorkspaceSnapshot
} from "../shared/types";
import { pendingToolApprovalSchema } from "../shared/tool-schema";
import { CommandPalette, type CommandPaletteAction } from "./components/CommandPalette";
import { StartupSplash } from "./components/StartupSplash";
import { Launcher } from "./pages/Launcher";
import { SettingsPanel } from "./pages/SettingsPanel";
import { Workspace } from "./pages/Workspace";

type BootstrapState = {
  appInfo: AppInfo | null;
  projects: ProjectSummary[];
  templates: TemplateSummary[];
  registryPath: string | null;
  defaultParentDir: string | null;
  config: AppConfigSnapshot | null;
  mcpServers: McpServerConfig[];
  mcpConfigPath: string | null;
  mcpHealthChecks: McpServerHealth[];
  tokenSavings: TokenSavingsSnapshot | null;
  promptApps: CustomPromptApp[];
  promptAppsPath: string | null;
  sessionSnapshot: SessionSnapshot | null;
  bridgeAvailable: boolean;
  workspace: WorkspaceSnapshot | null;
  agentMode: AgentMode;
  toolDescriptors: ToolDescriptor[];
  toolEvents: ToolStreamEvent[];
  pendingApprovals: PendingToolApproval[];
  activeApprovalId: string | null;
  settingsOpen: boolean;
  commandPaletteOpen: boolean;
  launcherNewProjectSignal: number;
  chatRunning: boolean;
  statusMessage: string | null;
  error: string | null;
  // messageId -> accumulated thinking text
  thinkingByMessageId: Record<string, string>;
  // Set when the agent writes a document it wants revealed in the side panel.
  openDocumentRequest: { path: string; nonce: number } | null;
};

export type CreateProjectDraft = {
  templateId: string;
  projectName: string;
  parentDir: string;
  defaultModel: string;
  planningModel: string;
  gitUrl: string;
  gitBranch: string;
};

export function App(): ReactElement {
  const [startupVisible, setStartupVisible] = useState(true);
  const hideStartup = useCallback((): void => {
    setStartupVisible(false);
  }, []);
  const [state, setState] = useState<BootstrapState>({
    appInfo: null,
    projects: [],
    templates: [],
    registryPath: null,
    defaultParentDir: null,
    config: null,
    mcpServers: [],
    mcpConfigPath: null,
    mcpHealthChecks: [],
    tokenSavings: null,
    promptApps: [],
    promptAppsPath: null,
    sessionSnapshot: null,
    bridgeAvailable: Boolean(window.plug),
    workspace: null,
    agentMode: "auto",
    toolDescriptors: [],
    toolEvents: [],
    pendingApprovals: [],
    activeApprovalId: null,
    settingsOpen: false,
    commandPaletteOpen: false,
    launcherNewProjectSignal: 0,
    chatRunning: false,
    statusMessage: null,
    error: null,
    thinkingByMessageId: {},
    openDocumentRequest: null
  });

  const markBridgeUnavailable = useCallback((): void => {
    setState((current) => ({
      ...current,
      bridgeAvailable: false,
      workspace: null,
      toolDescriptors: [],
      toolEvents: [],
      mcpServers: [],
      mcpConfigPath: null,
      mcpHealthChecks: [],
      tokenSavings: null,
      promptApps: [],
      promptAppsPath: null,
      pendingApprovals: [],
      activeApprovalId: null,
      statusMessage: "Electron IPC bridge unavailable. Use the Electron app window for project actions.",
      error: null
    }));
  }, []);

  const loadWorkspace = useCallback(
    async (projectId: string): Promise<WorkspaceSnapshot | null> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return null;
      }

      const mode: AgentMode = "auto";
      const [workspace, sessionSnapshot, toolList, approvalList] = await Promise.all([
        plug.invoke("workspace.load", { projectId }),
        plug.invoke("session.list", { projectId }),
        plug.invoke("tool.list", { projectId, mode }),
        plug.invoke("tool.pendingApprovals", { projectId })
      ]);
      setState((current) => ({
        ...current,
        bridgeAvailable: true,
        workspace,
        sessionSnapshot,
        agentMode: mode,
        toolDescriptors: toolList.tools,
        toolEvents: getSessionToolEvents(sessionSnapshot),
        pendingApprovals: approvalList.approvals,
        activeApprovalId: approvalList.approvals[0]?.id ?? null,
        statusMessage: `Workspace online: ${workspace.project.name}.`,
        error: null
      }));

      return workspace;
    },
    [markBridgeUnavailable]
  );

  const createSession = useCallback(
    async (projectId: string): Promise<void> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return;
      }

      const sessionSnapshot = await plug.invoke("session.create", { projectId });
      setState((current) => ({
        ...current,
        sessionSnapshot,
        toolEvents: getSessionToolEvents(sessionSnapshot),
        statusMessage: `Session created: ${sessionSnapshot.session.title}.`,
        error: null
      }));
    },
    [markBridgeUnavailable]
  );

  const openSession = useCallback(
    async (projectId: string, sessionId: string): Promise<void> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return;
      }

      const sessionSnapshot = await plug.invoke("session.open", { projectId, sessionId });
      setState((current) => ({
        ...current,
        sessionSnapshot,
        toolEvents: getSessionToolEvents(sessionSnapshot),
        statusMessage: `Session active: ${sessionSnapshot.session.title}.`,
        error: null
      }));
    },
    [markBridgeUnavailable]
  );

  const renameSession = useCallback(
    async (projectId: string, sessionId: string, title: string): Promise<void> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return;
      }

      const sessionSnapshot = await plug.invoke("session.rename", { projectId, sessionId, title });
      setState((current) => ({
        ...current,
        sessionSnapshot,
        toolEvents: getSessionToolEvents(sessionSnapshot),
        statusMessage: `Session renamed: ${sessionSnapshot.session.title}.`,
        error: null
      }));
    },
    [markBridgeUnavailable]
  );

  const sendChatMessage = useCallback(
    async (
      projectId: string,
      sessionId: string,
      content: string,
      currentDocumentPath: string,
      agentMode: AgentMode
    ): Promise<void> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return;
      }

      const streamId = createStreamId();
      setState((current) => ({
        ...current,
        chatRunning: true,
        statusMessage: "Chat stream started.",
        error: null
      }));

      try {
        const sessionSnapshot = await plug.invoke("chat.send", {
          streamId,
          projectId,
          sessionId,
          content,
          currentDocumentPath,
          agentMode
        });
        setState((current) => ({
          ...current,
          sessionSnapshot,
          toolEvents: getSessionToolEvents(sessionSnapshot),
          chatRunning: false,
          statusMessage: "Chat stream complete.",
          error: null
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown chat stream error";
        setState((current) => ({
          ...current,
          chatRunning: false,
          error: message,
          statusMessage: null
        }));
      }
    },
    [markBridgeUnavailable]
  );

  const reloadConfig = useCallback(async (): Promise<AppConfigSnapshot | null> => {
    const plug = window.plug;

    if (!plug) {
      markBridgeUnavailable();
      return null;
    }

    const config = await plug.invoke("config.get", {});
    setState((current) => ({
      ...current,
      config,
      bridgeAvailable: true,
      error: null
    }));

    return config;
  }, [markBridgeUnavailable]);

  const reloadPromptApps = useCallback(async (): Promise<CustomPromptApp[]> => {
    const plug = window.plug;

    if (!plug) {
      markBridgeUnavailable();
      return [];
    }

    const snapshot = await plug.invoke("promptApp.list", {});
    setState((current) => ({
      ...current,
      promptApps: snapshot.apps,
      promptAppsPath: snapshot.path,
      bridgeAvailable: true,
      error: null
    }));

    return snapshot.apps;
  }, [markBridgeUnavailable]);

  const reloadMcpServers = useCallback(async (): Promise<McpServerConfig[]> => {
    const plug = window.plug;

    if (!plug) {
      markBridgeUnavailable();
      return [];
    }

    const snapshot = await plug.invoke("mcp.list", {});
    setState((current) => ({
      ...current,
      mcpServers: snapshot.servers,
      mcpConfigPath: snapshot.path,
      bridgeAvailable: true,
      error: null
    }));

    return snapshot.servers;
  }, [markBridgeUnavailable]);

  const reloadTokenSavings = useCallback(async (): Promise<TokenSavingsSnapshot | null> => {
    const plug = window.plug;

    if (!plug) {
      markBridgeUnavailable();
      return null;
    }

    const snapshot = await plug.invoke("tokenSavings.get", {});
    setState((current) => ({
      ...current,
      tokenSavings: snapshot,
      bridgeAvailable: true,
      error: null
    }));

    return snapshot;
  }, [markBridgeUnavailable]);

  const refreshWorkspaceTools = useCallback(async (): Promise<void> => {
    const plug = window.plug;

    if (!plug) {
      markBridgeUnavailable();
      return;
    }

    const projectId = state.workspace?.project.id;

    if (!projectId) {
      return;
    }

    const toolList = await plug.invoke("tool.list", { projectId, mode: state.agentMode });
    setState((current) => ({
      ...current,
      toolDescriptors: toolList.tools
    }));
  }, [markBridgeUnavailable, state.agentMode, state.workspace?.project.id]);

  const upsertMcpServer = useCallback(
    async (draft: McpServerDraft): Promise<McpServerConfig[]> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return [];
      }

      const snapshot = await plug.invoke("mcp.upsert", draft);
      setState((current) => ({
        ...current,
        mcpServers: snapshot.servers,
        mcpConfigPath: snapshot.path,
        bridgeAvailable: true,
        statusMessage: `MCP server saved: ${draft.label}.`,
        error: null
      }));
      await refreshWorkspaceTools();

      return snapshot.servers;
    },
    [markBridgeUnavailable, refreshWorkspaceTools]
  );

  const deleteMcpServer = useCallback(
    async (id: string): Promise<McpServerConfig[]> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return [];
      }

      const snapshot = await plug.invoke("mcp.delete", { id });
      setState((current) => ({
        ...current,
        mcpServers: snapshot.servers,
        mcpConfigPath: snapshot.path,
        bridgeAvailable: true,
        statusMessage: "MCP server deleted.",
        error: null
      }));
      await refreshWorkspaceTools();

      return snapshot.servers;
    },
    [markBridgeUnavailable, refreshWorkspaceTools]
  );

  const checkMcpHealth = useCallback(
    async (id?: string): Promise<McpServerHealth[]> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return [];
      }

      const result = await plug.invoke("mcp.health", { id });
      setState((current) => ({
        ...current,
        mcpHealthChecks: result.checks,
        bridgeAvailable: true,
        statusMessage: result.checks.some((check) => !check.ok) ? "MCP health check found issues." : "MCP health check passed.",
        error: null
      }));

      return result.checks;
    },
    [markBridgeUnavailable]
  );

  const upsertPromptApp = useCallback(
    async (draft: PromptAppDraft): Promise<CustomPromptApp[]> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return [];
      }

      const snapshot = await plug.invoke("promptApp.upsert", draft);
      setState((current) => ({
        ...current,
        promptApps: snapshot.apps,
        promptAppsPath: snapshot.path,
        bridgeAvailable: true,
        statusMessage: `Prompt App saved: ${draft.name}.`,
        error: null
      }));

      return snapshot.apps;
    },
    [markBridgeUnavailable]
  );

  const deletePromptApp = useCallback(
    async (id: string): Promise<CustomPromptApp[]> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return [];
      }

      const snapshot = await plug.invoke("promptApp.delete", { id });
      setState((current) => ({
        ...current,
        promptApps: snapshot.apps,
        promptAppsPath: snapshot.path,
        bridgeAvailable: true,
        statusMessage: "Prompt App deleted.",
        error: null
      }));

      return snapshot.apps;
    },
    [markBridgeUnavailable]
  );

  const upsertProvider = useCallback(
    async (draft: ProviderDraft): Promise<void> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return;
      }

      const config = await plug.invoke("config.upsertProvider", draft);
      setState((current) => ({
        ...current,
        config,
        bridgeAvailable: true,
        statusMessage: `Provider saved: ${draft.label}.`,
        error: null
      }));
    },
    [markBridgeUnavailable]
  );

  useEffect(() => {
    const unsubscribe = window.plug?.onChatEvent((event: ChatStreamEvent) => {
      setState((current) => applyChatStreamEvent(current, event));
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.plug?.onToolEvent((event: ToolStreamEvent) => {
      setState((current) => applyToolStreamEvent(current, event));
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  // When the agent writes a document, open it in the side panel.
  useEffect(() => {
    const request = state.openDocumentRequest;
    const projectId = state.workspace?.project.id;
    if (!request || !projectId) {
      return;
    }
    // write_document returns a project-root-relative path; pass empty fromPath so
    // it resolves against the root, not the dir of whatever doc is open now.
    void openWorkspaceDocumentPath(projectId, request.path, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.openDocumentRequest?.nonce]);

  const deleteProvider = useCallback(
    async (id: string): Promise<void> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return;
      }

      const config = await plug.invoke("config.deleteProvider", { id });
      setState((current) => ({
        ...current,
        config,
        bridgeAvailable: true,
        statusMessage: "Provider deleted.",
        error: null
      }));
    },
    [markBridgeUnavailable]
  );

  const setToolModel = useCallback(
    async (selection: ToolModelSelection): Promise<void> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return;
      }

      const config = await plug.invoke("config.setToolModel", selection);
      setState((current) => ({
        ...current,
        config,
        bridgeAvailable: true,
        statusMessage: `Tool model set to ${selection.modelId}.`,
        error: null
      }));
    },
    [markBridgeUnavailable]
  );

  const setChatModel = useCallback(
    async (selection: ToolModelSelection): Promise<void> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return;
      }

      const config = await plug.invoke("config.setChatModel", selection);
      setState((current) => ({
        ...current,
        config,
        bridgeAvailable: true,
        statusMessage: `Chat model set to ${selection.modelId}.`,
        error: null
      }));
    },
    [markBridgeUnavailable]
  );

  const setNetwork = useCallback(
    async (network: NetworkConfig): Promise<void> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return;
      }

      const config = await plug.invoke("config.setNetwork", network);
      setState((current) => ({
        ...current,
        config,
        bridgeAvailable: true,
        statusMessage: "Network configuration saved.",
        error: null
      }));
    },
    [markBridgeUnavailable]
  );

  const testProvider = useCallback(
    async (providerId: string, modelId?: string): Promise<ProviderTestResult> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        throw new Error("Electron IPC bridge unavailable.");
      }

      const result = await plug.invoke("config.testProvider", { providerId, modelId });
      setState((current) => ({
        ...current,
        statusMessage: result.ok ? `Provider test passed: ${result.durationMs}ms.` : result.message,
        error: result.ok ? null : result.message
      }));

      return result;
    },
    [markBridgeUnavailable]
  );

  const openWorkspaceSection = useCallback(
    async (projectId: string, sectionId: string): Promise<void> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return;
      }

      try {
        const document = await plug.invoke("workspace.openSection", { projectId, sectionId });
        setState((current) => {
          if (!current.workspace) {
            return current;
          }

          return {
            ...current,
            workspace: {
              ...current.workspace,
              document
            },
            statusMessage: `Opened ${document.path}.`,
            error: null
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown section open error";
        setState((current) => ({
          ...current,
          error: message,
          statusMessage: null
        }));
      }
    },
    [markBridgeUnavailable]
  );

  const openWorkspaceDocumentPath = useCallback(
    async (projectId: string, path: string, fromPath: string): Promise<void> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return;
      }

      try {
        const document = await plug.invoke("workspace.openDocumentPath", { projectId, path, fromPath });
        setState((current) => {
          if (!current.workspace) {
            return current;
          }

          return {
            ...current,
            workspace: {
              ...current.workspace,
              document
            },
            statusMessage: `Opened ${document.path}.`,
            error: null
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown document open error";
        setState((current) => ({
          ...current,
          error: message,
          statusMessage: null
        }));
      }
    },
    [markBridgeUnavailable]
  );

  const saveWorkspaceDocument = useCallback(
    async (projectId: string, path: string, content: string): Promise<void> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return;
      }

      try {
        const document = await plug.invoke("workspace.saveDocument", { projectId, path, content });
        setState((current) => {
          if (!current.workspace) {
            return current;
          }

          return {
            ...current,
            workspace: {
              ...current.workspace,
              document
            },
            statusMessage: `Saved ${document.path}.`,
            error: null
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown document save error";
        setState((current) => ({
          ...current,
          error: message,
          statusMessage: null
        }));
        throw error;
      }
    },
    [markBridgeUnavailable]
  );

  const setAgentMode = useCallback(
    async (projectId: string, mode: AgentMode): Promise<void> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return;
      }

      try {
        const toolList = await plug.invoke("tool.list", { projectId, mode });
        setState((current) => ({
          ...current,
          agentMode: mode,
          toolDescriptors: toolList.tools,
          statusMessage: `${mode === "plan" ? "Plan" : "Execute"} mode: ${toolList.tools.length} tools enabled.`,
          error: null
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown tool mode error";
        setState((current) => ({
          ...current,
          error: message,
          statusMessage: null
        }));
      }
    },
    [markBridgeUnavailable]
  );

  const resolveApproval = useCallback(
    async (projectId: string, approvalId: string, decision: "approve" | "reject"): Promise<void> => {
      const plug = window.plug;

      if (!plug) {
        markBridgeUnavailable();
        return;
      }

      try {
        const result = await plug.invoke("tool.resolveApproval", { projectId, approvalId, decision });
        const approvalList = await plug.invoke("tool.pendingApprovals", { projectId });
        let openedPath = false;

        if (result.status === "approved" && result.appliedPath && result.approval.preview.action !== "delete") {
          try {
            const document = await plug.invoke("workspace.openDocumentPath", {
              projectId,
              path: result.appliedPath
            });
            openedPath = true;
            setState((current) => ({
              ...current,
              workspace: current.workspace
                ? {
                    ...current.workspace,
                    document
                  }
                : current.workspace,
              pendingApprovals: approvalList.approvals,
              activeApprovalId: approvalList.approvals[0]?.id ?? null,
              statusMessage: `${result.message} Opened ${document.path}.`,
              error: null
            }));
          } catch {
            openedPath = false;
          }
        }

        if (!openedPath) {
          setState((current) => ({
            ...current,
            pendingApprovals: approvalList.approvals,
            activeApprovalId: approvalList.approvals[0]?.id ?? null,
            statusMessage: result.message,
            error: null
          }));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown approval error";
        setState((current) => ({
          ...current,
          error: message,
          statusMessage: null
        }));
      }
    },
    [markBridgeUnavailable]
  );

  const reloadProjects = useCallback(async (): Promise<ProjectSummary[]> => {
    const plug = window.plug;

    if (!plug) {
      markBridgeUnavailable();
      return [];
    }

    const projectList = await plug.invoke("project.list", {});
    setState((current) => ({
      ...current,
      bridgeAvailable: true,
      projects: projectList.projects,
      statusMessage: "Project registry refreshed.",
      error: null
    }));

    return projectList.projects;
  }, [markBridgeUnavailable]);

  const registerProject = useCallback(async (): Promise<void> => {
    const plug = window.plug;

    if (!plug) {
      markBridgeUnavailable();
      return;
    }

    try {
      const result = await plug.invoke("project.addFromDialog", {});

      setState((current) => ({
        ...current,
        bridgeAvailable: true,
        projects: result.projects,
        statusMessage: result.cancelled
          ? "Project registration cancelled."
          : `Registered ${result.project?.name ?? "project"}.`,
        error: null
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown project registration error";
      setState((current) => ({
        ...current,
        error: message,
        statusMessage: null
      }));
    }
  }, [markBridgeUnavailable]);

  const chooseProjectParent = useCallback(async (): Promise<string | null> => {
    const plug = window.plug;

    if (!plug) {
      markBridgeUnavailable();
      return null;
    }

    const result = await plug.invoke("template.chooseParentDir", {});
    return result.path;
  }, [markBridgeUnavailable]);

  const createProject = useCallback(async (draft: CreateProjectDraft): Promise<void> => {
    const plug = window.plug;

    if (!plug) {
      markBridgeUnavailable();
      return;
    }

    try {
      const result = await plug.invoke("project.createFromTemplate", draft);

      setState((current) => ({
        ...current,
        bridgeAvailable: true,
        projects: result.projects,
        statusMessage: `Initialized ${result.project.name}.`,
        error: null
      }));
      await loadWorkspace(result.project.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown project creation error";
      setState((current) => ({
        ...current,
        error: message,
        statusMessage: null
      }));
    }
  }, [loadWorkspace, markBridgeUnavailable]);

  const openProject = useCallback(async (projectId: string): Promise<void> => {
    const plug = window.plug;

    if (!plug) {
      markBridgeUnavailable();
      return;
    }

    try {
      const result = await plug.invoke("project.open", { id: projectId });

      setState((current) => ({
        ...current,
        bridgeAvailable: true,
        projects: result.projects,
        statusMessage: `Activated ${result.project.name}.`,
        error: null
      }));
      await loadWorkspace(result.project.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown project open error";
      setState((current) => ({
        ...current,
        error: message,
        statusMessage: null
      }));
    }
  }, [loadWorkspace, markBridgeUnavailable]);

  const showNewProjectWizard = useCallback((): void => {
    setState((current) => ({
      ...current,
      workspace: null,
      sessionSnapshot: null,
      toolDescriptors: [],
      toolEvents: [],
      pendingApprovals: [],
      activeApprovalId: null,
      commandPaletteOpen: false,
      launcherNewProjectSignal: current.launcherNewProjectSignal + 1,
      statusMessage: "New project wizard armed.",
      error: null
    }));
  }, []);

  useEffect(() => {
    if (startupVisible) {
      return;
    }

    let cancelled = false;

    async function loadBootstrapState(): Promise<void> {
      const plug = window.plug;

      if (!plug) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            bridgeAvailable: false,
            statusMessage: "Renderer preview loaded. Open the Electron app window for IPC-backed actions.",
            error: null
          }));
        }
        return;
      }

      try {
        const [
          appInfo,
          projectList,
          registryPath,
          templateList,
          defaultParentDir,
          config,
          promptAppSnapshot,
          mcpSnapshot,
          tokenSavings
        ] = await Promise.all([
          plug.invoke("app.info", {}),
          plug.invoke("project.list", {}),
          plug.invoke("project.registryPath", {}),
          plug.invoke("template.list", {}),
          plug.invoke("template.defaultParentDir", {}),
          plug.invoke("config.get", {}),
          plug.invoke("promptApp.list", {}),
          plug.invoke("mcp.list", {}),
          plug.invoke("tokenSavings.get", {})
        ]);

        if (!cancelled) {
          setState({
            appInfo,
            projects: projectList.projects,
            templates: templateList.templates,
            registryPath: registryPath.path,
            defaultParentDir: defaultParentDir.path,
            config,
            mcpServers: mcpSnapshot.servers,
            mcpConfigPath: mcpSnapshot.path,
            mcpHealthChecks: [],
            tokenSavings,
            promptApps: promptAppSnapshot.apps,
            promptAppsPath: promptAppSnapshot.path,
            bridgeAvailable: true,
            workspace: null,
            sessionSnapshot: null,
            agentMode: "auto",
            toolDescriptors: [],
            toolEvents: [],
            pendingApprovals: [],
            activeApprovalId: null,
            settingsOpen: false,
            commandPaletteOpen: false,
            launcherNewProjectSignal: 0,
            chatRunning: false,
            statusMessage: "Project registry online.",
            error: null,
            thinkingByMessageId: {},
    openDocumentRequest: null
          });

          const activeProject = projectList.projects.find((project) => project.status === "active");
          if (activeProject) {
            void loadWorkspace(activeProject.id);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown bootstrap error";
        if (!cancelled) {
          setState((current) => ({
            ...current,
            error: message
          }));
        }
      }
    }

    void loadBootstrapState();

    return () => {
      cancelled = true;
    };
  }, [loadWorkspace, startupVisible]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent): void {
      const isCommand = event.metaKey || event.ctrlKey;

      if (!isCommand) {
        return;
      }

      const key = event.key.toLowerCase();

      if (state.commandPaletteOpen) {
        if (key === "k") {
          event.preventDefault();
          setState((current) => ({ ...current, commandPaletteOpen: false }));
        }
        return;
      }

      if (key === "n") {
        event.preventDefault();
        showNewProjectWizard();
      }

      if (key === "o") {
        event.preventDefault();
        void registerProject();
      }

      if (key === ",") {
        event.preventDefault();
        setState((current) => ({
          ...current,
          settingsOpen: true,
          statusMessage: "Settings online.",
          error: null
        }));
      }

      if (key === "k") {
        event.preventDefault();
        setState((current) => ({ ...current, commandPaletteOpen: true }));
      }

      if (key === "r") {
        event.preventDefault();
        void reloadProjects();
      }

      if (key === "t" && state.workspace) {
        event.preventDefault();
        void createSession(state.workspace.project.id);
      }

      if (/^[1-9]$/.test(key) && state.workspace && state.sessionSnapshot) {
        const session = state.sessionSnapshot.sessions[Number(key) - 1];

        if (session) {
          event.preventDefault();
          void openSession(state.workspace.project.id, session.id);
        }
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    createSession,
    openSession,
    registerProject,
    reloadProjects,
    showNewProjectWizard,
    state.commandPaletteOpen,
    state.sessionSnapshot,
    state.workspace
  ]);

  const activeProjectId = state.workspace?.project.id ?? null;
  const activeApproval =
    state.pendingApprovals.find((approval) => approval.id === state.activeApprovalId) ??
    state.pendingApprovals[0] ??
    null;
  const commandPaletteActions = buildCommandPaletteActions({
    state,
    activeApproval,
    onNewProject: showNewProjectWizard,
    onRegisterProject: registerProject,
    onRefreshProjects: reloadProjects,
    onOpenSettings: () => {
      void reloadConfig();
      setState((current) => ({ ...current, settingsOpen: true, statusMessage: "Settings online.", error: null }));
    },
    onBackToLauncher: () =>
      setState((current) => ({
        ...current,
        workspace: null,
        sessionSnapshot: null,
        toolDescriptors: [],
        toolEvents: [],
        pendingApprovals: [],
        activeApprovalId: null,
        statusMessage: "Returned to launcher."
      })),
    onCreateSession: () => {
      if (activeProjectId) {
        void createSession(activeProjectId);
      }
    },
    onSetAgentMode: (mode) => {
      if (activeProjectId) {
        void setAgentMode(activeProjectId, mode);
      }
    },
    onOpenProject: openProject,
    onOpenSession: (sessionId) => {
      if (activeProjectId) {
        void openSession(activeProjectId, sessionId);
      }
    },
    onResolveApproval: (approvalId, decision) => {
      if (activeProjectId) {
        void resolveApproval(activeProjectId, approvalId, decision);
      }
    }
  });
  const settingsPanel = state.settingsOpen ? (
    <SettingsPanel
      config={state.config}
      mcpServers={state.mcpServers}
      mcpConfigPath={state.mcpConfigPath}
      mcpHealthChecks={state.mcpHealthChecks}
      tokenSavings={state.tokenSavings}
      bridgeAvailable={state.bridgeAvailable}
      onClose={() => setState((current) => ({ ...current, settingsOpen: false }))}
      onReloadConfig={reloadConfig}
      onReloadMcpServers={reloadMcpServers}
      onReloadTokenSavings={reloadTokenSavings}
      onUpsertProvider={upsertProvider}
      onDeleteProvider={deleteProvider}
      onSetChatModel={setChatModel}
      onSetToolModel={setToolModel}
      onSetNetwork={setNetwork}
      onTestProvider={testProvider}
      onUpsertMcpServer={upsertMcpServer}
      onDeleteMcpServer={deleteMcpServer}
      onCheckMcpHealth={checkMcpHealth}
    />
  ) : null;
  const commandPalette = (
    <CommandPalette
      open={state.commandPaletteOpen}
      actions={commandPaletteActions}
      onClose={() => setState((current) => ({ ...current, commandPaletteOpen: false }))}
    />
  );

  if (state.workspace) {
    const activeProjectId = state.workspace.project.id;
    const activeDocumentPath = state.workspace.document.path;

    return (
      <>
        <Workspace
          appInfo={state.appInfo}
          workspace={state.workspace}
          statusMessage={state.statusMessage}
          error={state.error}
          revealDocumentNonce={state.openDocumentRequest?.nonce ?? 0}
          onBackToLauncher={() =>
            setState((current) => ({
              ...current,
              workspace: null,
              sessionSnapshot: null,
              toolDescriptors: [],
              toolEvents: [],
              pendingApprovals: [],
              activeApprovalId: null,
              statusMessage: "Returned to launcher."
            }))
          }
          onOpenSection={(sectionId) => openWorkspaceSection(activeProjectId, sectionId)}
          onOpenDocumentPath={(path, fromPath) => openWorkspaceDocumentPath(activeProjectId, path, fromPath)}
          onSaveDocument={(path, content) => saveWorkspaceDocument(activeProjectId, path, content)}
          onShowSettings={() => {
            void reloadConfig();
            setState((current) => ({ ...current, settingsOpen: true, statusMessage: "Settings online." }));
          }}
          sessionSnapshot={state.sessionSnapshot}
          chatRunning={state.chatRunning}
          agentMode={state.agentMode}
          toolDescriptors={state.toolDescriptors}
          toolEvents={state.toolEvents}
          customPromptApps={state.promptApps}
          promptAppsPath={state.promptAppsPath}
          pendingApprovals={state.pendingApprovals}
          activeApproval={activeApproval}
          onSelectApproval={(approvalId) =>
            setState((current) => ({
              ...current,
              activeApprovalId: approvalId
            }))
          }
          onResolveApproval={(approvalId, decision) => resolveApproval(activeProjectId, approvalId, decision)}
          onSetAgentMode={(mode) => setAgentMode(activeProjectId, mode)}
          onCreateSession={() => createSession(activeProjectId)}
          onOpenSession={(sessionId) => openSession(activeProjectId, sessionId)}
          onRenameSession={(sessionId, title) => renameSession(activeProjectId, sessionId, title)}
          onUpsertPromptApp={upsertPromptApp}
          onDeletePromptApp={deletePromptApp}
          onReloadPromptApps={reloadPromptApps}
          onSendMessage={(content) =>
            state.sessionSnapshot
              ? sendChatMessage(activeProjectId, state.sessionSnapshot.activeSessionId, content, activeDocumentPath, state.agentMode)
              : Promise.resolve()
          }
          thinkingByMessageId={state.thinkingByMessageId}
        />
        {settingsPanel}
        {commandPalette}
        {startupVisible ? <StartupSplash onComplete={hideStartup} /> : null}
      </>
    );
  }

  return (
    <>
      <Launcher
        appInfo={state.appInfo}
        projects={state.projects}
        templates={state.templates}
        registryPath={state.registryPath}
        defaultParentDir={state.defaultParentDir}
        bridgeAvailable={state.bridgeAvailable}
        statusMessage={state.statusMessage}
        error={state.error}
        onRegisterProject={registerProject}
        onChooseProjectParent={chooseProjectParent}
        onCreateProject={createProject}
        onOpenProject={openProject}
        onRefreshProjects={reloadProjects}
        onShowSettings={() => {
          void reloadConfig();
          setState((current) => ({ ...current, settingsOpen: true, statusMessage: "Settings online." }));
        }}
        onShowCommandPalette={() => setState((current) => ({ ...current, commandPaletteOpen: true }))}
        newProjectSignal={state.launcherNewProjectSignal}
      />
      {settingsPanel}
      {commandPalette}
      {startupVisible ? <StartupSplash onComplete={hideStartup} /> : null}
    </>
  );
}

type BuildCommandPaletteActionsInput = {
  state: BootstrapState;
  activeApproval: PendingToolApproval | null;
  onNewProject: () => void;
  onRegisterProject: () => void;
  onRefreshProjects: () => void;
  onOpenSettings: () => void;
  onBackToLauncher: () => void;
  onCreateSession: () => void;
  onSetAgentMode: (mode: AgentMode) => void;
  onOpenProject: (projectId: string) => void;
  onOpenSession: (sessionId: string) => void;
  onResolveApproval: (approvalId: string, decision: "approve" | "reject") => void;
};

function buildCommandPaletteActions({
  state,
  activeApproval,
  onNewProject,
  onRegisterProject,
  onRefreshProjects,
  onOpenSettings,
  onBackToLauncher,
  onCreateSession,
  onSetAgentMode,
  onOpenProject,
  onOpenSession,
  onResolveApproval
}: BuildCommandPaletteActionsInput): CommandPaletteAction[] {
  const workspaceOnline = Boolean(state.workspace);
  const bridgeOnline = state.bridgeAvailable;
  const actions: CommandPaletteAction[] = [
    {
      id: "project.new",
      label: "New Project",
      detail: "Open the product-dev template wizard.",
      group: "Project",
      shortcut: ["⌘", "N"],
      disabled: !bridgeOnline,
      run: onNewProject
    },
    {
      id: "project.register",
      label: "Register Existing",
      detail: "Add a local folder to the Plug mission registry.",
      group: "Project",
      shortcut: ["⌘", "O"],
      disabled: !bridgeOnline,
      run: onRegisterProject
    },
    {
      id: "project.refresh",
      label: "Refresh Registry",
      detail: "Reload project statuses from ~/.plug/projects.json.",
      group: "Project",
      shortcut: ["⌘", "R"],
      disabled: !bridgeOnline,
      run: onRefreshProjects
    },
    {
      id: "app.settings",
      label: "Settings",
      detail: "Configure providers, tool model, proxy, retry, and timeout.",
      group: "App",
      shortcut: ["⌘", ","],
      run: onOpenSettings
    },
    {
      id: "nav.launcher",
      label: "Back To Launcher",
      detail: "Leave the current project cockpit.",
      group: "Navigation",
      disabled: !workspaceOnline,
      run: onBackToLauncher
    },
    {
      id: "session.new",
      label: "New Session",
      detail: "Start a fresh conversation in the active project.",
      group: "Session",
      shortcut: ["⌘", "T"],
      disabled: !workspaceOnline || state.chatRunning,
      run: onCreateSession
    },
    {
      id: "agent.plan",
      label: "Switch To Plan",
      detail: "Restrict Plug to read-only planning tools.",
      group: "Agent",
      shortcut: ["⌘", "P"],
      disabled: !workspaceOnline || state.agentMode === "plan",
      run: () => onSetAgentMode("plan")
    },
    {
      id: "agent.execute",
      label: "Switch To Execute",
      detail: "Enable write, memory, web, and shell tools with policy gates.",
      group: "Agent",
      shortcut: ["⌘", "P"],
      disabled: !workspaceOnline || state.agentMode === "execute",
      run: () => onSetAgentMode("execute")
    }
  ];

  if (activeApproval) {
    actions.push(
      {
        id: "approval.approve",
        label: "Approve Pending Diff",
        detail: activeApproval.title,
        group: "Authorization",
        shortcut: ["Y"],
        run: () => onResolveApproval(activeApproval.id, "approve")
      },
      {
        id: "approval.reject",
        label: "Reject Pending Diff",
        detail: activeApproval.title,
        group: "Authorization",
        shortcut: ["N"],
        run: () => onResolveApproval(activeApproval.id, "reject")
      }
    );
  }

  for (const [index, session] of state.sessionSnapshot?.sessions.entries() ?? []) {
    actions.push({
      id: `session.open.${session.id}`,
      label: `Open Session ${index + 1}`,
      detail: session.title,
      group: "Session",
      shortcut: index < 9 ? ["⌘", String(index + 1)] : undefined,
      disabled: !workspaceOnline || state.chatRunning,
      run: () => onOpenSession(session.id)
    });
  }

  for (const project of state.projects.slice(0, 8)) {
    actions.push({
      id: `project.open.${project.id}`,
      label: `Open ${project.name}`,
      detail: project.path,
      group: "Project",
      disabled: !bridgeOnline || project.status === "missing",
      run: () => onOpenProject(project.id)
    });
  }

  return actions;
}

function createStreamId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getSessionToolEvents(sessionSnapshot: SessionSnapshot): ToolStreamEvent[] {
  return sessionSnapshot.session.toolEvents.slice(0, 16);
}

function applyChatStreamEvent(state: BootstrapState, event: ChatStreamEvent): BootstrapState {
  if (event.type === "session" || event.type === "done") {
    return {
      ...state,
      sessionSnapshot: event.snapshot,
      toolEvents: getSessionToolEvents(event.snapshot),
      chatRunning: event.type !== "done",
      statusMessage: event.type === "done" ? "Chat stream complete." : "Chat stream running.",
      error: null
    };
  }

  if (event.type === "assistant-start") {
    if (!state.sessionSnapshot) {
      return state;
    }

    return {
      ...state,
      chatRunning: true,
      sessionSnapshot: {
        ...state.sessionSnapshot,
        session: {
          ...state.sessionSnapshot.session,
          messages: [...state.sessionSnapshot.session.messages, event.message]
        }
      }
    };
  }

  if (event.type === "delta") {
    if (!state.sessionSnapshot) {
      return state;
    }

    return {
      ...state,
      chatRunning: true,
      sessionSnapshot: {
        ...state.sessionSnapshot,
        session: {
          ...state.sessionSnapshot.session,
          messages: state.sessionSnapshot.session.messages.map((message) =>
            message.id === event.messageId
              ? {
                  ...message,
                  content: `${message.content}${event.delta}`
                }
              : message
          )
        }
      }
    };
  }

  if (event.type === "thinking-delta") {
    return {
      ...state,
      chatRunning: true,
      thinkingByMessageId: {
        ...state.thinkingByMessageId,
        [event.messageId]: (state.thinkingByMessageId[event.messageId] ?? "") + event.delta
      }
    };
  }

  if (event.type === "open-document") {
    // Record the request; a side-effect in App opens it and reveals the panel.
    return {
      ...state,
      openDocumentRequest: { path: event.path, nonce: Date.now() }
    };
  }

  return {
    ...state,
    chatRunning: false,
    error: event.message,
    statusMessage: null
  };
}

function applyToolStreamEvent(state: BootstrapState, event: ToolStreamEvent): BootstrapState {
  const pendingApproval = parsePendingApproval(event.details);
  const pendingApprovals = pendingApproval
    ? [pendingApproval, ...state.pendingApprovals.filter((approval) => approval.id !== pendingApproval.id)]
    : state.pendingApprovals;

  return {
    ...state,
    toolEvents: [event, ...state.toolEvents.filter((entry) => entry.invocationId !== event.invocationId)].slice(0, 16),
    pendingApprovals,
    activeApprovalId: pendingApproval ? pendingApproval.id : state.activeApprovalId,
    statusMessage: `Tool ${event.toolName}: ${event.message}`,
    error: event.phase === "error" ? event.message : state.error
  };
}

function parsePendingApproval(value: unknown): PendingToolApproval | null {
  const parsed = pendingToolApprovalSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

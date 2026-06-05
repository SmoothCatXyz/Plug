import type { ToolStreamEvent } from "./tool-schema";

export const APP_NAME = "Plug" as const;

export type {
  AgentMode,
  PendingToolApproval,
  ToolApprovalDecision,
  ToolApprovalPreview,
  ToolDescriptor,
  ToolInvocationResult,
  ToolStreamEvent
} from "./tool-schema";

export type RuntimeEnvironment = "development" | "production";

export type ProjectSummary = {
  id: string;
  name: string;
  path: string;
  status: "active" | "standby" | "missing";
  createdAt: string;
  updatedAt: string;
};

export type TemplateSummary = {
  id: string;
  label: string;
  description: string;
  icon: string;
  defaultModel: string;
  sections: string[];
};

export type ProjectSection = {
  id: string;
  label: string;
  path: string;
  type: "file" | "folder" | "git";
  aiWrite: "auto" | "confirm" | "readonly";
  icon: string;
};

export type ProjectManifest = {
  version: number;
  name: string;
  templateId: string;
  createdAt: string;
  updatedAt: string;
  model: {
    default: string;
    planning: string;
  };
  code?: {
    type: string;
    url: string;
    branch: string;
  };
  sections: ProjectSection[];
};

export type WorkspaceDocument = {
  sectionId: string;
  path: string;
  title: string;
  content: string;
};

export type WorkspaceSnapshot = {
  project: ProjectSummary;
  manifest: ProjectManifest;
  document: WorkspaceDocument;
};

export type ProviderType = "openai-compatible";

export type ProxyMode = "off" | "http" | "socks5";

export type ProviderProxyMode = "global" | "off" | "custom";

export type ProviderSummary = {
  id: string;
  label: string;
  type: ProviderType;
  baseURL: string;
  models: string[];
  defaultModel: string;
  proxyMode: ProviderProxyMode;
  proxyUrl: string;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProviderDraft = {
  id?: string;
  label: string;
  type: ProviderType;
  baseURL: string;
  models: string[];
  defaultModel: string;
  proxyMode: ProviderProxyMode;
  proxyUrl: string;
  apiKey?: string;
};

export type ToolModelSelection = {
  providerId: string;
  modelId: string;
};

export type NetworkConfig = {
  proxyMode: ProxyMode;
  proxyUrl: string;
  timeoutMs: number;
  longTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
};

export type AppConfigSnapshot = {
  configPath: string;
  providers: ProviderSummary[];
  chatModel: ToolModelSelection;
  toolModel: ToolModelSelection;
  network: NetworkConfig;
};

export type ProviderTestAttempt = {
  attempt: number;
  status: "running" | "retry" | "success" | "failed";
  durationMs: number;
  retryDelayMs: number;
  message: string;
};

export type ProviderTestResult = {
  ok: boolean;
  providerId: string;
  modelId: string;
  durationMs: number;
  message: string;
  attempts: ProviderTestAttempt[];
};

export type PromptAppField = {
  id: string;
  label: string;
  placeholder: string;
  multiline: boolean;
};

export type CustomPromptApp = {
  id: string;
  name: string;
  description: string;
  outputSection: string;
  fields: PromptAppField[];
  promptTemplate: string;
  createdAt: string;
  updatedAt: string;
};

export type PromptAppDraft = {
  id?: string;
  name: string;
  description: string;
  outputSection: string;
  fields: PromptAppField[];
  promptTemplate: string;
};

export type PromptAppSnapshot = {
  path: string;
  apps: CustomPromptApp[];
};

export type McpTransportType = "stdio";

export type McpServerConfig = {
  id: string;
  label: string;
  transport: McpTransportType;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  aiWriteLevel: "read" | "auto" | "confirm";
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
};

export type McpServerDraft = {
  id?: string;
  label: string;
  transport: McpTransportType;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  aiWriteLevel: "read" | "auto" | "confirm";
  timeoutMs: number;
};

export type McpServerHealth = {
  serverId: string;
  label: string;
  ok: boolean;
  enabled: boolean;
  toolCount: number;
  message: string;
  checkedAt: string;
};

export type McpConfigSnapshot = {
  path: string;
  servers: McpServerConfig[];
};

export type TokenSavingsPtcDaily = {
  date: string;
  runs: number;
  toolCalls: number;
  savedTokens: number;
};

export type TokenSavingsPtcStats = {
  available: boolean;
  totalRuns: number;
  totalToolCalls: number;
  totalResultTokens: number;
  totalStdoutTokens: number;
  totalSavedTokens: number;
  daily: TokenSavingsPtcDaily[];
  updatedAt: string;
};

export type TokenSavingsRtkSummary = {
  totalCommands: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalSavedTokens: number;
  avgSavingsPct: number;
  totalTimeMs: number;
  avgTimeMs: number;
};

export type TokenSavingsRtkDaily = {
  date: string;
  commands: number;
  inputTokens: number;
  outputTokens: number;
  savedTokens: number;
};

export type TokenSavingsRtkCommand = {
  command: string;
  count: number;
  savedTokens: number;
  avgSavingsPct: number;
};

export type TokenSavingsRtkRecent = {
  id: string;
  command: string;
  inputTokens: number;
  outputTokens: number;
  savedTokens: number;
  savingsPct: number;
  timeMs: number;
  createdAt: string;
};

export type TokenSavingsRtkStats = {
  available: boolean;
  summary: TokenSavingsRtkSummary;
  daily: TokenSavingsRtkDaily[];
  byCommand: TokenSavingsRtkCommand[];
  recent: TokenSavingsRtkRecent[];
};

export type TokenSavingsSnapshot = {
  path: string;
  ptc: TokenSavingsPtcStats;
  rtk: TokenSavingsRtkStats;
};

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export type UpdateDownloadProgress = {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
};

export type UpdateSnapshot = {
  status: UpdateStatus;
  currentVersion: string;
  updateVersion: string | null;
  releaseName: string | null;
  releaseDate: string | null;
  releaseNotes: string | null;
  error: string | null;
  downloaded: boolean;
  canCheck: boolean;
  canDownload: boolean;
  canInstall: boolean;
  progress: UpdateDownloadProgress | null;
};

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type PlugSession = {
  version: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  toolEvents: ToolStreamEvent[];
};

export type SessionSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  active: boolean;
};

export type SessionSnapshot = {
  projectId: string;
  activeSessionId: string;
  sessions: SessionSummary[];
  session: PlugSession;
};

export type ChatStreamEvent =
  | {
      streamId: string;
      type: "session";
      snapshot: SessionSnapshot;
    }
  | {
      streamId: string;
      type: "assistant-start";
      message: ChatMessage;
    }
  | {
      streamId: string;
      type: "delta";
      messageId: string;
      delta: string;
    }
  | {
      streamId: string;
      type: "thinking-delta";
      messageId: string;
      delta: string;
    }
  | {
      streamId: string;
      type: "done";
      snapshot: SessionSnapshot;
    }
  | {
      streamId: string;
      type: "open-document";
      path: string;
    }
  | {
      streamId: string;
      type: "error";
      message: string;
    };

export type AppInfo = {
  name: typeof APP_NAME;
  version: string;
  environment: RuntimeEnvironment;
};

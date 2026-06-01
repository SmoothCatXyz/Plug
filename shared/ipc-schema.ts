import { z } from "zod";
import { APP_NAME } from "./types";
import {
  aiWriteLevelSchema,
  agentModeSchema,
  pendingToolApprovalSchema,
  toolApprovalDecisionSchema,
  toolDescriptorSchema,
  toolInvocationResultSchema,
  toolStreamEventSchema
} from "./tool-schema";

export const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  status: z.enum(["active", "standby", "missing"]),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const templateSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  icon: z.string(),
  defaultModel: z.string(),
  sections: z.array(z.string())
});

export const projectSectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  path: z.string(),
  type: z.enum(["file", "folder", "git"]),
  aiWrite: z.enum(["auto", "confirm", "readonly"]),
  icon: z.string()
});

export const projectManifestSchema = z.object({
  version: z.number(),
  name: z.string(),
  templateId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  model: z.object({
    default: z.string(),
    planning: z.string()
  }),
  code: z
    .object({
      type: z.string(),
      url: z.string(),
      branch: z.string()
    })
    .optional(),
  sections: z.array(projectSectionSchema)
});

export const workspaceDocumentSchema = z.object({
  sectionId: z.string(),
  path: z.string(),
  title: z.string(),
  content: z.string()
});

export const workspaceSnapshotSchema = z.object({
  project: projectSummarySchema,
  manifest: projectManifestSchema,
  document: workspaceDocumentSchema
});

export const providerSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.literal("openai-compatible"),
  baseURL: z.string(),
  models: z.array(z.string()),
  defaultModel: z.string(),
  proxyMode: z.enum(["global", "off", "custom"]),
  proxyUrl: z.string(),
  hasApiKey: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const providerDraftSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  type: z.literal("openai-compatible"),
  baseURL: z.string().min(1),
  models: z.array(z.string().min(1)).min(1),
  defaultModel: z.string().min(1),
  proxyMode: z.enum(["global", "off", "custom"]),
  proxyUrl: z.string(),
  apiKey: z.string().optional()
});

export const toolModelSelectionSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1)
});

export const networkConfigSchema = z.object({
  proxyMode: z.enum(["off", "http", "socks5"]),
  proxyUrl: z.string(),
  timeoutMs: z.number().int().min(1000).max(600000),
  longTimeoutMs: z.number().int().min(1000).max(900000),
  maxRetries: z.number().int().min(0).max(6),
  retryBaseDelayMs: z.number().int().min(0).max(30000)
});

export const appConfigSnapshotSchema = z.object({
  configPath: z.string(),
  providers: z.array(providerSummarySchema),
  toolModel: toolModelSelectionSchema,
  network: networkConfigSchema
});

export const providerTestAttemptSchema = z.object({
  attempt: z.number().int(),
  status: z.enum(["running", "retry", "success", "failed"]),
  durationMs: z.number().int(),
  retryDelayMs: z.number().int(),
  message: z.string()
});

export const providerTestResultSchema = z.object({
  ok: z.boolean(),
  providerId: z.string(),
  modelId: z.string(),
  durationMs: z.number().int(),
  message: z.string(),
  attempts: z.array(providerTestAttemptSchema)
});

export const promptAppFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  placeholder: z.string(),
  multiline: z.boolean()
});

export const customPromptAppSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  outputSection: z.string(),
  fields: z.array(promptAppFieldSchema),
  promptTemplate: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const promptAppDraftSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string(),
  outputSection: z.string(),
  fields: z.array(promptAppFieldSchema),
  promptTemplate: z.string().min(1)
});

export const promptAppSnapshotSchema = z.object({
  path: z.string(),
  apps: z.array(customPromptAppSchema)
});

export const mcpTransportSchema = z.literal("stdio");

export const mcpServerConfigSchema = z.object({
  id: z.string(),
  label: z.string(),
  transport: mcpTransportSchema,
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string()),
  enabled: z.boolean(),
  aiWriteLevel: aiWriteLevelSchema,
  timeoutMs: z.number().int().min(500).max(120000),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const mcpServerDraftSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  transport: mcpTransportSchema,
  command: z.string().min(1),
  args: z.array(z.string()),
  env: z.record(z.string()),
  enabled: z.boolean(),
  aiWriteLevel: aiWriteLevelSchema,
  timeoutMs: z.number().int().min(500).max(120000)
});

export const mcpServerHealthSchema = z.object({
  serverId: z.string(),
  label: z.string(),
  ok: z.boolean(),
  enabled: z.boolean(),
  toolCount: z.number().int(),
  message: z.string(),
  checkedAt: z.string()
});

export const mcpConfigSnapshotSchema = z.object({
  path: z.string(),
  servers: z.array(mcpServerConfigSchema)
});

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string()
});

export const plugSessionSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(chatMessageSchema),
  toolEvents: z.array(toolStreamEventSchema).default([])
});

export const sessionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messageCount: z.number().int(),
  active: z.boolean()
});

export const sessionSnapshotSchema = z.object({
  projectId: z.string(),
  activeSessionId: z.string(),
  sessions: z.array(sessionSummarySchema),
  session: plugSessionSchema
});

export const ipcSchemas = {
  "app.info": {
    request: z.object({}),
    response: z.object({
      name: z.literal(APP_NAME),
      version: z.string(),
      environment: z.enum(["development", "production"])
    })
  },
  "project.list": {
    request: z.object({}),
    response: z.object({
      projects: z.array(projectSummarySchema)
    })
  },
  "project.add": {
    request: z.object({
      path: z.string().min(1)
    }),
    response: z.object({
      project: projectSummarySchema,
      projects: z.array(projectSummarySchema)
    })
  },
  "project.addFromDialog": {
    request: z.object({}),
    response: z.object({
      cancelled: z.boolean(),
      project: projectSummarySchema.nullable(),
      projects: z.array(projectSummarySchema)
    })
  },
  "project.open": {
    request: z.object({
      id: z.string().min(1)
    }),
    response: z.object({
      project: projectSummarySchema,
      projects: z.array(projectSummarySchema)
    })
  },
  "project.registryPath": {
    request: z.object({}),
    response: z.object({
      path: z.string()
    })
  },
  "template.list": {
    request: z.object({}),
    response: z.object({
      templates: z.array(templateSummarySchema)
    })
  },
  "template.defaultParentDir": {
    request: z.object({}),
    response: z.object({
      path: z.string()
    })
  },
  "template.chooseParentDir": {
    request: z.object({}),
    response: z.object({
      cancelled: z.boolean(),
      path: z.string().nullable()
    })
  },
  "project.createFromTemplate": {
    request: z.object({
      templateId: z.string().min(1),
      projectName: z.string().min(1),
      parentDir: z.string().min(1),
      defaultModel: z.string(),
      planningModel: z.string(),
      gitUrl: z.string(),
      gitBranch: z.string()
    }),
    response: z.object({
      project: projectSummarySchema,
      projects: z.array(projectSummarySchema)
    })
  },
  "workspace.load": {
    request: z.object({
      projectId: z.string().min(1)
    }),
    response: workspaceSnapshotSchema
  },
  "workspace.openSection": {
    request: z.object({
      projectId: z.string().min(1),
      sectionId: z.string().min(1)
    }),
    response: workspaceDocumentSchema
  },
  "workspace.openDocumentPath": {
    request: z.object({
      projectId: z.string().min(1),
      path: z.string().min(1),
      // Empty string is allowed and means "resolve against the project root"
      // (used when the agent reveals a doc by its root-relative path).
      fromPath: z.string().optional()
    }),
    response: workspaceDocumentSchema
  },
  "workspace.saveDocument": {
    request: z.object({
      projectId: z.string().min(1),
      path: z.string().min(1),
      content: z.string()
    }),
    response: workspaceDocumentSchema
  },
  "config.get": {
    request: z.object({}),
    response: appConfigSnapshotSchema
  },
  "config.upsertProvider": {
    request: providerDraftSchema,
    response: appConfigSnapshotSchema
  },
  "config.deleteProvider": {
    request: z.object({
      id: z.string().min(1)
    }),
    response: appConfigSnapshotSchema
  },
  "config.setToolModel": {
    request: toolModelSelectionSchema,
    response: appConfigSnapshotSchema
  },
  "config.setNetwork": {
    request: networkConfigSchema,
    response: appConfigSnapshotSchema
  },
  "config.testProvider": {
    request: z.object({
      providerId: z.string().min(1),
      modelId: z.string().min(1).optional(),
      longTimeout: z.boolean().optional()
    }),
    response: providerTestResultSchema
  },
  "promptApp.list": {
    request: z.object({}),
    response: promptAppSnapshotSchema
  },
  "promptApp.upsert": {
    request: promptAppDraftSchema,
    response: promptAppSnapshotSchema
  },
  "promptApp.delete": {
    request: z.object({
      id: z.string().min(1)
    }),
    response: promptAppSnapshotSchema
  },
  "mcp.list": {
    request: z.object({}),
    response: mcpConfigSnapshotSchema
  },
  "mcp.upsert": {
    request: mcpServerDraftSchema,
    response: mcpConfigSnapshotSchema
  },
  "mcp.delete": {
    request: z.object({
      id: z.string().min(1)
    }),
    response: mcpConfigSnapshotSchema
  },
  "mcp.health": {
    request: z.object({
      id: z.string().min(1).optional()
    }),
    response: z.object({
      checks: z.array(mcpServerHealthSchema)
    })
  },
  "session.list": {
    request: z.object({
      projectId: z.string().min(1)
    }),
    response: sessionSnapshotSchema
  },
  "session.create": {
    request: z.object({
      projectId: z.string().min(1)
    }),
    response: sessionSnapshotSchema
  },
  "session.open": {
    request: z.object({
      projectId: z.string().min(1),
      sessionId: z.string().min(1)
    }),
    response: sessionSnapshotSchema
  },
  "session.rename": {
    request: z.object({
      projectId: z.string().min(1),
      sessionId: z.string().min(1),
      title: z.string().min(1)
    }),
    response: sessionSnapshotSchema
  },
  "chat.send": {
    request: z.object({
      streamId: z.string().min(1),
      projectId: z.string().min(1),
      sessionId: z.string().min(1),
      content: z.string().min(1),
      currentDocumentPath: z.string().min(1),
      agentMode: agentModeSchema
    }),
    response: sessionSnapshotSchema
  },
  "tool.list": {
    request: z.object({
      projectId: z.string().min(1),
      mode: agentModeSchema
    }),
    response: z.object({
      tools: z.array(toolDescriptorSchema)
    })
  },
  "tool.invoke": {
    request: z.object({
      invocationId: z.string().min(1),
      projectId: z.string().min(1),
      mode: agentModeSchema,
      name: z.string().min(1),
      input: z.unknown()
    }),
    response: toolInvocationResultSchema
  },
  "tool.pendingApprovals": {
    request: z.object({
      projectId: z.string().min(1)
    }),
    response: z.object({
      approvals: z.array(pendingToolApprovalSchema)
    })
  },
  "tool.resolveApproval": {
    request: z.object({
      projectId: z.string().min(1),
      approvalId: z.string().min(1),
      decision: z.enum(["approve", "reject"])
    }),
    response: toolApprovalDecisionSchema
  },
  "relay.status": {
    request: z.object({}),
    response: z.object({
      running: z.boolean(),
      port: z.number().int(),
      token: z.string(),
      connected: z.boolean(),
      tabInfo: z
        .object({
          tabId: z.number().int(),
          url: z.string(),
          title: z.string()
        })
        .nullable()
    })
  },
  "relay.getToken": {
    request: z.object({}),
    response: z.object({
      token: z.string()
    })
  },
  "whisper.getConfig": {
    request: z.object({}),
    response: z.object({
      apiKey: z.string(),
      baseURL: z.string()
    })
  }
} as const;

export type IpcSchemas = typeof ipcSchemas;
export type IpcChannel = keyof IpcSchemas;
export type IpcRequest<TChannel extends IpcChannel> = z.infer<IpcSchemas[TChannel]["request"]>;
export type IpcResponse<TChannel extends IpcChannel> = z.infer<IpcSchemas[TChannel]["response"]>;

export type PlugApi = {
  invoke<TChannel extends IpcChannel>(
    channel: TChannel,
    payload: IpcRequest<TChannel>
  ): Promise<IpcResponse<TChannel>>;
  onChatEvent(listener: (event: import("./types").ChatStreamEvent) => void): () => void;
  onToolEvent(listener: (event: import("./types").ToolStreamEvent) => void): () => void;
};

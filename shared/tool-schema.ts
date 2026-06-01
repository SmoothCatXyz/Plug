import { z } from "zod";

export const aiWriteLevelSchema = z.enum(["read", "auto", "confirm"]);
export const toolCategorySchema = z.enum(["file", "web", "shell", "memory", "mcp", "artifact"]);
export const agentModeSchema = z.enum(["plan", "execute", "auto"]);

export const toolParameterHintSchema = z.object({
  name: z.string(),
  required: z.boolean(),
  description: z.string()
});

export const toolDescriptorSchema = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string(),
  aiWriteLevel: aiWriteLevelSchema,
  category: toolCategorySchema,
  parameters: z.array(toolParameterHintSchema)
});

export const toolApprovalPreviewSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    path: z.string(),
    content: z.string()
  }),
  z.object({
    action: z.literal("edit"),
    path: z.string(),
    oldContent: z.string(),
    newContent: z.string()
  }),
  z.object({
    action: z.literal("delete"),
    path: z.string(),
    oldContent: z.string()
  }),
  z.object({
    action: z.literal("command"),
    cmd: z.string(),
    cwd: z.string()
  }),
  z.object({
    action: z.literal("mcp"),
    serverId: z.string(),
    serverLabel: z.string(),
    toolName: z.string(),
    arguments: z.record(z.unknown())
  }),
  z.object({
    action: z.literal("move"),
    fromPath: z.string(),
    toPath: z.string()
  })
]);

export const pendingToolApprovalSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  toolName: z.string(),
  title: z.string(),
  reason: z.string(),
  input: z.unknown(),
  preview: toolApprovalPreviewSchema,
  createdAt: z.string()
});

export const toolApprovalDecisionSchema = z.object({
  approval: pendingToolApprovalSchema,
  decision: z.enum(["approve", "reject"]),
  status: z.enum(["approved", "rejected"]),
  appliedPath: z.string().optional(),
  message: z.string()
});

export const toolInvocationResultSchema = z.object({
  invocationId: z.string(),
  toolName: z.string(),
  status: z.enum(["success", "pending_approval", "error"]),
  durationMs: z.number().int().min(0),
  summary: z.string(),
  output: z.unknown().optional(),
  pendingApproval: pendingToolApprovalSchema.optional(),
  error: z.string().optional()
});

export const toolStreamEventSchema = z.object({
  invocationId: z.string(),
  projectId: z.string(),
  toolName: z.string(),
  phase: z.enum(["starting", "running", "retry", "pending_approval", "success", "error"]),
  message: z.string(),
  details: z.unknown().optional(),
  createdAt: z.string()
});

export type AiWriteLevel = z.infer<typeof aiWriteLevelSchema>;
export type ToolCategory = z.infer<typeof toolCategorySchema>;
export type AgentMode = z.infer<typeof agentModeSchema>;
export type ToolParameterHint = z.infer<typeof toolParameterHintSchema>;
export type ToolDescriptor = z.infer<typeof toolDescriptorSchema>;
export type ToolApprovalPreview = z.infer<typeof toolApprovalPreviewSchema>;
export type PendingToolApproval = z.infer<typeof pendingToolApprovalSchema>;
export type ToolApprovalDecision = z.infer<typeof toolApprovalDecisionSchema>;
export type ToolInvocationResult = z.infer<typeof toolInvocationResultSchema>;
export type ToolStreamEvent = z.infer<typeof toolStreamEventSchema>;

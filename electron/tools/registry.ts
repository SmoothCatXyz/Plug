import { randomUUID } from "node:crypto";
import type { ZodType } from "zod";
import type {
  AgentMode,
  AiWriteLevel,
  PendingToolApproval,
  ToolCategory,
  ToolDescriptor,
  ToolInvocationResult,
  ToolParameterHint,
  ToolStreamEvent
} from "../../shared/tool-schema";
import type { ProjectSummary } from "../../shared/types";

export type ToolExecutionContext = {
  project: ProjectSummary;
  mode: AgentMode;
  invocationId: string;
  emit: (event: ToolStreamEvent) => void;
};

export type ToolHandlerResult = {
  summary: string;
  output?: unknown;
  pendingApproval?: PendingToolApproval;
};

export type AgentTool<TInput> = {
  name: string;
  label: string;
  description: string;
  category: ToolCategory;
  aiWriteLevel: AiWriteLevel;
  parameters: ZodType<TInput>;
  parameterHints: ToolParameterHint[];
  execute: (input: TInput, context: ToolExecutionContext) => Promise<ToolHandlerResult>;
};

export type ToolInvokeOptions = {
  project: ProjectSummary;
  mode: AgentMode;
  name: string;
  input: unknown;
  invocationId?: string;
  emit?: (event: ToolStreamEvent) => void;
};

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool<unknown>>();

  register<TInput>(tool: AgentTool<TInput>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool is already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool as AgentTool<unknown>);
  }

  list(mode: AgentMode): ToolDescriptor[] {
    return this.available(mode)
      .map((tool) => ({
        name: tool.name,
        label: tool.label,
        description: tool.description,
        category: tool.category,
        aiWriteLevel: tool.aiWriteLevel,
        parameters: tool.parameterHints
      }));
  }

  available(mode: AgentMode): AgentTool<unknown>[] {
    return [...this.tools.values()].filter((tool) => isToolAllowedInMode(tool, mode));
  }

  get(name: string): AgentTool<unknown> | null {
    return this.tools.get(name) ?? null;
  }

  async invoke(options: ToolInvokeOptions): Promise<ToolInvocationResult> {
    const tool = this.get(options.name);
    const invocationId = options.invocationId ?? randomUUID();
    const startedAt = Date.now();
    const emit = (phase: ToolStreamEvent["phase"], message: string, details?: unknown): void => {
      options.emit?.({
        invocationId,
        projectId: options.project.id,
        toolName: options.name,
        phase,
        message,
        details,
        createdAt: new Date().toISOString()
      });
    };
    const finish = (
      result: Omit<ToolInvocationResult, "invocationId" | "toolName" | "durationMs">
    ): ToolInvocationResult => ({
      invocationId,
      toolName: options.name,
      durationMs: Date.now() - startedAt,
      ...result
    });

    if (!tool) {
      const summary = `Tool is not registered: ${options.name}`;
      emit("error", summary);
      return finish({ status: "error", summary, error: summary });
    }

    if (!isToolAllowedInMode(tool, options.mode)) {
      const summary = `${tool.name} is not available in ${options.mode} mode.`;
      emit("error", summary);
      return finish({ status: "error", summary, error: summary });
    }

    const parsedInput = tool.parameters.safeParse(options.input);

    if (!parsedInput.success) {
      const summary = `${tool.name} input failed validation.`;
      emit("error", summary, parsedInput.error.flatten());
      return finish({
        status: "error",
        summary,
        error: parsedInput.error.issues.map((issue) => issue.message).join("; ")
      });
    }

    emit("starting", `Starting ${tool.name}.`);

    try {
      const response = await tool.execute(parsedInput.data, {
        project: options.project,
        mode: options.mode,
        invocationId,
        emit: (event) => options.emit?.(event)
      });
      const status = response.pendingApproval ? "pending_approval" : "success";
      const durationMs = Date.now() - startedAt;
      emit(
        status,
        response.summary,
        response.pendingApproval ?? {
          summary: response.summary,
          durationMs,
          output: response.output
        }
      );

      return finish({
        status,
        summary: response.summary,
        output: response.output,
        pendingApproval: response.pendingApproval
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown tool execution error";
      emit("error", message);
      return finish({
        status: "error",
        summary: message,
        error: message
      });
    }
  }
}

function isToolAllowedInMode(tool: AgentTool<unknown>, mode: AgentMode): boolean {
  if (mode === "plan") {
    return tool.aiWriteLevel === "read";
  }

  return true;
}

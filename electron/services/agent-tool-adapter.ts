import { tool as aiTool, type ToolSet } from "ai";
import type { AgentMode, ToolInvocationResult, ToolStreamEvent } from "../../shared/types";
import { invokeAgentTool, listAgentToolDefinitions } from "./agent-service";

type CreateAgentToolSetInput = {
  streamId: string;
  projectId: string;
  mode: AgentMode;
  emitTool: (event: ToolStreamEvent) => void;
};

export async function createAgentToolSet(input: CreateAgentToolSetInput): Promise<ToolSet> {
  const definitions = await listAgentToolDefinitions(input.projectId, input.mode);
  const entries = definitions.map((definition) => [
    definition.name,
    aiTool({
      title: definition.label,
      description: buildToolDescription(definition),
      inputSchema: definition.parameters,
      execute: async (toolInput: unknown, executionOptions) => {
        const result = await invokeAgentTool({
          invocationId: `${input.streamId}:${executionOptions.toolCallId}`,
          projectId: input.projectId,
          mode: input.mode,
          name: definition.name,
          input: toolInput,
          emit: input.emitTool
        });

        return summarizeToolResultForModel(result);
      }
    })
  ]);

  return Object.fromEntries(entries) as ToolSet;
}

function buildToolDescription(definition: Awaited<ReturnType<typeof listAgentToolDefinitions>>[number]): string {
  const parameters = definition.parameterHints
    .map((parameter) => {
      const required = parameter.required ? "required" : "optional";
      return `- ${parameter.name} (${required}): ${parameter.description}`;
    })
    .join("\n");

  return [
    definition.description,
    `Category: ${definition.category}.`,
    `Write policy: ${definition.aiWriteLevel}.`,
    parameters ? `Parameters:\n${parameters}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function summarizeToolResultForModel(result: ToolInvocationResult): Record<string, unknown> {
  return {
    status: result.status,
    toolName: result.toolName,
    durationMs: result.durationMs,
    summary: result.summary,
    error: result.error,
    pendingApproval: result.pendingApproval
      ? {
          id: result.pendingApproval.id,
          title: result.pendingApproval.title,
          reason: result.pendingApproval.reason,
          preview: clipForModel(result.pendingApproval.preview)
        }
      : undefined,
    output: clipForModel(result.output)
  };
}

function clipForModel(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  const encoded = JSON.stringify(value);

  if (!encoded || encoded.length <= 4000) {
    return value;
  }

  return {
    truncated: true,
    preview: encoded.slice(0, 4000)
  };
}

import { tool as aiTool, type ToolSet } from "ai";
import { z } from "zod";
import type { AgentMode, ToolInvocationResult, ToolStreamEvent } from "../../shared/types";
import { invokeAgentTool, listAgentToolDefinitions } from "./agent-service";
import {
  buildProgrammaticToolDescription,
  runProgrammaticScript,
  shouldInjectProgrammaticTool
} from "./programmatic-tool-service";

const runScriptInputSchema = z.object({
  code: z.string().min(1)
});

type CreateAgentToolSetInput = {
  streamId: string;
  projectId: string;
  mode: AgentMode;
  emitTool: (event: ToolStreamEvent) => void;
};

export async function createAgentToolSet(input: CreateAgentToolSetInput): Promise<ToolSet> {
  const definitions = await listAgentToolDefinitions(input.projectId, input.mode);
  const entries: Array<[string, unknown]> = definitions.map((definition) => [
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

  if (shouldInjectProgrammaticTool(input.mode, definitions)) {
    entries.push([
      "run_script",
      aiTool({
        title: "Run Script",
        description: buildProgrammaticToolDescription(definitions),
        inputSchema: runScriptInputSchema,
        execute: async (toolInput, executionOptions) => {
          const result = await runProgrammaticScript(runScriptInputSchema.parse(toolInput), {
            invocationId: `${input.streamId}:${executionOptions.toolCallId}`,
            projectId: input.projectId,
            mode: input.mode,
            definitions,
            emit: input.emitTool,
            invokeTool: ({ invocationId, name, input: nestedInput }) =>
              invokeAgentTool({
                invocationId,
                projectId: input.projectId,
                mode: input.mode,
                name,
                input: nestedInput,
                emit: input.emitTool
              })
          });

          return summarizeProgrammaticResultForModel(result);
        }
      })
    ]);
  }

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

function summarizeProgrammaticResultForModel(result: Awaited<ReturnType<typeof runProgrammaticScript>>): Record<string, unknown> {
  return {
    status: result.success ? "success" : "error",
    toolName: "run_script",
    summary: result.success
      ? `run_script completed with ${result.toolCalls.length} internal tool calls and saved about ${result.savedTokens} tokens.`
      : result.error ?? "run_script failed.",
    output: {
      stdout: clipForModel(result.stdout),
      stderr: clipForModel(result.stderr),
      exitCode: result.exitCode,
      toolCalls: result.toolCalls.map((call) => ({
        name: call.name,
        ok: call.ok,
        durationMs: call.durationMs,
        error: call.error
      })),
      savedTokens: result.savedTokens,
      note: result.note
    }
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

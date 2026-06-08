import { tool as aiTool, streamText, stepCountIs, type ToolSet } from "ai";
import { z } from "zod";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { AgentMode, ToolStreamEvent } from "../../shared/types";
import { resolveToolProviderSecret } from "./config-service";
import { createProviderFetch } from "./network-service";
import { listAgentToolDefinitions, invokeAgentTool } from "./agent-service";
import {
  buildProgrammaticToolDescription,
  runProgrammaticScript,
  shouldInjectProgrammaticTool
} from "./programmatic-tool-service";
import { withPersona } from "./persona";
import { openDocumentTool } from "../tools/open-document";
import { writeDocumentTool } from "../tools/write-document";
import { createFileTool } from "../tools/create-file";

type ProviderSecret = Awaited<ReturnType<typeof resolveToolProviderSecret>>;

const runScriptInputSchema = z.object({
  code: z.string().min(1)
});

type SpecialistInput = {
  streamId: string;
  projectId: string;
  mode: AgentMode;
  emitTool: (event: ToolStreamEvent) => void;
  projectContext: string;
};

type CreateOrchestratorToolsInput = SpecialistInput;

// These describe the sub-role's SCOPE only — identity is owned by PLUG_PERSONA,
// which withPersona() prepends. Do not reintroduce "You are a … agent" here.
const SPECIALIST_PROMPTS: Record<string, string> = {
  research:
    "这次你负责网页调研:用网页工具完成被指派的调研任务,返回清晰、有结构的小结。",
  file: "这次你负责文件操作:准确完成被指派的文件任务,汇报读取、写入或查找到了什么。用户指定具体路径/文件名/扩展名时,尤其是 .json/.yaml/.csv/.txt/代码/配置文件,必须用 create_file 写入原始内容,不能改成 Markdown。只有写人类阅读的调研或文档时才优先用 write_document(section 选 knowledge 或 deliverables),它会直接落盘、刷新索引并在侧栏打开。",
  memory:
    "这次你负责项目记忆:按指示检索或更新项目记忆,汇报找到或保存了什么。",
  browser:
    "这次你负责浏览器操作:用 relay 工具完成被指派的浏览器任务,汇报找到或做了什么。",
  mcp: "这次你负责外部服务集成:用可用的外部服务工具完成被指派的任务,汇报取到或改动了什么。",
  shell:
    "这次你负责终端命令:用 run_command 请求项目目录内的 shell 命令。优先用 git/npm/ls/find/grep/test/tsc 等可被 RTK 压缩的命令；命令会先等待用户批准,批准后由 RTK binary 改写和压缩输出。",
  computer:
    "这次你负责桌面自动化:用 computer 工具观察屏幕并操作桌面。动手前永远先截图,确认当前状态再操作。"
};

function toLanguageModel(providerSecret: ProviderSecret) {
  const provider = createOpenAICompatible({
    name: providerSecret.provider.id,
    baseURL: providerSecret.provider.baseURL,
    apiKey: providerSecret.apiKey,
    fetch: createProviderFetch(providerSecret.network, {
      mode: providerSecret.provider.proxyMode,
      url: providerSecret.provider.proxyUrl
    })
  });

  return provider(providerSecret.modelId);
}

async function buildSpecialistToolSet(
  role: string,
  categories: string[],
  input: SpecialistInput
): Promise<ToolSet> {
  const definitions = await listAgentToolDefinitions(input.projectId, input.mode);

  const filtered = definitions.filter((definition) => {
    if (role === "browser") {
      return definition.name.startsWith("browser_");
    }

    if (role === "computer") {
      return definition.name.startsWith("computer_");
    }

    if (role === "shell") {
      return definition.name === "run_command";
    }

    if (role === "research") {
      return categories.includes(definition.category) && !definition.name.startsWith("browser_");
    }

    return categories.includes(definition.category);
  });

  const entries: Array<[string, unknown]> = filtered.map((definition) => {
    const description = [
      definition.description,
      `Category: ${definition.category}.`,
      `Write policy: ${definition.aiWriteLevel}.`,
      definition.parameterHints.length > 0
        ? `Parameters:\n${definition.parameterHints
            .map((p) => `- ${p.name} (${p.required ? "required" : "optional"}): ${p.description}`)
            .join("\n")}`
        : ""
    ]
      .filter(Boolean)
      .join("\n\n");

    return [
      definition.name,
      aiTool({
        title: definition.label,
        description,
        inputSchema: definition.parameters,
        execute: async (toolInput: unknown, executionOptions) => {
          const result = await invokeAgentTool({
            invocationId: `${input.streamId}:specialist-${executionOptions.toolCallId}`,
            projectId: input.projectId,
            mode: input.mode,
            name: definition.name,
            input: toolInput,
            emit: input.emitTool
          });

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
                  reason: result.pendingApproval.reason
                }
              : undefined,
            output: clipForModel(result.output)
          };
        }
      })
    ];
  });

  if (shouldInjectProgrammaticTool(input.mode, filtered)) {
    entries.push([
      "run_script",
      aiTool({
        title: "Run Script",
        description: buildProgrammaticToolDescription(filtered),
        inputSchema: runScriptInputSchema,
        execute: async (toolInput, executionOptions) => {
          const result = await runProgrammaticScript(runScriptInputSchema.parse(toolInput), {
            invocationId: `${input.streamId}:specialist-${role}-${executionOptions.toolCallId}`,
            projectId: input.projectId,
            mode: input.mode,
            definitions: filtered,
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

async function runSpecialist(
  role: string,
  task: string,
  categories: string[],
  input: SpecialistInput
): Promise<string> {
  const toolProviderSecret = await resolveToolProviderSecret();
  const tools = await buildSpecialistToolSet(role, categories, input);

  // Specialists are Plug working through a focused sub-role — same persona,
  // narrowed scope. Their reports sometimes surface to the user, so the voice
  // must stay consistent.
  const rolePrompt = SPECIALIST_PROMPTS[role] ?? "Complete the assigned task.";
  const systemPrompt = withPersona(
    `你现在作为 Plug 的一个专职分身在工作。\n${rolePrompt}\n专注完成被指派的子任务,做完用 Plug 一贯的口吻如实汇报,不要擅自扩大范围。`
  );

  // streamText (doStream), not generateText: the APIMart gateway returns a
  // streaming SSE body even for non-stream requests, which crashes the
  // non-streaming parser. streamText still supports tools + multi-step.
  const result = streamText({
    model: toLanguageModel(toolProviderSecret),
    system: systemPrompt,
    prompt: `Complete this task: ${task}\n\nProject: ${input.projectContext}`,
    tools,
    stopWhen: stepCountIs(10),
    maxRetries: toolProviderSecret.network.maxRetries
  });

  let text = "";
  for await (const delta of result.textStream) {
    text += delta;
  }

  return text || "(specialist completed with no text output)";
}

export async function createOrchestratorTools(input: CreateOrchestratorToolsInput): Promise<ToolSet> {
  return {
    delegate_research: aiTool({
      description:
        "Delegate web research to the research specialist. Use for: web_search, web_fetch, finding information online.",
      inputSchema: z.object({
        task: z.string().describe("Specific research task to complete")
      }),
      execute: async ({ task }) => {
        return runSpecialist("research", task, ["web"], input);
      }
    }),

    delegate_file_ops: aiTool({
      description:
        "Delegate file read/write/search operations to the file specialist. Use for: reading files, writing content, searching the project, creating/moving files.",
      inputSchema: z.object({
        task: z.string().describe("Specific file operation to perform")
      }),
      execute: async ({ task }) => {
        return runSpecialist("file", task, ["file"], input);
      }
    }),

    delegate_memory: aiTool({
      description:
        "Delegate memory operations to the memory specialist. Use for: searching memory, updating project memory with new insights.",
      inputSchema: z.object({
        task: z.string().describe("Memory operation to perform")
      }),
      execute: async ({ task }) => {
        return runSpecialist("memory", task, ["memory"], input);
      }
    }),

    delegate_browser: aiTool({
      description:
        "Delegate browser control to the browser specialist. Use for: screenshot, reading page content, navigating, clicking, typing in the relay Chrome tab.",
      inputSchema: z.object({
        task: z.string().describe("Browser task to perform")
      }),
      execute: async ({ task }) => {
        return runSpecialist("browser", task, ["web"], input);
      }
    }),

    delegate_mcp: aiTool({
      description:
        "Delegate a task to the MCP integration specialist. Use for: tasks that require external services connected via Model Context Protocol (MCP) servers — e.g. Feishu documents, Jira tickets, GitHub, any custom MCP server.",
      inputSchema: z.object({
        task: z.string().describe("Task to complete using MCP-connected external services")
      }),
      execute: async ({ task }) => {
        return runSpecialist("mcp", task, ["mcp"], input);
      }
    }),

    delegate_shell: aiTool({
      description:
        "Delegate project-local terminal commands to the shell specialist. Use for: git status/diff/log, npm scripts, tests, TypeScript checks, directory listings, grep/find, and other command output that RTK can compact.",
      inputSchema: z.object({
        task: z.string().describe("Specific shell command task to request")
      }),
      execute: async ({ task }) => {
        return runSpecialist("shell", task, ["shell"], input);
      }
    }),

    delegate_computer: aiTool({
      description:
        "Delegate computer automation tasks to the computer use specialist. Use for: taking screenshots of the desktop, typing text, pressing keys, clicking at screen coordinates.",
      inputSchema: z.object({
        task: z.string().describe("Computer automation task to perform")
      }),
      execute: async ({ task }) => {
        return runSpecialist("computer", task, ["shell"], input);
      }
    }),

    // Direct single-step skills — called by the orchestrator itself, NOT routed
    // through a specialist sub-agent. Delegating these adds a whole extra model
    // round-trip (~15s) for what is a single instant action, so they live here.
    create_file: directOrchestratorTool(createFileTool, input),
    write_document: directOrchestratorTool(writeDocumentTool, input),
    open_document: directOrchestratorTool(openDocumentTool, input)
  };
}

// Wrap a tool so the orchestrator can invoke it directly (no specialist agent).
function directOrchestratorTool(
  definition: { name: string; label: string; description: string; parameters: z.ZodTypeAny },
  input: CreateOrchestratorToolsInput
) {
  return aiTool({
    title: definition.label,
    description: definition.description,
    inputSchema: definition.parameters,
    execute: async (toolInput: unknown, executionOptions) => {
      const result = await invokeAgentTool({
        invocationId: `${input.streamId}:direct-${executionOptions.toolCallId}`,
        projectId: input.projectId,
        mode: input.mode,
        name: definition.name,
        input: toolInput,
        emit: input.emitTool
      });
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
              reason: result.pendingApproval.reason
            }
          : undefined,
        output: clipForModel(result.output)
      };
    }
  });
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

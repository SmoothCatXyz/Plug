import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  AgentMode,
  ToolDescriptor,
  ToolInvocationResult,
  ToolStreamEvent
} from "../../shared/types";
import type { AgentTool } from "../tools";
import {
  estimateTokens,
  recordProgrammaticToolRun
} from "./token-savings-service";
import { resolveRtkBinaryPath } from "./rtk-service";

const RUN_SCRIPT_TOOL_NAME = "run_script";
const PROGRAMMATIC_TIMEOUT_MS = 120000;
const MAX_STDIO_LENGTH = 20000;

type ProgrammaticToolCall = {
  name: string;
  ok: boolean;
  durationMs: number;
  resultTokens: number;
  error?: string;
};

export type ProgrammaticScriptResult = {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
  toolCalls: ProgrammaticToolCall[];
  savedTokens: number;
  note: string;
};

export type ProgrammaticScriptInput = {
  code: string;
};

type RunProgrammaticScriptOptions = {
  invocationId: string;
  projectId: string;
  mode: AgentMode;
  definitions: AgentTool<unknown>[];
  emit?: (event: ToolStreamEvent) => void;
  invokeTool: (options: {
    invocationId: string;
    name: string;
    input: unknown;
  }) => Promise<ToolInvocationResult>;
};

type ChildRequest =
  | {
      type: "toolCall";
      id: number;
      name: string;
      args: unknown;
    }
  | {
      type: "listTools";
      id: number;
    }
  | {
      type: "done";
      exitCode: number;
      error?: string;
    };

export function shouldInjectProgrammaticTool(_mode: AgentMode, definitions: AgentTool<unknown>[]): boolean {
  return definitions.some((definition) => definition.name !== RUN_SCRIPT_TOOL_NAME);
}

export function buildProgrammaticToolDescription(definitions: AgentTool<unknown>[]): string {
  const names = definitions
    .filter((definition) => definition.name !== RUN_SCRIPT_TOOL_NAME)
    .map((definition) => definition.name)
    .sort()
    .join(", ");

  return [
    "Run a short JavaScript program in a sandbox that can call the current Plug tools as functions.",
    "Use this when a task needs 3+ tool calls, loops, filtering, aggregation, or chained/conditional calls.",
    "Intermediate tool results stay inside the sandbox; only final stdout is returned to the model, which saves context tokens.",
    "Inside the script you can use: await plugTool(name, args), await almaTool(name, args), await listTools(), and await sh(cmd).",
    "Log only the final answer or compact data with console.log.",
    names ? `Available tools: ${names}.` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function getProgrammaticToolDescriptor(definitions: AgentTool<unknown>[]): ToolDescriptor {
  return {
    name: RUN_SCRIPT_TOOL_NAME,
    label: "Run Script",
    description: buildProgrammaticToolDescription(definitions),
    category: "shell",
    aiWriteLevel: "auto",
    parameters: [
      {
        name: "code",
        required: true,
        description: "Short JavaScript program to run. Use console.log for the final compact output."
      }
    ]
  };
}

export async function runProgrammaticScript(
  input: ProgrammaticScriptInput,
  options: RunProgrammaticScriptOptions
): Promise<ProgrammaticScriptResult> {
  emitRunScriptEvent(options, "starting", "Starting run_script.");
  const allowedDefinitions = options.definitions.filter((definition) => definition.name !== RUN_SCRIPT_TOOL_NAME);
  const allowedNames = new Set(allowedDefinitions.map((definition) => definition.name));
  const toolDescriptors = allowedDefinitions.map((definition) => ({
    name: definition.name,
    label: definition.label,
    description: definition.description,
    category: definition.category,
    aiWriteLevel: definition.aiWriteLevel,
    parameters: definition.parameterHints
  }));
  const tempDir = join(tmpdir(), `plug-run-script-${randomUUID()}`);
  const scriptPath = join(tempDir, "programmatic-tool-runner.mjs");
  const toolCalls: ProgrammaticToolCall[] = [];
  const rtkBinaryPath = await resolveRtkBinaryPath();
  let stdout = "";
  let stderr = "";
  let child: ChildProcess | null = null;

  await mkdir(tempDir, { recursive: true });
  await writeFile(scriptPath, createRunnerSource(input.code), "utf8");

  try {
    const result = await new Promise<ProgrammaticScriptResult>((resolve) => {
      let settled = false;
      let timeout: NodeJS.Timeout | null = null;
      let requestedExitCode: number | null = null;
      let requestedError: string | undefined;

      const settle = (result: ProgrammaticScriptResult): void => {
        if (settled) {
          return;
        }

        settled = true;

        if (timeout) {
          clearTimeout(timeout);
        }

        resolve(result);
      };

      child = fork(scriptPath, [], {
        cwd: process.cwd(),
        execArgv: [],
        silent: true,
        env: {
          ...process.env,
          PLUG_PTC: "1",
          ...(rtkBinaryPath ? { PLUG_RTK_PATH: rtkBinaryPath } : {})
        }
      });

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = clipText(stdout + chunk.toString("utf8"));
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = clipText(stderr + chunk.toString("utf8"));
      });
      child.on("message", (message: ChildRequest) => {
        if (!message || typeof message !== "object") {
          return;
        }

        if (message.type === "listTools") {
          sendToChild(child, {
            type: "listToolsResult",
            id: message.id,
            ok: true,
            result: toolDescriptors
          });
          return;
        }

        if (message.type === "toolCall") {
          void handleChildToolCall({
            message,
            allowedNames,
            toolCalls,
            options
          }).then((response) => {
            sendToChild(child, response);
          }).catch((error) => {
            sendToChild(child, {
              type: "toolResult",
              id: message.id,
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            });
          });
          return;
        }

        if (message.type === "done") {
          requestedExitCode = message.exitCode;
          requestedError = message.error;
        }
      });
      child.on("error", (error) => {
        settle(buildScriptResult({
          success: false,
          stdout,
          stderr,
          exitCode: 1,
          error: error.message,
          toolCalls
        }));
      });
      child.on("close", (code) => {
        const exitCode = requestedExitCode ?? code ?? 0;
        settle(buildScriptResult({
          success: exitCode === 0,
          stdout,
          stderr,
          exitCode,
          error: requestedError,
          toolCalls
        }));
      });

      timeout = setTimeout(() => {
        child?.kill("SIGTERM");
        settle(buildScriptResult({
          success: false,
          stdout,
          stderr: clipText(`${stderr}\nTimed out after ${PROGRAMMATIC_TIMEOUT_MS}ms.`),
          exitCode: 124,
          error: `run_script timed out after ${PROGRAMMATIC_TIMEOUT_MS}ms.`,
          toolCalls
        }));
      }, PROGRAMMATIC_TIMEOUT_MS);
    });

    await recordProgrammaticToolRun({
      toolCalls: result.toolCalls.length,
      resultTokens: result.toolCalls.reduce((total, call) => total + call.resultTokens, 0),
      stdoutTokens: estimateTokens(result.stdout)
    });

    emitRunScriptEvent(
      options,
      result.success ? "success" : "error",
      result.success
        ? `run_script completed with ${result.toolCalls.length} internal tool calls.`
        : result.error ?? "run_script failed.",
      result
    );

    return result;
  } finally {
    killChildProcess(child);
    await rm(tempDir, { recursive: true, force: true });
  }
}

function killChildProcess(child: ChildProcess | null): void {
  child?.kill();
}

function emitRunScriptEvent(
  options: RunProgrammaticScriptOptions,
  phase: ToolStreamEvent["phase"],
  message: string,
  details?: unknown
): void {
  options.emit?.({
    invocationId: options.invocationId,
    projectId: options.projectId,
    toolName: RUN_SCRIPT_TOOL_NAME,
    phase,
    message,
    details,
    createdAt: new Date().toISOString()
  });
}

async function handleChildToolCall({
  message,
  allowedNames,
  toolCalls,
  options
}: {
  message: Extract<ChildRequest, { type: "toolCall" }>;
  allowedNames: Set<string>;
  toolCalls: ProgrammaticToolCall[];
  options: RunProgrammaticScriptOptions;
}): Promise<Record<string, unknown>> {
  const started = Date.now();

  if (!allowedNames.has(message.name)) {
    const error = `Tool is not available to run_script: ${message.name}`;
    toolCalls.push({
      name: message.name,
      ok: false,
      durationMs: Date.now() - started,
      resultTokens: estimateTokens(error),
      error
    });

    return {
      type: "toolResult",
      id: message.id,
      ok: false,
      error
    };
  }

  const index = toolCalls.length + 1;
  const result = await options.invokeTool({
    invocationId: `${options.invocationId}:ptc:${index}`,
    name: message.name,
    input: message.args
  });
  const summary = summarizeToolResultForSandbox(result);
  const ok = result.status !== "error";
  const error = result.error ?? (!ok ? result.summary : undefined);

  toolCalls.push({
    name: message.name,
    ok,
    durationMs: Date.now() - started,
    resultTokens: estimateTokens(summary),
    error
  });

  return {
    type: "toolResult",
    id: message.id,
    ok,
    result: summary,
    error
  };
}

function sendToChild(child: ChildProcess | null, message: Record<string, unknown>): void {
  if (!child?.connected) {
    return;
  }

  try {
    child.send(message);
  } catch {
    // The child may have exited while a nested tool call was still resolving.
  }
}

function buildScriptResult(input: {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
  toolCalls: ProgrammaticToolCall[];
}): ProgrammaticScriptResult {
  const resultTokens = input.toolCalls.reduce((total, call) => total + call.resultTokens, 0);
  const stdoutTokens = estimateTokens(input.stdout);

  return {
    success: input.success,
    stdout: input.stdout.trimEnd(),
    stderr: input.stderr.trimEnd(),
    exitCode: input.exitCode,
    error: input.error,
    toolCalls: input.toolCalls,
    savedTokens: Math.max(0, resultTokens - stdoutTokens),
    note: "Only stdout is returned to the model; intermediate tool results are kept inside the sandbox."
  };
}

function summarizeToolResultForSandbox(result: ToolInvocationResult): Record<string, unknown> {
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
    output: clipValue(result.output)
  };
}

function clipValue(value: unknown): unknown {
  const encoded = JSON.stringify(value ?? null);

  if (encoded.length <= MAX_STDIO_LENGTH) {
    return value;
  }

  return {
    truncated: true,
    preview: encoded.slice(0, MAX_STDIO_LENGTH)
  };
}

function clipText(value: string): string {
  return value.length <= MAX_STDIO_LENGTH ? value : value.slice(value.length - MAX_STDIO_LENGTH);
}

function createRunnerSource(code: string): string {
  return `
const pending = new Map();
let nextId = 1;

function request(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(type + " timed out"));
    }, 120000);
    pending.set(id, { resolve, reject, timer });
    process.send?.({ type, id, ...payload });
  });
}

process.on("message", (message) => {
  if (!message || typeof message !== "object" || typeof message.id !== "number") {
    return;
  }

  const entry = pending.get(message.id);

  if (!entry) {
    return;
  }

  pending.delete(message.id);
  clearTimeout(entry.timer);

  if (message.ok) {
    entry.resolve(message.result);
    return;
  }

  entry.reject(new Error(message.error || "Tool call failed"));
});

globalThis.plugTool = async (name, args = {}) => request("toolCall", { name, args });
globalThis.almaTool = globalThis.plugTool;
globalThis.listTools = async () => request("listTools");
async function rewriteShellCommandWithRtk(cmd, execFile) {
  const rtkPath = process.env.PLUG_RTK_PATH || "rtk";

  return new Promise((resolve) => {
    execFile(rtkPath, ["rewrite", cmd], {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
      env: process.env
    }, (error, stdout) => {
      if (error) {
        resolve(cmd);
        return;
      }

      const rewritten = String(stdout)
        .split("\\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("[rtk]"))
        .at(-1);
      resolve(rewritten || cmd);
    });
  });
}

globalThis.sh = async (cmd, options = {}) => {
  if (process.env.PLUG_ENABLE_RUN_COMMAND !== "1") {
    throw new Error("sh is disabled. Set PLUG_ENABLE_RUN_COMMAND=1 to allow shell execution.");
  }

  const { exec, execFile } = await import("node:child_process");
  const command = await rewriteShellCommandWithRtk(cmd, execFile);
  return new Promise((resolve, reject) => {
    exec(command, {
      cwd: options.cwd || process.cwd(),
      timeout: options.timeoutMs || 60000,
      maxBuffer: 1024 * 1024,
      env: process.env
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
};

try {
  const result = await (async () => {
${indentScript(code)}
  })();
  if (result !== undefined) {
    console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
  }
  process.send?.({ type: "done", exitCode: 0 });
  setImmediate(() => process.exit(0));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.send?.({ type: "done", exitCode: 1, error: message });
  setImmediate(() => process.exit(1));
}
`;
}

function indentScript(code: string): string {
  return code
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

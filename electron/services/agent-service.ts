import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import type {
  AgentMode,
  PendingToolApproval,
  ToolApprovalDecision,
  ToolDescriptor,
  ToolInvocationResult,
  ToolStreamEvent
} from "../../shared/types";
import { createCoreToolRegistry, type AgentTool, type ToolRegistry } from "../tools";
import {
  executeApprovedMcpTool,
  invokeMcpAgentTool,
  listMcpAgentToolDefinitions
} from "./mcp-service";
import { listPluginAgentTools, ensurePluginsDir } from "./plugin-service";
import {
  assertProjectFileMissing,
  findSectionForPath,
  readProjectManifest,
  readProjectTextFile,
  safeProjectPath,
  writeProjectTextFile
} from "../tools/project-files";
import { getProjectById } from "./project-service";

const toolRegistry = createCoreToolRegistry();
const pendingApprovals = new Map<string, PendingToolApproval>();

export async function listAgentTools(projectId: string, mode: AgentMode): Promise<ToolDescriptor[]> {
  await getProjectById(projectId);
  const [mcpTools, pluginTools] = await Promise.all([
    listMcpAgentToolDefinitions(mode),
    listPluginAgentTools(mode)
  ]);
  const allExtraTools = [...mcpTools, ...pluginTools];

  return [
    ...toolRegistry.list(mode),
    ...allExtraTools.map((tool) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      category: tool.category,
      aiWriteLevel: tool.aiWriteLevel,
      parameters: tool.parameterHints
    }))
  ];
}

export async function listAgentToolDefinitions(projectId: string, mode: AgentMode): Promise<AgentTool<unknown>[]> {
  await getProjectById(projectId);
  const [mcpTools, pluginTools] = await Promise.all([
    listMcpAgentToolDefinitions(mode),
    listPluginAgentTools(mode)
  ]);
  return [...toolRegistry.available(mode), ...mcpTools, ...pluginTools];
}

export async function invokeAgentTool(options: {
  invocationId: string;
  projectId: string;
  mode: AgentMode;
  name: string;
  input: unknown;
  emit?: (event: ToolStreamEvent) => void;
}): Promise<ToolInvocationResult> {
  const project = await getProjectById(options.projectId);
  const started = Date.now();
  console.log(`[tool] → ${options.name} ${formatToolInput(options.input)}`);

  try {
    const mcpResult = await invokeMcpAgentTool(options);

    if (mcpResult) {
      if (mcpResult.pendingApproval) {
        pendingApprovals.set(mcpResult.pendingApproval.id, mcpResult.pendingApproval);
      }
      console.log(
        `[tool] ${mcpResult.pendingApproval ? "⏸" : "✓"} ${options.name} (${Date.now() - started}ms) ${mcpResult.summary ?? ""}`
      );
      return mcpResult;
    }

    const result = await toolRegistry.invoke({
      project,
      mode: options.mode,
      name: options.name,
      input: options.input,
      invocationId: options.invocationId,
      emit: options.emit
    });

    if (result.pendingApproval) {
      pendingApprovals.set(result.pendingApproval.id, result.pendingApproval);
    }

    console.log(
      `[tool] ${result.pendingApproval ? "⏸" : "✓"} ${options.name} (${Date.now() - started}ms) ${result.summary ?? ""}`
    );
    return result;
  } catch (error) {
    console.error(
      `[tool] ✗ ${options.name} (${Date.now() - started}ms): ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

// Compact, log-friendly rendering of a tool's input arguments.
function formatToolInput(input: unknown): string {
  if (input === undefined || input === null) return "{}";
  try {
    const text = typeof input === "string" ? input : JSON.stringify(input);
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  } catch {
    return "[unserializable input]";
  }
}

export async function listPendingToolApprovals(projectId: string): Promise<PendingToolApproval[]> {
  await getProjectById(projectId);
  return [...pendingApprovals.values()]
    .filter((approval) => approval.projectId === projectId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function resolveToolApproval(options: {
  projectId: string;
  approvalId: string;
  decision: "approve" | "reject";
  emit?: (event: ToolStreamEvent) => void;
}): Promise<ToolApprovalDecision> {
  const project = await getProjectById(options.projectId);
  const approval = pendingApprovals.get(options.approvalId);

  if (!approval || approval.projectId !== options.projectId) {
    throw new Error(`Pending approval was not found: ${options.approvalId}`);
  }

  const emit = (phase: ToolStreamEvent["phase"], message: string, details?: unknown): void => {
    options.emit?.({
      invocationId: options.approvalId,
      projectId: options.projectId,
      toolName: approval.toolName,
      phase,
      message,
      details,
      createdAt: new Date().toISOString()
    });
  };

  if (options.decision === "reject") {
    pendingApprovals.delete(options.approvalId);
    emit("success", `Rejected ${approval.title}.`, approval);

    return {
      approval,
      decision: "reject",
      status: "rejected",
      message: `Rejected ${approval.title}.`
    };
  }

  emit("running", `Applying ${approval.title}.`, approval);

  const applyResult = await applyApprovalPreview(project.path, approval);
  pendingApprovals.delete(options.approvalId);
  await runPostApprovalMaintenance(project, approval, applyResult.appliedPath, options.emit);

  const message = applyResult.message ?? `Approved ${approval.title}.`;
  emit("success", message, {
    approval,
    appliedPath: applyResult.appliedPath,
    output: applyResult.output
  });

  return {
    approval,
    decision: "approve",
    status: "approved",
    appliedPath: applyResult.appliedPath,
    message
  };
}

type ApprovalApplyResult = {
  appliedPath?: string;
  message?: string;
  output?: unknown;
};

async function runPostApprovalMaintenance(
  project: Awaited<ReturnType<typeof getProjectById>>,
  approval: PendingToolApproval,
  appliedPath: string | undefined,
  emit?: (event: ToolStreamEvent) => void
): Promise<void> {
  if (
    approval.preview.action === "command" ||
    approval.preview.action === "mcp" ||
    approval.preview.action === "move" ||
    !appliedPath
  ) {
    return;
  }

  const manifest = await readProjectManifest(project.path);
  const section = findSectionForPath(manifest, appliedPath);

  if (section && section.type !== "file") {
    await toolRegistry.invoke({
      project,
      mode: "execute",
      name: "update_index",
      input: {
        sectionId: section.id
      },
      invocationId: `${approval.id}:update-index`,
      emit
    });
  }

  const memoryPatch = getPostApprovalMemoryPatch(appliedPath);

  if (memoryPatch) {
    await toolRegistry.invoke({
      project,
      mode: "execute",
      name: "update_memory",
      input: {
        summaryPatch: memoryPatch
      },
      invocationId: `${approval.id}:update-memory`,
      emit
    });
  }
}

function getPostApprovalMemoryPatch(appliedPath: string): string {
  if (appliedPath === "02-prd/login.md") {
    return "已完成登录流程初版 PRD（手机号 / 验证码 / 三方登录），文档位于 02-prd/login.md。";
  }

  if (appliedPath === "05-knowledge/competitors/login-methods.md") {
    return "完成三家竞品分析（微信 / 支付宝 / 抖音），文档位于 05-knowledge/competitors/login-methods.md。";
  }

  return "";
}

export function getToolRegistryForTest(): ToolRegistry {
  return toolRegistry;
}

async function applyApprovalPreview(projectRoot: string, approval: PendingToolApproval): Promise<ApprovalApplyResult> {
  const preview = approval.preview;

  if (preview.action === "create") {
    const path = await assertProjectFileMissing(projectRoot, preview.path);
    return {
      appliedPath: await writeProjectTextFile(projectRoot, path, preview.content)
    };
  }

  if (preview.action === "edit") {
    const current = await readProjectTextFile(projectRoot, preview.path);

    if (current.content !== preview.oldContent) {
      throw new Error(`File changed since approval was created: ${current.path}`);
    }

    return {
      appliedPath: await writeProjectTextFile(projectRoot, current.path, preview.newContent)
    };
  }

  if (preview.action === "move") {
    const fromAbsolute = safeProjectPath(projectRoot, preview.fromPath);
    const toAbsolute = safeProjectPath(projectRoot, preview.toPath);
    await mkdir(dirname(toAbsolute), { recursive: true });
    await rename(fromAbsolute, toAbsolute);
    return { appliedPath: preview.toPath };
  }

  if (preview.action === "command") {
    if (preview.cmd.startsWith("browser_click(")) {
      const { browserClick } = await import("./browser-service");
      const selectorMatch = preview.cmd.match(/^browser_click\("(.*)"\)$/);
      const selector = selectorMatch?.[1] ?? "";
      await browserClick(selector);
      return { appliedPath: preview.cwd };
    }

    if (preview.cmd.startsWith("browser_type(")) {
      const { browserTypeText } = await import("./browser-service");
      const typeMatch = preview.cmd.match(/^browser_type\("(.*)", "(.*)"\)$/);
      const selector = typeMatch?.[1] ?? "";
      const text = typeMatch?.[2] ?? "";
      await browserTypeText(selector, text);
      return { appliedPath: preview.cwd };
    }

    return {
      appliedPath: await applyCommandApproval(projectRoot, preview.cmd, preview.cwd)
    };
  }

  if (preview.action === "mcp") {
    return executeApprovedMcpTool(approval);
  }

  const current = await readProjectTextFile(projectRoot, preview.path);

  if (current.content !== preview.oldContent) {
    throw new Error(`File changed since approval was created: ${current.path}`);
  }

  await unlink(safeProjectPath(projectRoot, current.path));
  return {
    appliedPath: current.path
  };
}

async function applyCommandApproval(projectRoot: string, cmd: string, cwd: string): Promise<string> {
  if (process.env.PLUG_ENABLE_RUN_COMMAND !== "1") {
    throw new Error("run_command is disabled. Set PLUG_ENABLE_RUN_COMMAND=1 to allow approved commands.");
  }

  const commandParts = parseCommand(cmd);
  const command = commandParts[0];

  if (!command) {
    throw new Error("Command cannot be empty.");
  }

  const workingDirectory = safeProjectPath(projectRoot, cwd || ".");
  const output = await runApprovedCommand(command, commandParts.slice(1), workingDirectory);
  const outputPath = ".plug/last-command-output.txt";

  await writeProjectTextFile(projectRoot, outputPath, output);
  return outputPath;
}

function parseCommand(cmd: string): string[] {
  const parts = cmd.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return parts.map((part) => part.replace(/^["']|["']$/g, ""));
}

function runApprovedCommand(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: process.env
    });
    const chunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Approved command timed out after 60000ms."));
    }, 60000);

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errorChunks.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const stdout = Buffer.concat(chunks).toString("utf8");
      const stderr = Buffer.concat(errorChunks).toString("utf8");
      const output = [`exitCode=${code ?? -1}`, "", stdout, stderr ? `\nSTDERR:\n${stderr}` : ""].join("\n").slice(0, 20000);

      if (code && code !== 0) {
        reject(new Error(output));
        return;
      }

      resolve(output);
    });
  });
}

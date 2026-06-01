import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface, type Interface } from "node:readline";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  mcpConfigSnapshotSchema,
  mcpServerConfigSchema,
  mcpServerDraftSchema
} from "../../shared/ipc-schema";
import type {
  AgentMode,
  McpConfigSnapshot,
  McpServerConfig,
  McpServerDraft,
  McpServerHealth,
  PendingToolApproval,
  ToolInvocationResult,
  ToolStreamEvent
} from "../../shared/types";
import type { AgentTool } from "../tools";
import { getMcpConfigPath, getPlugHomeDir } from "../utils/paths";

type JsonRpcResponse = {
  id?: number;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

type McpToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, { description?: string }>;
    required?: string[];
  };
};

type McpListToolsResult = {
  tools?: McpToolDefinition[];
};

const mcpStoreSchema = z.object({
  version: z.literal(1),
  servers: z.array(mcpServerConfigSchema)
});

type McpStore = z.infer<typeof mcpStoreSchema>;

export async function listMcpServers(): Promise<McpConfigSnapshot> {
  return toSnapshot(await readMcpStore());
}

export async function upsertMcpServer(draft: McpServerDraft): Promise<McpConfigSnapshot> {
  const parsedDraft = mcpServerDraftSchema.parse(draft);
  const store = await readMcpStore();
  const existing = parsedDraft.id ? store.servers.find((server) => server.id === parsedDraft.id) : undefined;
  const now = new Date().toISOString();
  const server: McpServerConfig = {
    id: existing?.id ?? parsedDraft.id?.trim() ?? mcpServerIdFromLabel(parsedDraft.label),
    label: parsedDraft.label.trim(),
    transport: "stdio",
    command: parsedDraft.command.trim(),
    args: parsedDraft.args,
    env: parsedDraft.env,
    enabled: parsedDraft.enabled,
    aiWriteLevel: parsedDraft.aiWriteLevel,
    timeoutMs: parsedDraft.timeoutMs,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  const nextStore: McpStore = {
    version: 1,
    servers: [server, ...store.servers.filter((entry) => entry.id !== server.id)]
  };

  await writeMcpStore(nextStore);
  return toSnapshot(nextStore);
}

export async function deleteMcpServer(id: string): Promise<McpConfigSnapshot> {
  const store = await readMcpStore();
  const nextStore: McpStore = {
    version: 1,
    servers: store.servers.filter((server) => server.id !== id)
  };

  await writeMcpStore(nextStore);
  return toSnapshot(nextStore);
}

export async function checkMcpHealth(id?: string): Promise<McpServerHealth[]> {
  const store = await readMcpStore();
  const servers = id ? store.servers.filter((server) => server.id === id) : store.servers;

  return Promise.all(servers.map(checkServerHealth));
}

export async function listMcpAgentToolDefinitions(mode: AgentMode): Promise<AgentTool<unknown>[]> {
  const store = await readMcpStore();
  const enabledServers = store.servers.filter((server) => server.enabled);
  const serverTools = await Promise.all(
    enabledServers.map(async (server) => {
      try {
        const tools = await listServerTools(server);
        return tools.map((tool) => toAgentTool(server, tool));
      } catch {
        return [];
      }
    })
  );

  return serverTools.flat().filter((tool) => isMcpToolAllowedInMode(tool, mode));
}

export async function invokeMcpAgentTool(options: {
  invocationId: string;
  projectId: string;
  mode: AgentMode;
  name: string;
  input: unknown;
  emit?: (event: ToolStreamEvent) => void;
}): Promise<ToolInvocationResult | null> {
  const parsedName = parseMcpToolName(options.name);

  if (!parsedName) {
    return null;
  }

  const store = await readMcpStore();
  const server = store.servers.find((entry) => entry.id === parsedName.serverId && entry.enabled);

  if (!server) {
    return finishMcpInvocation(options, "error", `MCP server is not enabled: ${parsedName.serverId}`);
  }

  if (!isMcpToolAllowedInMode(toAgentTool(server, { name: parsedName.toolName }), options.mode)) {
    return finishMcpInvocation(options, "error", `${options.name} is not available in ${options.mode} mode.`);
  }

  options.emit?.({
    invocationId: options.invocationId,
    projectId: options.projectId,
    toolName: options.name,
    phase: "starting",
    message: `Starting ${options.name}.`,
    createdAt: new Date().toISOString()
  });

  const startedAt = Date.now();
  const input = normalizeMcpToolInput(options.input);

  if (server.aiWriteLevel === "confirm") {
    const approval = createMcpApproval(options, server, parsedName.toolName, input);
    const summary = `Approval required for MCP ${server.label}: ${parsedName.toolName}.`;

    options.emit?.({
      invocationId: options.invocationId,
      projectId: options.projectId,
      toolName: options.name,
      phase: "pending_approval",
      message: summary,
      details: approval,
      createdAt: new Date().toISOString()
    });

    return {
      invocationId: options.invocationId,
      toolName: options.name,
      status: "pending_approval",
      durationMs: Date.now() - startedAt,
      summary,
      pendingApproval: approval
    };
  }

  try {
    const output = await callServerTool(server, parsedName.toolName, input);
    const summary = `MCP ${server.label} returned ${parsedName.toolName}.`;

    options.emit?.({
      invocationId: options.invocationId,
      projectId: options.projectId,
      toolName: options.name,
      phase: "success",
      message: summary,
      details: {
        durationMs: Date.now() - startedAt,
        output
      },
      createdAt: new Date().toISOString()
    });

    return {
      invocationId: options.invocationId,
      toolName: options.name,
      status: "success",
      durationMs: Date.now() - startedAt,
      summary,
      output
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown MCP tool error";

    options.emit?.({
      invocationId: options.invocationId,
      projectId: options.projectId,
      toolName: options.name,
      phase: "error",
      message,
      createdAt: new Date().toISOString()
    });

    return {
      invocationId: options.invocationId,
      toolName: options.name,
      status: "error",
      durationMs: Date.now() - startedAt,
      summary: message,
      error: message
    };
  }
}

export async function executeApprovedMcpTool(approval: PendingToolApproval): Promise<{
  message: string;
  output: unknown;
}> {
  const preview = approval.preview;

  if (preview.action !== "mcp") {
    throw new Error(`Approval is not an MCP tool call: ${approval.id}`);
  }

  const store = await readMcpStore();
  const server = store.servers.find((entry) => entry.id === preview.serverId && entry.enabled);

  if (!server) {
    throw new Error(`MCP server is not enabled: ${preview.serverId}`);
  }

  const output = await callServerTool(server, preview.toolName, preview.arguments);

  return {
    message: `Approved MCP ${server.label} returned ${preview.toolName}.`,
    output
  };
}

async function checkServerHealth(server: McpServerConfig): Promise<McpServerHealth> {
  const checkedAt = new Date().toISOString();

  if (!server.enabled) {
    return {
      serverId: server.id,
      label: server.label,
      ok: false,
      enabled: false,
      toolCount: 0,
      message: "Server is disabled.",
      checkedAt
    };
  }

  try {
    const tools = await listServerTools(server);

    return {
      serverId: server.id,
      label: server.label,
      ok: true,
      enabled: true,
      toolCount: tools.length,
      message: `Connected. ${tools.length} tools available.`,
      checkedAt
    };
  } catch (error) {
    return {
      serverId: server.id,
      label: server.label,
      ok: false,
      enabled: true,
      toolCount: 0,
      message: error instanceof Error ? error.message : "Unknown MCP health error",
      checkedAt
    };
  }
}

async function listServerTools(server: McpServerConfig): Promise<McpToolDefinition[]> {
  const client = await McpStdioClient.connect(server);

  try {
    const result = await client.request<McpListToolsResult>("tools/list", {});
    return result.tools ?? [];
  } finally {
    client.dispose();
  }
}

async function callServerTool(server: McpServerConfig, toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const client = await McpStdioClient.connect(server);

  try {
    const result = await client.request("tools/call", {
      name: toolName,
      arguments: args
    });

    return result;
  } finally {
    client.dispose();
  }
}

function toAgentTool(server: McpServerConfig, tool: McpToolDefinition): AgentTool<unknown> {
  return {
    name: formatMcpToolName(server.id, tool.name),
    label: `${server.label}: ${tool.name}`,
    description: tool.description || `MCP tool ${tool.name} from ${server.label}.`,
    category: "mcp",
    aiWriteLevel: server.aiWriteLevel,
    parameters: z.record(z.unknown()),
    parameterHints: buildParameterHints(tool),
    execute: async (input, context) => {
      const result = await callServerTool(server, tool.name, normalizeMcpToolInput(input));
      return {
        summary: `MCP ${server.label} returned ${tool.name}.`,
        output: result
      };
    }
  };
}

function buildParameterHints(tool: McpToolDefinition) {
  const properties = tool.inputSchema?.properties ?? {};
  const required = new Set(tool.inputSchema?.required ?? []);

  return Object.entries(properties).map(([name, schema]) => ({
    name,
    required: required.has(name),
    description: schema.description || `MCP parameter ${name}.`
  }));
}

function normalizeMcpToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return input as Record<string, unknown>;
}

function createMcpApproval(
  options: {
    invocationId: string;
    projectId: string;
    name: string;
    input: unknown;
  },
  server: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>
): PendingToolApproval {
  return {
    id: options.invocationId,
    projectId: options.projectId,
    toolName: options.name,
    title: `MCP ${server.label}: ${toolName}`,
    reason: `Approve this MCP tool call before Plug sends arguments to ${server.label}.`,
    input: options.input,
    preview: {
      action: "mcp",
      serverId: server.id,
      serverLabel: server.label,
      toolName,
      arguments: args
    },
    createdAt: new Date().toISOString()
  };
}

function finishMcpInvocation(
  options: {
    invocationId: string;
    name: string;
  },
  status: "error",
  summary: string
): ToolInvocationResult {
  return {
    invocationId: options.invocationId,
    toolName: options.name,
    status,
    durationMs: 0,
    summary,
    error: summary
  };
}

function isMcpToolAllowedInMode(tool: AgentTool<unknown>, mode: AgentMode): boolean {
  if (mode === "plan") {
    return tool.aiWriteLevel === "read";
  }

  return true;
}

function formatMcpToolName(serverId: string, toolName: string): string {
  return `mcp__${sanitizeToolNamePart(serverId)}__${sanitizeToolNamePart(toolName)}`;
}

function parseMcpToolName(name: string): { serverId: string; toolName: string } | null {
  const match = /^mcp__(.+?)__(.+)$/.exec(name);

  if (!match) {
    return null;
  }

  return {
    serverId: match[1],
    toolName: match[2]
  };
}

function sanitizeToolNamePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "tool";
}

async function readMcpStore(): Promise<McpStore> {
  await ensureMcpDir();

  try {
    const raw = await readFile(getMcpConfigPath(), "utf8");
    const parsed = mcpStoreSchema.safeParse(JSON.parse(raw));

    if (parsed.success) {
      return {
        version: 1,
        servers: parsed.data.servers.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      };
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const emptyStore: McpStore = { version: 1, servers: [] };
  await writeMcpStore(emptyStore);
  return emptyStore;
}

async function writeMcpStore(store: McpStore): Promise<void> {
  await ensureMcpDir();
  await writeFile(getMcpConfigPath(), `${JSON.stringify(mcpStoreSchema.parse(store), null, 2)}\n`, "utf8");
}

async function ensureMcpDir(): Promise<void> {
  await mkdir(getPlugHomeDir(), { recursive: true });
}

function toSnapshot(store: McpStore): McpConfigSnapshot {
  return mcpConfigSnapshotSchema.parse({
    path: getMcpConfigPath(),
    servers: store.servers
  });
}

function mcpServerIdFromLabel(label: string): string {
  const base = sanitizeToolNamePart(label).toLowerCase() || "mcp";
  const hash = createHash("sha256").update(label).digest("hex").slice(0, 8);
  return `${base}-${hash}`;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

class McpStdioClient {
  private nextId = 1;
  private readonly pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>();

  private constructor(
    private readonly server: McpServerConfig,
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly lines: Interface
  ) {
    this.lines.on("line", (line) => this.handleLine(line));
    this.child.once("error", (error) => this.rejectAll(error));
    this.child.once("exit", (code, signal) => {
      if (this.pending.size) {
        this.rejectAll(new Error(`MCP server exited early: code=${code ?? "null"} signal=${signal ?? "null"}`));
      }
    });
  }

  static async connect(server: McpServerConfig): Promise<McpStdioClient> {
    const child = spawn(server.command, server.args, {
      env: {
        ...process.env,
        ...server.env
      },
      stdio: ["pipe", "pipe", "pipe"],
      shell: false
    });
    const lines = createInterface({ input: child.stdout });
    const client = new McpStdioClient(server, child, lines);

    child.stderr.setEncoding("utf8");
    await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "Plug",
        version: "0.0.0"
      }
    });
    client.notify("notifications/initialized", {});

    return client;
  }

  request<TResult = unknown>(method: string, params: unknown): Promise<TResult> {
    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, this.server.timeoutMs);

      this.pending.set(id, {
        resolve: (value) => resolve(value as TResult),
        reject,
        timer
      });
      this.write(payload);
    });
  }

  notify(method: string, params: unknown): void {
    this.write({
      jsonrpc: "2.0",
      method,
      params
    });
  }

  dispose(): void {
    this.lines.close();
    this.rejectAll(new Error("MCP client disposed."));
    this.child.kill();
  }

  private handleLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    let response: JsonRpcResponse;

    try {
      response = JSON.parse(line) as JsonRpcResponse;
    } catch {
      return;
    }

    if (typeof response.id !== "number") {
      return;
    }

    const pending = this.pending.get(response.id);

    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message || "MCP JSON-RPC error"));
      return;
    }

    pending.resolve(response.result);
  }

  private write(payload: unknown): void {
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

import { readdir, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { z } from "zod";
import type { AgentMode } from "../../shared/types";
import type { AgentTool } from "../tools";
import { pluginManifestSchema, type PluginManifest, type PluginTool } from "../../shared/plugin-schema";

const PLUGIN_TIMEOUT_MS = 30_000;

function getPluginsDir(): string {
  return join(homedir(), ".plug", "plugins");
}

// Ensure ~/.plug/plugins/ exists.
export async function ensurePluginsDir(): Promise<void> {
  await mkdir(getPluginsDir(), { recursive: true });
}

// Read and parse all plugin manifests from ~/.plug/plugins/*/plugin.json
export async function listPluginManifests(): Promise<PluginManifest[]> {
  const pluginsDir = getPluginsDir();

  let entries: string[];
  try {
    entries = await readdir(pluginsDir);
  } catch {
    return [];
  }

  const manifests: PluginManifest[] = [];

  for (const entry of entries) {
    const manifestPath = join(pluginsDir, entry, "plugin.json");
    try {
      const raw = await readFile(manifestPath, "utf-8");
      const json: unknown = JSON.parse(raw);
      const parsed = pluginManifestSchema.safeParse(json);
      if (parsed.success) {
        manifests.push(parsed.data);
      }
    } catch {
      // Skip invalid or missing manifests
    }
  }

  return manifests;
}

// Execute a plugin tool by spawning its command.
// Input is sent as JSON on stdin; output JSON is read from stdout.
export async function invokePluginTool(
  pluginId: string,
  toolName: string,
  input: unknown
): Promise<unknown> {
  const manifests = await listPluginManifests();
  const manifest = manifests.find((m) => m.id === pluginId);

  if (!manifest) {
    throw new Error(`Plugin not found: ${pluginId}`);
  }

  const tool = manifest.tools.find((t) => t.name === toolName);

  if (!tool) {
    throw new Error(`Tool not found in plugin ${pluginId}: ${toolName}`);
  }

  return spawnPluginCommand(tool, input);
}

function spawnPluginCommand(tool: PluginTool, input: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(tool.command, tool.args, {
      shell: false,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Plugin tool timed out after ${PLUGIN_TIMEOUT_MS}ms: ${tool.name}`));
    }, PLUGIN_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf8");
        reject(new Error(`Plugin tool exited with code ${code ?? -1}: ${stderr.slice(0, 400)}`));
        return;
      }

      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();

      if (!stdout) {
        resolve({ ok: true });
        return;
      }

      try {
        resolve(JSON.parse(stdout) as unknown);
      } catch {
        // Return raw text if not valid JSON
        resolve({ text: stdout });
      }
    });

    // Write input as JSON to stdin
    try {
      child.stdin.write(JSON.stringify(input ?? {}));
      child.stdin.end();
    } catch {
      // stdin may not be writable if process exited early
    }
  });
}

// Convert plugin manifests into AgentTool instances compatible with ToolRegistry.
export async function listPluginAgentTools(mode: AgentMode): Promise<AgentTool<unknown>[]> {
  const manifests = await listPluginManifests();
  const tools: AgentTool<unknown>[] = [];

  for (const manifest of manifests) {
    for (const pluginTool of manifest.tools) {
      tools.push(buildAgentTool(manifest, pluginTool));
    }
  }

  // Filter by mode: plan mode only gets read-level tools
  return tools.filter((tool) => {
    if (mode === "plan") {
      return tool.aiWriteLevel === "read";
    }
    return true;
  });
}

function buildAgentTool(manifest: PluginManifest, pluginTool: PluginTool): AgentTool<unknown> {
  const inputSchema = z.record(z.unknown()).default({});

  return {
    name: `plugin_${manifest.id}_${pluginTool.name}`,
    label: `${manifest.name}: ${pluginTool.name}`,
    description: `[Plugin: ${manifest.name} v${manifest.version}] ${pluginTool.description}`,
    category: pluginTool.category,
    aiWriteLevel: pluginTool.aiWriteLevel,
    parameters: inputSchema,
    parameterHints: [],
    async execute(input, context) {
      context.emit({
        invocationId: context.invocationId,
        projectId: context.project.id,
        toolName: `plugin_${manifest.id}_${pluginTool.name}`,
        phase: "running",
        message: `Running plugin tool: ${manifest.name}/${pluginTool.name}.`,
        createdAt: new Date().toISOString()
      });

      const output = await spawnPluginCommand(pluginTool, input);

      return {
        summary: `Plugin ${manifest.name}/${pluginTool.name} completed.`,
        output
      };
    }
  } satisfies AgentTool<unknown>;
}


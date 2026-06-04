import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { delimiter, join } from "node:path";
import type { TokenSavingsRtkStats } from "../../shared/types";

type RtkRewriteResult = {
  available: boolean;
  rewrittenCommand: string;
  binaryPath?: string;
  reason?: string;
};

type ExecFileResult = {
  code: number;
  stdout: string;
  stderr: string;
};

let cachedRtkBinaryPath: string | null | undefined;

export async function rewriteCommandWithRtk(command: string, cwd: string): Promise<RtkRewriteResult> {
  const binaryPath = await resolveRtkBinaryPath();

  if (!binaryPath) {
    return {
      available: false,
      rewrittenCommand: command,
      reason: "rtk binary was not found."
    };
  }

  const result = await execRtk(binaryPath, ["rewrite", command], cwd, 5000);

  if (result.code !== 0) {
    return {
      available: true,
      binaryPath,
      rewrittenCommand: command,
      reason: result.stderr.trim() || "No RTK rewrite available for this command."
    };
  }

  const rewrittenCommand = parseRtkRewriteOutput(result.stdout);

  return {
    available: true,
    binaryPath,
    rewrittenCommand: rewrittenCommand || command,
    reason: rewrittenCommand ? undefined : "RTK returned no rewritten command."
  };
}

export async function getRtkSavingsStats(cwd = process.cwd()): Promise<TokenSavingsRtkStats> {
  const binaryPath = await resolveRtkBinaryPath();

  if (!binaryPath) {
    return emptyRtkStats(false);
  }

  const result = await execRtk(binaryPath, ["gain", "-f", "json", "-d"], cwd, 10000);

  if (result.code !== 0) {
    return emptyRtkStats(false);
  }

  try {
    return toRtkStats(JSON.parse(result.stdout));
  } catch {
    return emptyRtkStats(false);
  }
}

export async function resolveRtkBinaryPath(): Promise<string | null> {
  if (cachedRtkBinaryPath !== undefined) {
    return cachedRtkBinaryPath;
  }

  for (const candidate of rtkBinaryCandidates()) {
    if (await isExecutable(candidate)) {
      cachedRtkBinaryPath = candidate;
      return candidate;
    }
  }

  cachedRtkBinaryPath = null;
  return null;
}

function rtkBinaryCandidates(): string[] {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const pathCandidates = (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => join(dir, "rtk"));
  const candidates = [
    process.env.PLUG_RTK_PATH,
    resourcesPath ? join(resourcesPath, "rtk", "rtk") : "",
    ...pathCandidates,
    "/opt/homebrew/bin/rtk",
    "/usr/local/bin/rtk"
  ].filter(Boolean) as string[];

  return [...new Set(candidates)];
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function execRtk(binaryPath: string, args: string[], cwd: string, timeoutMs: number): Promise<ExecFileResult> {
  return new Promise((resolve) => {
    execFile(binaryPath, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      env: process.env
    }, (error, stdout, stderr) => {
      const errorCode = (error as NodeJS.ErrnoException | null)?.code;
      const code = typeof errorCode === "number"
        ? errorCode
        : error
          ? 1
          : 0;

      resolve({
        code,
        stdout,
        stderr
      });
    });
  });
}

function parseRtkRewriteOutput(stdout: string): string {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("[rtk]"))
    .at(-1) ?? "";
}

function toRtkStats(raw: unknown): TokenSavingsRtkStats {
  const data = raw as {
    summary?: {
      total_commands?: number;
      total_input?: number;
      total_output?: number;
      total_saved?: number;
      avg_savings_pct?: number;
      total_time_ms?: number;
      avg_time_ms?: number;
    };
    daily?: Array<{
      date?: string;
      commands?: number;
      input_tokens?: number;
      output_tokens?: number;
      saved_tokens?: number;
    }>;
  };
  const summary = data.summary ?? {};

  return {
    available: true,
    summary: {
      totalCommands: Math.max(0, Math.round(summary.total_commands ?? 0)),
      totalInputTokens: Math.max(0, Math.round(summary.total_input ?? 0)),
      totalOutputTokens: Math.max(0, Math.round(summary.total_output ?? 0)),
      totalSavedTokens: Math.max(0, Math.round(summary.total_saved ?? 0)),
      avgSavingsPct: Math.max(0, summary.avg_savings_pct ?? 0),
      totalTimeMs: Math.max(0, Math.round(summary.total_time_ms ?? 0)),
      avgTimeMs: Math.max(0, summary.avg_time_ms ?? 0)
    },
    daily: (data.daily ?? []).map((entry) => ({
      date: entry.date ?? "",
      commands: Math.max(0, Math.round(entry.commands ?? 0)),
      inputTokens: Math.max(0, Math.round(entry.input_tokens ?? 0)),
      outputTokens: Math.max(0, Math.round(entry.output_tokens ?? 0)),
      savedTokens: Math.max(0, Math.round(entry.saved_tokens ?? 0))
    })).filter((entry) => entry.date),
    byCommand: [],
    recent: []
  };
}

function emptyRtkStats(available: boolean): TokenSavingsRtkStats {
  return {
    available,
    summary: {
      totalCommands: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalSavedTokens: 0,
      avgSavingsPct: 0,
      totalTimeMs: 0,
      avgTimeMs: 0
    },
    daily: [],
    byCommand: [],
    recent: []
  };
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { tokenSavingsSnapshotSchema } from "../../shared/ipc-schema";
import type {
  TokenSavingsPtcStats,
  TokenSavingsSnapshot
} from "../../shared/types";
import { getTokenSavingsPath } from "../utils/paths";
import { getRtkSavingsStats } from "./rtk-service";

const tokenSavingsDailySchema = z.object({
  date: z.string(),
  runs: z.number().int().min(0),
  toolCalls: z.number().int().min(0),
  savedTokens: z.number().int().min(0)
});

const tokenSavingsStoreSchema = z.object({
  version: z.literal(1),
  ptc: z.object({
    totalRuns: z.number().int().min(0),
    totalToolCalls: z.number().int().min(0),
    totalResultTokens: z.number().int().min(0),
    totalStdoutTokens: z.number().int().min(0),
    totalSavedTokens: z.number().int().min(0),
    daily: z.record(tokenSavingsDailySchema),
    updatedAt: z.string()
  })
});

type TokenSavingsStore = z.infer<typeof tokenSavingsStoreSchema>;

export type ProgrammaticToolRunRecord = {
  toolCalls: number;
  resultTokens: number;
  stdoutTokens: number;
};

export async function getTokenSavingsSnapshot(): Promise<TokenSavingsSnapshot> {
  const store = await readTokenSavingsStore();

  return tokenSavingsSnapshotSchema.parse({
    path: getTokenSavingsPath(),
    ptc: toPtcStats(store),
    rtk: await getRtkSavingsStats()
  });
}

export async function recordProgrammaticToolRun(record: ProgrammaticToolRunRecord): Promise<void> {
  const store = await readTokenSavingsStore();
  const savedTokens = Math.max(0, Math.round(record.resultTokens) - Math.round(record.stdoutTokens));
  const today = new Date().toISOString().slice(0, 10);
  const daily = store.ptc.daily[today] ?? {
    date: today,
    runs: 0,
    toolCalls: 0,
    savedTokens: 0
  };

  daily.runs += 1;
  daily.toolCalls += Math.max(0, Math.round(record.toolCalls));
  daily.savedTokens += savedTokens;

  const nextStore: TokenSavingsStore = {
    ...store,
    ptc: {
      ...store.ptc,
      totalRuns: store.ptc.totalRuns + 1,
      totalToolCalls: store.ptc.totalToolCalls + Math.max(0, Math.round(record.toolCalls)),
      totalResultTokens: store.ptc.totalResultTokens + Math.max(0, Math.round(record.resultTokens)),
      totalStdoutTokens: store.ptc.totalStdoutTokens + Math.max(0, Math.round(record.stdoutTokens)),
      totalSavedTokens: store.ptc.totalSavedTokens + savedTokens,
      daily: {
        ...store.ptc.daily,
        [today]: daily
      },
      updatedAt: new Date().toISOString()
    }
  };

  await writeTokenSavingsStore(nextStore);
}

export function estimateTokens(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");

  if (!text) {
    return 0;
  }

  const cjkMatches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g);
  const cjkLength = cjkMatches?.length ?? 0;
  const otherLength = text.length - cjkLength;

  return Math.ceil(cjkLength / 2) + Math.ceil(otherLength / 4);
}

async function readTokenSavingsStore(): Promise<TokenSavingsStore> {
  try {
    const raw = await readFile(getTokenSavingsPath(), "utf8");
    const parsed = tokenSavingsStoreSchema.safeParse(JSON.parse(raw));

    if (parsed.success) {
      return parsed.data;
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const store = defaultTokenSavingsStore();
  await writeTokenSavingsStore(store);
  return store;
}

async function writeTokenSavingsStore(store: TokenSavingsStore): Promise<void> {
  await mkdir(dirname(getTokenSavingsPath()), { recursive: true });
  await writeFile(
    getTokenSavingsPath(),
    `${JSON.stringify(tokenSavingsStoreSchema.parse(store), null, 2)}\n`,
    "utf8"
  );
}

function defaultTokenSavingsStore(): TokenSavingsStore {
  return {
    version: 1,
    ptc: {
      totalRuns: 0,
      totalToolCalls: 0,
      totalResultTokens: 0,
      totalStdoutTokens: 0,
      totalSavedTokens: 0,
      daily: {},
      updatedAt: new Date().toISOString()
    }
  };
}

function toPtcStats(store: TokenSavingsStore): TokenSavingsPtcStats {
  return {
    available: true,
    totalRuns: store.ptc.totalRuns,
    totalToolCalls: store.ptc.totalToolCalls,
    totalResultTokens: store.ptc.totalResultTokens,
    totalStdoutTokens: store.ptc.totalStdoutTokens,
    totalSavedTokens: store.ptc.totalSavedTokens,
    daily: Object.values(store.ptc.daily).sort((left, right) => right.date.localeCompare(left.date)),
    updatedAt: store.ptc.updatedAt
  };
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

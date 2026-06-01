import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { customPromptAppSchema, promptAppDraftSchema, promptAppSnapshotSchema } from "../../shared/ipc-schema";
import type { CustomPromptApp, PromptAppDraft, PromptAppSnapshot } from "../../shared/types";
import { getPlugHomeDir, getPromptAppsPath } from "../utils/paths";

const promptAppStoreSchema = z.object({
  version: z.literal(1),
  apps: z.array(customPromptAppSchema)
});

type PromptAppStore = z.infer<typeof promptAppStoreSchema>;

export async function listPromptApps(): Promise<PromptAppSnapshot> {
  return toSnapshot(await readPromptAppStore());
}

export async function upsertPromptApp(draft: PromptAppDraft): Promise<PromptAppSnapshot> {
  const parsedDraft = promptAppDraftSchema.parse(draft);
  const store = await readPromptAppStore();
  const existing = parsedDraft.id ? store.apps.find((app) => app.id === parsedDraft.id) : undefined;
  const now = new Date().toISOString();
  const app: CustomPromptApp = {
    id: existing?.id ?? parsedDraft.id?.trim() ?? promptAppIdFromName(parsedDraft.name),
    name: parsedDraft.name.trim(),
    description: parsedDraft.description.trim(),
    outputSection: parsedDraft.outputSection.trim() || "current-session",
    fields: normalizeFields(parsedDraft.fields),
    promptTemplate: parsedDraft.promptTemplate.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  const nextStore: PromptAppStore = {
    version: 1,
    apps: [app, ...store.apps.filter((entry) => entry.id !== app.id)]
  };

  await writePromptAppStore(nextStore);
  return toSnapshot(nextStore);
}

export async function deletePromptApp(id: string): Promise<PromptAppSnapshot> {
  const store = await readPromptAppStore();
  const nextStore: PromptAppStore = {
    version: 1,
    apps: store.apps.filter((app) => app.id !== id)
  };

  await writePromptAppStore(nextStore);
  return toSnapshot(nextStore);
}

async function readPromptAppStore(): Promise<PromptAppStore> {
  await ensurePromptAppDir();

  try {
    const raw = await readFile(getPromptAppsPath(), "utf8");
    const parsed = promptAppStoreSchema.safeParse(JSON.parse(raw));

    if (parsed.success) {
      return {
        version: 1,
        apps: parsed.data.apps.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      };
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const emptyStore: PromptAppStore = { version: 1, apps: [] };
  await writePromptAppStore(emptyStore);
  return emptyStore;
}

async function writePromptAppStore(store: PromptAppStore): Promise<void> {
  await ensurePromptAppDir();
  await writeFile(getPromptAppsPath(), `${JSON.stringify(promptAppStoreSchema.parse(store), null, 2)}\n`, "utf8");
}

async function ensurePromptAppDir(): Promise<void> {
  await mkdir(getPlugHomeDir(), { recursive: true });
}

function toSnapshot(store: PromptAppStore): PromptAppSnapshot {
  return promptAppSnapshotSchema.parse({
    path: getPromptAppsPath(),
    apps: store.apps
  });
}

function normalizeFields(fields: PromptAppDraft["fields"]): CustomPromptApp["fields"] {
  return fields.map((field) => ({
    id: normalizeFieldId(field.id),
    label: field.label.trim() || normalizeFieldId(field.id),
    placeholder: field.placeholder.trim(),
    multiline: field.multiline
  }));
}

function normalizeFieldId(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "field";
}

function promptAppIdFromName(name: string): string {
  const base = normalizeFieldId(name).toLowerCase() || "prompt-app";
  const hash = createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `custom-${base}-${hash}`;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

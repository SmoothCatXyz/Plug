import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { projectManifestSchema } from "../../shared/ipc-schema";
import type { ProjectManifest, ProjectSection } from "../../shared/types";

export async function readProjectManifest(projectRoot: string): Promise<ProjectManifest> {
  const manifestPath = safeProjectPath(projectRoot, ".plug/manifest.json");
  const raw = await readFile(manifestPath, "utf8");
  return projectManifestSchema.parse(JSON.parse(raw));
}

export async function readProjectTextFile(projectRoot: string, unsafeRelativePath: string): Promise<{
  path: string;
  content: string;
}> {
  const safePath = safeProjectPath(projectRoot, unsafeRelativePath);
  const fileStats = await stat(safePath);

  if (!fileStats.isFile()) {
    throw new Error(`Tool path is not a file: ${unsafeRelativePath}`);
  }

  return {
    path: normalizeRelativePath(projectRoot, safePath),
    content: await readFile(safePath, "utf8")
  };
}

export async function writeProjectTextFile(
  projectRoot: string,
  unsafeRelativePath: string,
  content: string
): Promise<string> {
  const safePath = safeProjectPath(projectRoot, unsafeRelativePath);
  await mkdir(dirname(safePath), { recursive: true });
  await writeFile(safePath, content, "utf8");
  return normalizeRelativePath(projectRoot, safePath);
}

export async function assertProjectFileMissing(projectRoot: string, unsafeRelativePath: string): Promise<string> {
  const safePath = safeProjectPath(projectRoot, unsafeRelativePath);

  try {
    await stat(safePath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return normalizeRelativePath(projectRoot, safePath);
    }

    throw error;
  }

  throw new Error(`Project file already exists: ${unsafeRelativePath}`);
}

export async function listDirectoryEntries(projectRoot: string, unsafeRelativePath: string): Promise<Array<{
  name: string;
  type: "file" | "folder";
}>> {
  const safePath = safeProjectPath(projectRoot, unsafeRelativePath);
  const directoryStats = await stat(safePath);

  if (!directoryStats.isDirectory()) {
    throw new Error(`Tool path is not a directory: ${unsafeRelativePath}`);
  }

  const entries = await readdir(safePath, { withFileTypes: true });

  return entries
    .filter((entry) => !entry.name.startsWith(".") && entry.name !== "_index.md")
    .filter((entry) => entry.isFile() || entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? ("folder" as const) : ("file" as const)
    }))
    .sort((left, right) => `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`));
}

export function safeProjectPath(projectRoot: string, unsafeRelativePath: string): string {
  const relativePath = normalizeToolPath(unsafeRelativePath);

  if (!relativePath) {
    throw new Error("Tool path cannot be empty.");
  }

  if (isAbsolute(relativePath)) {
    throw new Error(`Tool path must be relative to the project root: ${unsafeRelativePath}`);
  }

  const resolvedRoot = resolve(projectRoot);
  const resolvedPath = resolve(resolvedRoot, relativePath);
  const pathFromRoot = relative(resolvedRoot, resolvedPath);

  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new Error(`Tool path escapes project root: ${unsafeRelativePath}`);
  }

  return resolvedPath;
}

export function normalizeToolPath(rawPath: string): string {
  const trimmedPath = rawPath.trim();

  if (!trimmedPath || trimmedPath.startsWith("#")) {
    return "";
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedPath) || trimmedPath.startsWith("//")) {
    throw new Error(`External URLs are not project file paths: ${rawPath}`);
  }

  const pathWithoutHash = trimmedPath.split("#", 1)[0] ?? "";
  const pathWithoutQuery = pathWithoutHash.split("?", 1)[0] ?? "";

  try {
    return normalizePathFragment(decodeURIComponent(pathWithoutQuery));
  } catch {
    return normalizePathFragment(pathWithoutQuery);
  }
}

export function normalizeRelativePath(projectRoot: string, absolutePath: string): string {
  return normalizePathFragment(relative(resolve(projectRoot), absolutePath));
}

export function getSectionDocumentPath(section: ProjectSection): string {
  return normalizePathFragment(section.type === "file" ? section.path : join(section.path, "_index.md"));
}

export function getSectionBasePath(section: ProjectSection): string {
  return normalizePathFragment(section.path).replace(/\/$/, "");
}

export function findSectionForPath(manifest: ProjectManifest, unsafeRelativePath: string): ProjectSection | null {
  const relativePath = normalizeToolPath(unsafeRelativePath).replace(/\/$/, "");
  const candidates = [...manifest.sections].sort((left, right) => right.path.length - left.path.length);

  return (
    candidates.find((section) => {
      const sectionBase = getSectionBasePath(section);

      if (section.type === "file") {
        return relativePath === sectionBase;
      }

      return relativePath === sectionBase || relativePath.startsWith(`${sectionBase}/`);
    }) ?? null
  );
}

export function normalizePathFragment(pathFragment: string): string {
  return pathFragment.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "");
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

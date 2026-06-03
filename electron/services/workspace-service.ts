import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { projectManifestSchema } from "../../shared/ipc-schema";
import type { ProjectManifest, ProjectSection, WorkspaceDocument, WorkspaceSnapshot } from "../../shared/types";
import { getProjectById } from "./project-service";

export async function loadWorkspace(projectId: string): Promise<WorkspaceSnapshot> {
  const project = await getProjectById(projectId);
  const manifest = await readManifest(project.path);
  const firstSection = manifest.sections[0];

  if (!firstSection) {
    throw new Error(`Project manifest does not define any sections: ${project.path}`);
  }

  const document = await readSectionDocument(project.path, firstSection);

  return {
    project,
    manifest,
    document
  };
}

export async function openWorkspaceSection(projectId: string, sectionId: string): Promise<WorkspaceDocument> {
  const project = await getProjectById(projectId);
  const manifest = await readManifest(project.path);
  const section = manifest.sections.find((entry) => entry.id === sectionId);

  if (!section) {
    throw new Error(`Section was not found in manifest: ${sectionId}`);
  }

  return readSectionDocument(project.path, section);
}

export async function openWorkspaceDocumentPath(
  projectId: string,
  documentPath: string,
  fromPath?: string
): Promise<WorkspaceDocument> {
  const project = await getProjectById(projectId);
  const manifest = await readManifest(project.path);
  const resolvedPath = await resolveDocumentPath(project.path, documentPath, fromPath);

  return readDocumentByRelativePath(project.path, manifest, resolvedPath);
}

export async function saveWorkspaceDocument(
  projectId: string,
  documentPath: string,
  content: string
): Promise<WorkspaceDocument> {
  const project = await getProjectById(projectId);
  const manifest = await readManifest(project.path);
  const resolvedPath = await resolveDocumentPath(project.path, documentPath);
  const absolutePath = safeJoin(project.path, resolvedPath);

  await writeFile(absolutePath, content, "utf8");

  return readDocumentByRelativePath(project.path, manifest, resolvedPath);
}

async function readManifest(projectRoot: string): Promise<ProjectManifest> {
  const manifestPath = safeJoin(projectRoot, ".plug/manifest.json");
  const raw = await readFile(manifestPath, "utf8");
  return projectManifestSchema.parse(JSON.parse(raw));
}

async function readSectionDocument(projectRoot: string, section: ProjectSection): Promise<WorkspaceDocument> {
  const sectionPath = getSectionDocumentPath(section);
  const absolutePath = await assertReadableMarkdownFile(projectRoot, sectionPath);

  return {
    sectionId: section.id,
    path: normalizeRelativePath(projectRoot, absolutePath),
    title: section.label || basename(sectionPath),
    content: await readFile(absolutePath, "utf8")
  };
}

async function readDocumentByRelativePath(
  projectRoot: string,
  manifest: ProjectManifest,
  documentPath: string
): Promise<WorkspaceDocument> {
  const absolutePath = await assertReadableMarkdownFile(projectRoot, documentPath);
  const normalizedPath = normalizeRelativePath(projectRoot, absolutePath);
  const section = manifest.sections.find((entry) => getSectionDocumentPath(entry) === normalizedPath);

  return {
    sectionId: section?.id ?? "document",
    path: normalizedPath,
    title: section?.label ?? basename(normalizedPath),
    content: await readFile(absolutePath, "utf8")
  };
}

async function resolveDocumentPath(projectRoot: string, rawPath: string, fromPath?: string): Promise<string> {
  const localPath = parseLocalDocumentPath(rawPath);
  const pathFromRoot = localPath.startsWith("/")
    ? localPath.slice(1)
    : join(fromPath ? dirname(parseLocalDocumentPath(fromPath)) : "", localPath);
  const absolutePath = safeJoin(projectRoot, pathFromRoot);
  const documentStats = await stat(absolutePath);

  if (documentStats.isDirectory()) {
    return normalizeRelativePath(projectRoot, await assertReadableMarkdownFile(projectRoot, join(pathFromRoot, "_index.md")));
  }

  if (!documentStats.isFile()) {
    throw new Error(`Document path is not a file: ${rawPath}`);
  }

  if (!isOpenableDocument(absolutePath)) {
    throw new Error(`Only markdown or html documents can be opened: ${rawPath}`);
  }

  return normalizeRelativePath(projectRoot, absolutePath);
}

async function assertReadableMarkdownFile(projectRoot: string, relativePath: string): Promise<string> {
  const absolutePath = safeJoin(projectRoot, relativePath);
  const documentStats = await stat(absolutePath);

  if (!documentStats.isFile()) {
    throw new Error(`Document path is not a file: ${relativePath}`);
  }

  if (!isOpenableDocument(absolutePath)) {
    throw new Error(`Only markdown or html documents can be opened: ${relativePath}`);
  }

  return absolutePath;
}

function getSectionDocumentPath(section: ProjectSection): string {
  return normalizePathFragment(section.type === "file" ? section.path : join(section.path, "_index.md"));
}

function parseLocalDocumentPath(rawPath: string): string {
  const trimmedPath = rawPath.trim();

  if (!trimmedPath || trimmedPath.startsWith("#")) {
    throw new Error(`Document path is empty or anchor-only: ${rawPath}`);
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedPath) || trimmedPath.startsWith("//")) {
    throw new Error(`External URLs cannot be opened as project documents: ${rawPath}`);
  }

  const pathWithoutHash = trimmedPath.split("#", 1)[0] ?? "";
  const pathWithoutQuery = pathWithoutHash.split("?", 1)[0] ?? "";

  try {
    return normalizePathFragment(decodeURIComponent(pathWithoutQuery));
  } catch {
    return normalizePathFragment(pathWithoutQuery);
  }
}

function isOpenableDocument(filePath: string): boolean {
  return [".md", ".markdown", ".html", ".htm"].includes(extname(filePath).toLowerCase());
}

function normalizePathFragment(pathFragment: string): string {
  return pathFragment.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function safeJoin(root: string, unsafeRelativePath: string): string {
  if (isAbsolute(unsafeRelativePath)) {
    throw new Error(`Path must be relative to the project root: ${unsafeRelativePath}`);
  }

  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, unsafeRelativePath);
  const pathFromRoot = relative(resolvedRoot, resolvedPath);

  if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new Error(`Path escapes project root: ${unsafeRelativePath}`);
  }

  return resolvedPath;
}

function normalizeRelativePath(root: string, absolutePath: string): string {
  return normalizePathFragment(relative(resolve(root), absolutePath));
}

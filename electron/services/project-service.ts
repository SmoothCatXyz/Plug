import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { z } from "zod";
import type { ProjectSummary } from "../../shared/types";
import { getLogsDir, getPlugHomeDir, getProjectsRegistryPath } from "../utils/paths";

const registrySchema = z.object({
  version: z.literal(1),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      path: z.string(),
      status: z.enum(["active", "standby", "missing"]),
      createdAt: z.string(),
      updatedAt: z.string()
    })
  )
});

type ProjectRegistry = z.infer<typeof registrySchema>;

export async function listProjects(): Promise<ProjectSummary[]> {
  const registry = await readRegistry();
  const projects = await Promise.all(registry.projects.map(withFreshStatus));

  return sortProjects(projects);
}

export async function getProjectById(id: string): Promise<ProjectSummary> {
  const registry = await readRegistry();
  const project = registry.projects.find((entry) => entry.id === id);

  if (!project) {
    throw new Error(`Project was not found in registry: ${id}`);
  }

  return withFreshStatus(project);
}

export async function addProjectPath(rawPath: string): Promise<{
  project: ProjectSummary;
  projects: ProjectSummary[];
}> {
  const projectPath = resolve(rawPath);
  const directory = await stat(projectPath);

  if (!directory.isDirectory()) {
    throw new Error(`Project path is not a directory: ${projectPath}`);
  }

  const registry = await readRegistry();
  const now = new Date().toISOString();
  const id = projectIdFromPath(projectPath);
  const existing = registry.projects.find((project) => project.id === id);

  const project: ProjectSummary = {
    id,
    name: basename(projectPath) || projectPath,
    path: projectPath,
    status: "standby",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  const nextProjects = [project, ...registry.projects.filter((entry) => entry.id !== id)];
  await writeRegistry({ version: 1, projects: nextProjects });

  return {
    project,
    projects: await listProjects()
  };
}

export async function registerCreatedProject(projectPath: string, name: string): Promise<{
  project: ProjectSummary;
  projects: ProjectSummary[];
}> {
  const now = new Date().toISOString();
  const project: ProjectSummary = {
    id: projectIdFromPath(resolve(projectPath)),
    name,
    path: resolve(projectPath),
    status: "active",
    createdAt: now,
    updatedAt: now
  };

  const registry = await readRegistry();
  const nextProjects = [
    project,
    ...registry.projects
      .filter((entry) => entry.id !== project.id)
      .map<ProjectSummary>((entry) => ({
        ...entry,
        status: entry.status === "missing" ? entry.status : "standby"
      }))
  ];

  await writeRegistry({ version: 1, projects: nextProjects });

  return {
    project,
    projects: await listProjects()
  };
}

export async function openProject(id: string): Promise<{
  project: ProjectSummary;
  projects: ProjectSummary[];
}> {
  const registry = await readRegistry();
  const project = registry.projects.find((entry) => entry.id === id);

  if (!project) {
    throw new Error(`Project was not found in registry: ${id}`);
  }

  const now = new Date().toISOString();
  const openedProject: ProjectSummary = {
    ...(await withFreshStatus(project)),
    status: "active",
    updatedAt: now
  };

  const nextProjects = [
    openedProject,
    ...registry.projects
      .filter((entry) => entry.id !== id)
      .map<ProjectSummary>((entry) => ({
        ...entry,
        status: entry.status === "missing" ? entry.status : "standby"
      }))
  ];

  await writeRegistry({ version: 1, projects: nextProjects });

  return {
    project: openedProject,
    projects: await listProjects()
  };
}

export function getProjectRegistryPath(): string {
  return getProjectsRegistryPath();
}

async function readRegistry(): Promise<ProjectRegistry> {
  await ensureAppDirectories();

  try {
    const raw = await readFile(getProjectsRegistryPath(), "utf8");
    const parsed = registrySchema.safeParse(JSON.parse(raw));

    if (parsed.success) {
      return parsed.data;
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const emptyRegistry: ProjectRegistry = { version: 1, projects: [] };
  await writeRegistry(emptyRegistry);
  return emptyRegistry;
}

async function writeRegistry(registry: ProjectRegistry): Promise<void> {
  await ensureAppDirectories();
  await writeFile(getProjectsRegistryPath(), `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

async function ensureAppDirectories(): Promise<void> {
  await mkdir(getPlugHomeDir(), { recursive: true });
  await mkdir(getLogsDir(), { recursive: true });
}

async function withFreshStatus(project: ProjectSummary): Promise<ProjectSummary> {
  try {
    const projectStat = await stat(project.path);

    return {
      ...project,
      status: projectStat.isDirectory() ? project.status : "missing"
    };
  } catch {
    return {
      ...project,
      status: "missing"
    };
  }
}

function sortProjects(projects: ProjectSummary[]): ProjectSummary[] {
  return [...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function projectIdFromPath(projectPath: string): string {
  return createHash("sha256").update(projectPath).digest("hex").slice(0, 16);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

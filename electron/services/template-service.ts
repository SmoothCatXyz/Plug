import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import type { ProjectSummary } from "../../shared/types";
import { getDefaultProjectsDir } from "../utils/paths";
import { registerCreatedProject } from "./project-service";

const templateSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  icon: z.string(),
  defaultModel: z.string(),
  sections: z.array(z.string())
});

type TemplateSummary = z.infer<typeof templateSummarySchema>;

export type CreateProjectInput = {
  templateId: string;
  projectName: string;
  parentDir: string;
  defaultModel: string;
  planningModel: string;
  gitUrl: string;
  gitBranch: string;
};

export async function listTemplates(): Promise<TemplateSummary[]> {
  const templatesDir = getTemplatesDir();
  const entries = await readdir(templatesDir, { withFileTypes: true });
  const templates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const raw = await readFile(join(templatesDir, entry.name, "template.json"), "utf8");
        return templateSummarySchema.parse(JSON.parse(raw));
      })
  );

  return templates.sort((left, right) => left.label.localeCompare(right.label));
}

export async function createProjectFromTemplate(input: CreateProjectInput): Promise<{
  project: ProjectSummary;
  projects: ProjectSummary[];
}> {
  const normalizedInput = normalizeCreateProjectInput(input);
  const templateDir = resolveTemplateDir(normalizedInput.templateId);
  const structureDir = join(templateDir, "structure");
  const projectDir = join(normalizedInput.parentDir, toProjectFolderName(normalizedInput.projectName));
  const createdAt = new Date().toISOString();
  const variables: Record<string, string> = {
    projectName: normalizedInput.projectName,
    createdAt,
    updatedAt: createdAt,
    defaultModel: normalizedInput.defaultModel,
    planningModel: normalizedInput.planningModel,
    gitUrl: normalizedInput.gitUrl,
    gitBranch: normalizedInput.gitBranch
  };

  await assertTemplateExists(templateDir);
  await assertTargetAvailable(projectDir);
  await mkdir(projectDir, { recursive: true });
  await renderDirectory(structureDir, projectDir, variables);

  const manifestTemplate = await readFile(join(templateDir, "manifest.template.json"), "utf8");
  const manifest = renderTemplateString(manifestTemplate, variables);
  await mkdir(join(projectDir, ".plug"), { recursive: true });
  await writeFile(join(projectDir, ".plug", "manifest.json"), manifest, "utf8");

  await writeFile(join(projectDir, ".plug", "memories.json"), JSON.stringify([], null, 2), "utf8");

  return registerCreatedProject(projectDir, normalizedInput.projectName);
}

export function getDefaultProjectParentDir(): string {
  return getDefaultProjectsDir();
}

function getTemplatesDir(): string {
  if (process.env.PLUG_TEMPLATES_DIR) {
    return process.env.PLUG_TEMPLATES_DIR;
  }

  const resourcePath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;

  if (process.env.NODE_ENV === "production" && resourcePath) {
    return join(resourcePath, "templates");
  }

  return join(process.cwd(), "templates");
}

function resolveTemplateDir(templateId: string): string {
  return join(getTemplatesDir(), templateId);
}

async function assertTemplateExists(templateDir: string): Promise<void> {
  const templateStats = await stat(templateDir);

  if (!templateStats.isDirectory()) {
    throw new Error(`Template path is not a directory: ${templateDir}`);
  }
}

async function assertTargetAvailable(projectDir: string): Promise<void> {
  try {
    const targetStats = await stat(projectDir);

    if (!targetStats.isDirectory()) {
      throw new Error(`Target path exists and is not a directory: ${projectDir}`);
    }

    const entries = await readdir(projectDir);
    if (entries.length > 0) {
      throw new Error(`Target project directory is not empty: ${projectDir}`);
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }

    throw error;
  }
}

async function renderDirectory(sourceDir: string, targetDir: string, variables: Record<string, string>): Promise<void> {
  await mkdir(targetDir, { recursive: true });

  const entries = await readdir(sourceDir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const sourcePath = join(sourceDir, entry.name);
      const targetPath = join(targetDir, entry.name);

      if (entry.isDirectory()) {
        await renderDirectory(sourcePath, targetPath, variables);
        return;
      }

      if (entry.isFile()) {
        await renderFile(sourcePath, targetPath, variables);
        return;
      }

      await cp(sourcePath, targetPath, { recursive: true });
    })
  );
}

async function renderFile(sourcePath: string, targetPath: string, variables: Record<string, string>): Promise<void> {
  const raw = await readFile(sourcePath, "utf8");
  await writeFile(targetPath, renderTemplateString(raw, variables), "utf8");
}

function renderTemplateString(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => variables[key] ?? "");
}

function normalizeCreateProjectInput(input: CreateProjectInput): CreateProjectInput {
  const projectName = input.projectName.trim();

  if (!projectName) {
    throw new Error("Project name is required.");
  }

  const parentDir = resolve(input.parentDir || getDefaultProjectsDir());

  return {
    templateId: input.templateId || "product-dev",
    projectName,
    parentDir,
    defaultModel: input.defaultModel.trim() || "deepseek-chat",
    planningModel: input.planningModel.trim() || "deepseek-reasoner",
    gitUrl: input.gitUrl.trim(),
    gitBranch: input.gitBranch.trim() || "main"
  };
}

function toProjectFolderName(projectName: string): string {
  const normalized = projectName
    .trim()
    .replace(/[/:\\?%*"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || basename(projectName) || "plug-project";
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { AgentTool } from "./registry";
import {
  getSectionBasePath,
  readProjectManifest,
  readProjectTextFile,
  safeProjectPath,
  normalizeRelativePath
} from "./project-files";

const openDocumentInputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe("Project-relative path of the document to open. Omit to open the most recently written document.")
});

type OpenDocumentInput = z.infer<typeof openDocumentInputSchema>;

/**
 * Reveal an existing project document in the side panel. Either takes an explicit
 * path, or — when omitted — opens the most recently modified document across the
 * folder sections (e.g. "打开文档" right after writing a research note). The
 * actual panel-open happens in ai-service when it sees this tool's output.
 */
export const openDocumentTool: AgentTool<OpenDocumentInput> = {
  name: "open_document",
  label: "Open Document",
  description:
    "Open/reveal a project document in the side panel. Provide a path, or omit it to open the most recently written document. Use this whenever the user asks to open, show, or view a document.",
  category: "file",
  aiWriteLevel: "auto",
  parameters: openDocumentInputSchema,
  parameterHints: [
    { name: "path", required: false, description: "Project-relative .md path; omit to open the latest document." }
  ],
  async execute(input, context) {
    const projectRoot = context.project.path;

    let target = input.path?.trim();
    if (target) {
      await readProjectTextFile(projectRoot, target); // throws if missing/not a file
      target = normalizeRelativePath(projectRoot, safeProjectPath(projectRoot, target));
    } else {
      const newest = await findNewestDocument(projectRoot);
      if (!newest) {
        throw new Error("项目里还没有可打开的文档。");
      }
      target = newest;
    }

    const title = await firstTitle(projectRoot, target);
    return {
      summary: `已打开《${title}》。`,
      output: { documentPath: target, title, openInPanel: true }
    };
  }
};

async function firstTitle(projectRoot: string, relPath: string): Promise<string> {
  try {
    const { content } = await readProjectTextFile(projectRoot, relPath);
    const h1 = content.split("\n").find((line) => line.trim().startsWith("# "));
    if (h1) return h1.replace(/^#\s+/, "").trim();
  } catch {
    // ignore
  }
  return (relPath.split("/").pop() ?? relPath).replace(/\.md$/, "");
}

// Newest .md (by mtime) across all folder sections, excluding index pages.
async function findNewestDocument(projectRoot: string): Promise<string | null> {
  const manifest = await readProjectManifest(projectRoot);
  const candidates: Array<{ path: string; mtimeMs: number }> = [];

  for (const section of manifest.sections) {
    if (section.type === "file") continue;
    await walk(projectRoot, getSectionBasePath(section), (relPath, mtimeMs) => {
      const name = relPath.split("/").pop() ?? "";
      if (name.endsWith(".md") && name !== "_index.md") {
        candidates.push({ path: relPath, mtimeMs });
      }
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].path;
}

async function walk(
  projectRoot: string,
  relDir: string,
  onFile: (relPath: string, mtimeMs: number) => void
): Promise<void> {
  const entries = await readdir(safeProjectPath(projectRoot, relDir), { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const childRel = join(relDir, entry.name);
    if (entry.isDirectory()) {
      await walk(projectRoot, childRel, onFile);
    } else if (entry.isFile()) {
      const info = await stat(safeProjectPath(projectRoot, childRel)).catch(() => null);
      if (info) onFile(childRel, info.mtimeMs);
    }
  }
}

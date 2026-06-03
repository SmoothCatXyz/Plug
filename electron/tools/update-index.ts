import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ProjectSection } from "../../shared/types";
import type { AgentTool } from "./registry";
import {
  getSectionBasePath,
  listDirectoryEntries,
  readProjectManifest,
  safeProjectPath,
  writeProjectTextFile
} from "./project-files";
import { isHtmlPath, parseDocMetadata, resolveDocSummary, resolveDocTitle } from "./document-metadata";

const updateIndexInputSchema = z.object({
  sectionId: z.string().min(1)
});

type UpdateIndexInput = z.infer<typeof updateIndexInputSchema>;

export const updateIndexTool: AgentTool<UpdateIndexInput> = {
  name: "update_index",
  label: "Update Index",
  description: "Regenerate a folder or git section _index.md from the current directory entries.",
  category: "file",
  aiWriteLevel: "auto",
  parameters: updateIndexInputSchema,
  parameterHints: [
    {
      name: "sectionId",
      required: true,
      description: "Manifest section id whose _index.md should be regenerated."
    }
  ],
  async execute(input, context) {
    const manifest = await readProjectManifest(context.project.path);
    const section = manifest.sections.find((entry) => entry.id === input.sectionId);

    if (!section) {
      throw new Error(`Section was not found in manifest: ${input.sectionId}`);
    }

    if (section.type === "file") {
      throw new Error(`File sections do not have an _index.md: ${section.id}`);
    }

    if (section.aiWrite === "readonly") {
      throw new Error(`AI writes are disabled for this project section: ${section.id}`);
    }

    const { writtenPath, entries } = await regenerateSectionIndex(context.project.path, section);

    return {
      summary: `Updated ${writtenPath}.`,
      output: {
        path: writtenPath,
        entries
      }
    };
  }
};

/**
 * Rebuild a folder/git section's `_index.md` from its current directory entries.
 * Shared by the update_index tool and write_document, so there's one index format.
 */
export async function regenerateSectionIndex(
  projectRoot: string,
  section: ProjectSection
): Promise<{ writtenPath: string; entries: Array<{ name: string; type: "file" | "folder" }> }> {
  const sectionPath = getSectionBasePath(section);
  const docs = await collectSectionDocs(projectRoot, sectionPath);
  const indexPath = join(sectionPath, "_index.md");
  const content = renderRichIndex(section.label, docs);
  const writtenPath = await writeProjectTextFile(projectRoot, indexPath, content);
  // Keep the legacy `entries` shape for callers (top-level listing).
  const topLevel = await listDirectoryEntries(projectRoot, sectionPath);
  return { writtenPath, entries: topLevel };
}

interface CatalogDoc {
  /** Path relative to the section base, e.g. "research/foo.md". */
  relPath: string;
  /** Sub-folder grouping ("" for the section root). */
  group: string;
  title: string;
  summary: string;
  tags: string[];
  status: string;
  updated: string;
}

// Recursively collect documents (.md/.html, excluding index pages) with their
// metadata, so the catalog can show titles/summaries/tags instead of filenames.
async function collectSectionDocs(projectRoot: string, sectionBase: string): Promise<CatalogDoc[]> {
  const docs: CatalogDoc[] = [];

  const walk = async (relDir: string): Promise<void> => {
    const absDir = safeProjectPath(projectRoot, join(sectionBase, relDir));
    const entries = await readdir(absDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const rel = relDir ? join(relDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await walk(rel);
        continue;
      }
      const lower = entry.name.toLowerCase();
      if (entry.name === "_index.md" || !(lower.endsWith(".md") || isHtmlPath(lower))) continue;

      let content = "";
      let mtime = Date.now();
      try {
        const abs = safeProjectPath(projectRoot, join(sectionBase, rel));
        content = await readFile(abs, "utf8");
        mtime = (await stat(abs)).mtimeMs;
      } catch {
        continue;
      }
      const { meta, body } = parseDocMetadata(content, rel);
      docs.push({
        relPath: rel,
        group: relDir,
        title: resolveDocTitle(meta, body, rel, entry.name.replace(/\.[^.]+$/, "")),
        summary: resolveDocSummary(meta, body, rel),
        tags: meta.tags ?? [],
        status: meta.status ?? "",
        updated: meta.updated ?? new Date(mtime).toISOString().slice(0, 10)
      });
    }
  };

  await walk("");
  docs.sort((a, b) => (a.group === b.group ? b.updated.localeCompare(a.updated) : a.group.localeCompare(b.group)));
  return docs;
}

function renderRichIndex(label: string, docs: CatalogDoc[]): string {
  const lines = [`# ${label} · 共 ${docs.length} 篇`, "", "> 由 Plug 自动维护,请勿手动编辑。", ""];

  if (docs.length === 0) {
    lines.push("_暂无文档。_", "");
    return lines.join("\n");
  }

  const groups = new Map<string, CatalogDoc[]>();
  for (const doc of docs) {
    const key = doc.group || ".";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(doc);
  }

  for (const [group, groupDocs] of groups) {
    lines.push(group === "." ? "## 根目录" : `## ${group}/`, "");
    lines.push("| 文档 | 摘要 | 标签 | 状态 | 更新 |", "| --- | --- | --- | --- | --- |");
    for (const doc of groupDocs) {
      const title = `[${escapeCell(doc.title)}](${encodeURI(doc.relPath)})`;
      const tags = doc.tags.length ? doc.tags.map(escapeCell).join(", ") : "—";
      lines.push(`| ${title} | ${escapeCell(doc.summary) || "—"} | ${tags} | ${escapeCell(doc.status) || "—"} | ${doc.updated} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

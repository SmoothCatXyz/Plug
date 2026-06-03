import { join } from "node:path";
import { z } from "zod";
import type { ProjectSection } from "../../shared/types";
import type { AgentTool } from "./registry";
import {
  getSectionBasePath,
  readProjectManifest,
  readProjectTextFile,
  writeProjectTextFile
} from "./project-files";
import { indexProjectDocument } from "./document-index";
import { renderMetadataBlock, todayStamp, type DocMeta } from "./document-metadata";
import { renderPrdHtml } from "./prd-template";

const writeDocumentInputSchema = z.object({
  section: z
    .string()
    .min(1)
    .describe('Target folder section id, e.g. "knowledge" (research) or "deliverables" (outputs).'),
  title: z.string().min(1).describe("Human-readable document title; also the first H1 heading."),
  content: z
    .string()
    .min(1)
    .describe("Document body. Markdown for most sections; for the PRD section, write HTML (tables/sections allowed) — it is wrapped in a styled HTML document."),
  summary: z.string().optional().describe("One-line summary for the catalog/index."),
  tags: z.array(z.string()).optional().describe("Topic tags for the catalog (e.g. [竞品, 调研])."),
  status: z.enum(["draft", "in-progress", "done"]).optional().describe("Lifecycle status; defaults to draft."),
  theme: z.enum(["dark", "light"]).optional().describe("PRD only: document theme (default dark; user can toggle in-doc)."),
  cover: z.string().optional().describe("PRD only: optional cover banner image URL."),
  slug: z.string().optional().describe("Optional file name (no extension); defaults to the title.")
});

type WriteDocumentInput = z.infer<typeof writeDocumentInputSchema>;

/**
 * A first-class skill for AI-authored research and documents: it writes the file
 * DIRECTLY into a folder section (no approval gate), rebuilds that section's
 * _index.md, links it from the project home page, and flags the result so the UI
 * opens it in the side panel. Reserved for AI work-product areas (knowledge /
 * deliverables); structured sections like PRD/design/code keep their confirm gate.
 */
export const writeDocumentTool: AgentTool<WriteDocumentInput> = {
  name: "write_document",
  label: "Write Document",
  description:
    "Write a research note or document directly into a project folder section (e.g. knowledge or deliverables). Creates the file, refreshes the section index and project home, and opens it in the side panel. Use this for research findings and drafted documents instead of create_file.",
  category: "file",
  aiWriteLevel: "auto",
  parameters: writeDocumentInputSchema,
  parameterHints: [
    { name: "section", required: true, description: "Folder section id: knowledge | deliverables | prd (or another folder section)." },
    { name: "title", required: true, description: "Document title." },
    { name: "content", required: true, description: "Markdown body (HTML for the prd section)." },
    { name: "summary", required: false, description: "One-line catalog summary." },
    { name: "tags", required: false, description: "Topic tags." },
    { name: "status", required: false, description: "draft | in-progress | done." },
    { name: "slug", required: false, description: "Optional file name without extension." }
  ],
  async execute(input, context) {
    const projectRoot = context.project.path;
    const manifest = await readProjectManifest(projectRoot);
    const section = manifest.sections.find((entry) => entry.id === input.section);

    if (!section) {
      const ids = manifest.sections.filter((s) => s.type !== "file").map((s) => s.id).join(", ");
      throw new Error(`Unknown section "${input.section}". Available folder sections: ${ids}.`);
    }
    if (section.type === "file") {
      throw new Error(`Section "${section.id}" is a single file, not a folder. Pick a folder section (e.g. knowledge).`);
    }
    if (section.aiWrite === "readonly") {
      throw new Error(`AI writes are disabled for section: ${section.id}`);
    }

    const title = input.title.trim();
    const ext = sectionDocExtension(section); // ".html" for prd, ".md" otherwise
    const sectionBase = getSectionBasePath(section);
    const fileName = `${await uniqueSlug(projectRoot, sectionBase, input.slug || title, ext)}${ext}`;
    const relPath = join(sectionBase, fileName);

    const meta: DocMeta = {
      title,
      summary: input.summary?.trim() || undefined,
      tags: input.tags?.map((tag) => tag.trim()).filter(Boolean),
      status: input.status ?? "draft",
      created: todayStamp(),
      updated: todayStamp()
    };
    const front = renderMetadataBlock(meta, relPath);
    const fileContent =
      ext === ".html"
        ? `${front}${renderPrdHtml(title, input.content.trim(), meta, { theme: input.theme, cover: input.cover })}`
        : `${front}\n# ${title}\n\n${input.content.trim()}\n`;
    const writtenPath = await writeProjectTextFile(projectRoot, relPath, fileContent);

    // Index it: refresh the section's _index.md and link from the home page.
    // (ai-service also runs this post-turn for any written doc; it's idempotent.)
    await indexProjectDocument(projectRoot, writtenPath);

    const where =
      section.id === "knowledge" ? "知识库" : section.id === "deliverables" ? "交付物" : section.id === "analysis" ? "分析区" : section.label;
    return {
      summary: `已写好《${input.title.trim()}》,放进${where}并打开了。`,
      output: {
        documentPath: writtenPath,
        title: input.title.trim(),
        section: section.id,
        openInPanel: true
      }
    };
  }
};

// PRD and framework analyses are stored as standalone HTML for richer expression
// (charts, canvases, matrices); everything else is Markdown.
function sectionDocExtension(section: ProjectSection): ".html" | ".md" {
  return section.id === "prd" || section.id === "analysis" ? ".html" : ".md";
}

// Filesystem-safe slug that keeps CJK characters but strips path/unsafe chars.
function slugify(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || "document";
}

async function uniqueSlug(projectRoot: string, sectionBase: string, raw: string, ext: string): Promise<string> {
  const base = slugify(raw);
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    try {
      await readProjectTextFile(projectRoot, join(sectionBase, `${candidate}${ext}`));
      // exists -> try next
    } catch {
      return candidate;
    }
  }
  return `${base}-${Date.now()}`;
}

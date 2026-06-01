import { join } from "node:path";
import { z } from "zod";
import type { AgentTool } from "./registry";
import {
  getSectionBasePath,
  readProjectManifest,
  readProjectTextFile,
  writeProjectTextFile
} from "./project-files";
import { indexProjectDocument } from "./document-index";

const writeDocumentInputSchema = z.object({
  section: z
    .string()
    .min(1)
    .describe('Target folder section id, e.g. "knowledge" (research) or "deliverables" (outputs).'),
  title: z.string().min(1).describe("Human-readable document title; also the first H1 heading."),
  content: z.string().min(1).describe("Full markdown body of the document (without the H1 title)."),
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
    { name: "section", required: true, description: "Folder section id: knowledge | deliverables (or another folder section)." },
    { name: "title", required: true, description: "Document title." },
    { name: "content", required: true, description: "Markdown body." },
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

    const sectionBase = getSectionBasePath(section);
    const fileName = `${await uniqueSlug(projectRoot, sectionBase, input.slug || input.title)}.md`;
    const relPath = join(sectionBase, fileName);

    const body = [`# ${input.title.trim()}`, "", `> 由 Plug 自动生成 · ${nowStamp()}`, "", input.content.trim(), ""].join("\n");
    const writtenPath = await writeProjectTextFile(projectRoot, relPath, body);

    // Index it: refresh the section's _index.md and link from the home page.
    // (ai-service also runs this post-turn for any written doc; it's idempotent.)
    await indexProjectDocument(projectRoot, writtenPath);

    const where = section.id === "knowledge" ? "知识库" : section.id === "deliverables" ? "交付物" : section.label;
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

function nowStamp(): string {
  return new Date().toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
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

async function uniqueSlug(projectRoot: string, sectionBase: string, raw: string): Promise<string> {
  const base = slugify(raw);
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    try {
      await readProjectTextFile(projectRoot, join(sectionBase, `${candidate}.md`));
      // exists -> try next
    } catch {
      return candidate;
    }
  }
  return `${base}-${Date.now()}`;
}

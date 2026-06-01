import { join } from "node:path";
import { z } from "zod";
import type { ProjectSection } from "../../shared/types";
import type { AgentTool } from "./registry";
import {
  getSectionBasePath,
  listDirectoryEntries,
  readProjectManifest,
  writeProjectTextFile
} from "./project-files";

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
  const entries = await listDirectoryEntries(projectRoot, sectionPath);
  const indexPath = join(sectionPath, "_index.md");
  const content = renderIndex(section.label, entries);
  const writtenPath = await writeProjectTextFile(projectRoot, indexPath, content);
  return { writtenPath, entries };
}

function renderIndex(label: string, entries: Array<{ name: string; type: "file" | "folder" }>): string {
  const lines = [
    `# ${label}`,
    "",
    `Updated: ${new Date().toISOString()}`,
    "",
    "## Index",
    ""
  ];

  if (!entries.length) {
    lines.push("_No files indexed._");
  } else {
    for (const entry of entries) {
      const href = entry.type === "folder" ? `${entry.name}/` : entry.name;
      const suffix = entry.type === "folder" ? "/" : "";
      lines.push(`- [${entry.name}${suffix}](${href})`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

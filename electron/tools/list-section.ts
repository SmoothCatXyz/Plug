import { z } from "zod";
import type { AgentTool } from "./registry";
import { getSectionDocumentPath, readProjectManifest, readProjectTextFile } from "./project-files";

const listSectionInputSchema = z.object({
  sectionId: z.string().min(1)
});

type ListSectionInput = z.infer<typeof listSectionInputSchema>;

export const listSectionTool: AgentTool<ListSectionInput> = {
  name: "list_section",
  label: "List Section",
  description: "Read the manifest-defined section document or _index.md without scanning the filesystem.",
  category: "file",
  aiWriteLevel: "read",
  parameters: listSectionInputSchema,
  parameterHints: [
    {
      name: "sectionId",
      required: true,
      description: "Manifest section id to inspect."
    }
  ],
  async execute(input, context) {
    const manifest = await readProjectManifest(context.project.path);
    const section = manifest.sections.find((entry) => entry.id === input.sectionId);

    if (!section) {
      throw new Error(`Section was not found in manifest: ${input.sectionId}`);
    }

    const documentPath = getSectionDocumentPath(section);
    const indexFile = await readProjectTextFile(context.project.path, documentPath);

    return {
      summary: `Read section ${section.id} index.`,
      output: {
        section,
        path: indexFile.path,
        content: indexFile.content
      }
    };
  }
};

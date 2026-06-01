import { z } from "zod";
import type { AgentTool } from "./registry";
import { readProjectTextFile } from "./project-files";

const readMultipleFilesInputSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(10)
});

type ReadMultipleFilesInput = z.infer<typeof readMultipleFilesInputSchema>;

export const readMultipleFilesTool: AgentTool<ReadMultipleFilesInput> = {
  name: "read_multiple_files",
  label: "Read Multiple Files",
  description: "Read up to 10 project text files in a single operation.",
  category: "file",
  aiWriteLevel: "read",
  parameters: readMultipleFilesInputSchema,
  parameterHints: [
    {
      name: "paths",
      required: true,
      description: "Array of project-relative paths to read (1–10 items)."
    }
  ],
  async execute(input, context) {
    context.emit({
      invocationId: context.invocationId,
      projectId: context.project.id,
      toolName: "read_multiple_files",
      phase: "running",
      message: `Reading ${input.paths.length} file${input.paths.length === 1 ? "" : "s"}...`,
      createdAt: new Date().toISOString()
    });

    const files: Array<{ path: string; content: string }> = [];
    const failed: Array<{ path: string; error: string }> = [];

    await Promise.all(
      input.paths.map(async (p) => {
        try {
          const result = await readProjectTextFile(context.project.path, p);
          files.push({ path: result.path, content: result.content });
        } catch (error) {
          failed.push({
            path: p,
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      })
    );

    return {
      summary: `Read ${files.length} file${files.length === 1 ? "" : "s"}${failed.length ? `, ${failed.length} failed` : ""}.`,
      output: { files, failed }
    };
  }
};

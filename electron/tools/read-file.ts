import { z } from "zod";
import type { AgentTool } from "./registry";
import { readProjectTextFile } from "./project-files";

const readFileInputSchema = z.object({
  path: z.string().min(1)
});

type ReadFileInput = z.infer<typeof readFileInputSchema>;

export const readFileTool: AgentTool<ReadFileInput> = {
  name: "read_file",
  label: "Read File",
  description: "Read a UTF-8 text file inside the active Plug project.",
  category: "file",
  aiWriteLevel: "read",
  parameters: readFileInputSchema,
  parameterHints: [
    {
      name: "path",
      required: true,
      description: "Project-relative path to read."
    }
  ],
  async execute(input, context) {
    context.emit({
      invocationId: context.invocationId,
      projectId: context.project.id,
      toolName: "read_file",
      phase: "running",
      message: `Reading ${input.path}.`,
      createdAt: new Date().toISOString()
    });

    const file = await readProjectTextFile(context.project.path, input.path);

    return {
      summary: `Read ${file.path}.`,
      output: {
        path: file.path,
        content: file.content
      }
    };
  }
};

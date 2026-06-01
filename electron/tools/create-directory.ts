import { mkdir } from "node:fs/promises";
import { z } from "zod";
import type { AgentTool } from "./registry";
import { normalizeRelativePath, safeProjectPath } from "./project-files";

const createDirectoryInputSchema = z.object({
  path: z.string().min(1),
  reason: z.string().min(1)
});

type CreateDirectoryInput = z.infer<typeof createDirectoryInputSchema>;

export const createDirectoryTool: AgentTool<CreateDirectoryInput> = {
  name: "create_directory",
  label: "Create Directory",
  description: "Create a directory (and any missing parents) inside the project.",
  category: "file",
  aiWriteLevel: "auto",
  parameters: createDirectoryInputSchema,
  parameterHints: [
    {
      name: "path",
      required: true,
      description: "Project-relative path of the directory to create."
    },
    {
      name: "reason",
      required: true,
      description: "Why the directory is needed."
    }
  ],
  async execute(input, context) {
    context.emit({
      invocationId: context.invocationId,
      projectId: context.project.id,
      toolName: "create_directory",
      phase: "running",
      message: `Creating directory ${input.path}...`,
      createdAt: new Date().toISOString()
    });

    const safePath = safeProjectPath(context.project.path, input.path);
    await mkdir(safePath, { recursive: true });
    const normalizedPath = normalizeRelativePath(context.project.path, safePath);

    context.emit({
      invocationId: context.invocationId,
      projectId: context.project.id,
      toolName: "create_directory",
      phase: "success",
      message: `Created directory ${normalizedPath}.`,
      createdAt: new Date().toISOString()
    });

    return {
      summary: `Created directory ${normalizedPath}.`,
      output: { path: normalizedPath }
    };
  }
};

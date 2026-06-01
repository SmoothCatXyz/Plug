import { z } from "zod";
import type { AgentTool } from "./registry";
import { readProjectManifest, readProjectTextFile } from "./project-files";
import { assertWritablePolicy, createPendingApproval, resolveWritePolicy } from "./write-policy";

const deleteFileInputSchema = z.object({
  path: z.string().min(1),
  reason: z.string().min(1)
});

type DeleteFileInput = z.infer<typeof deleteFileInputSchema>;

export const deleteFileTool: AgentTool<DeleteFileInput> = {
  name: "delete_file",
  label: "Delete File",
  description: "Request deletion of a project file. This tool always returns a pending approval.",
  category: "file",
  aiWriteLevel: "confirm",
  parameters: deleteFileInputSchema,
  parameterHints: [
    {
      name: "path",
      required: true,
      description: "Project-relative file to delete."
    },
    {
      name: "reason",
      required: true,
      description: "Why the deletion is needed."
    }
  ],
  async execute(input, context) {
    const manifest = await readProjectManifest(context.project.path);
    const existing = await readProjectTextFile(context.project.path, input.path);
    const policy = resolveWritePolicy(manifest, existing.path);
    assertWritablePolicy(policy, existing.path);

    return {
      summary: `Delete ${existing.path} is pending approval.`,
      pendingApproval: createPendingApproval({
        context,
        toolName: "delete_file",
        title: `Delete ${existing.path}`,
        reason: input.reason,
        input,
        preview: {
          action: "delete",
          path: existing.path,
          oldContent: existing.content
        }
      })
    };
  }
};

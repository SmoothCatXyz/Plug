import { z } from "zod";
import type { AgentTool } from "./registry";
import { assertProjectFileMissing, readProjectManifest, writeProjectTextFile } from "./project-files";
import { assertWritablePolicy, createPendingApproval, resolveWritePolicy } from "./write-policy";

const createFileInputSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  reason: z.string().min(1)
});

type CreateFileInput = z.infer<typeof createFileInputSchema>;

export const createFileTool: AgentTool<CreateFileInput> = {
  name: "create_file",
  label: "Create File",
  description: "Create a new project file when the target section policy allows it.",
  category: "file",
  aiWriteLevel: "confirm",
  parameters: createFileInputSchema,
  parameterHints: [
    {
      name: "path",
      required: true,
      description: "Project-relative path for the new file."
    },
    {
      name: "content",
      required: true,
      description: "Initial UTF-8 file content."
    },
    {
      name: "reason",
      required: true,
      description: "Why the new file is needed."
    }
  ],
  async execute(input, context) {
    const manifest = await readProjectManifest(context.project.path);
    const path = await assertProjectFileMissing(context.project.path, input.path);
    const policy = resolveWritePolicy(manifest, path);
    assertWritablePolicy(policy, path);

    if (policy === "confirm") {
      return {
        summary: `Create ${path} is pending approval.`,
        pendingApproval: createPendingApproval({
          context,
          toolName: "create_file",
          title: `Create ${path}`,
          reason: input.reason,
          input,
          preview: {
            action: "create",
            path,
            content: input.content
          }
        })
      };
    }

    const writtenPath = await writeProjectTextFile(context.project.path, path, input.content);

    return {
      summary: `Created ${writtenPath}.`,
      output: {
        action: "create",
        path: writtenPath,
        bytes: Buffer.byteLength(input.content, "utf8")
      }
    };
  }
};

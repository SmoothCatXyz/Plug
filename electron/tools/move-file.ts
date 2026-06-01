import { z } from "zod";
import type { AgentTool } from "./registry";
import { normalizeRelativePath, readProjectManifest, readProjectTextFile, safeProjectPath } from "./project-files";
import { assertWritablePolicy, createPendingApproval, resolveWritePolicy } from "./write-policy";

const moveFileInputSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  reason: z.string().min(1)
});

type MoveFileInput = z.infer<typeof moveFileInputSchema>;

export const moveFileTool: AgentTool<MoveFileInput> = {
  name: "move_file",
  label: "Move File",
  description: "Move or rename a project file. Requires approval by default.",
  category: "file",
  aiWriteLevel: "confirm",
  parameters: moveFileInputSchema,
  parameterHints: [
    {
      name: "from",
      required: true,
      description: "Project-relative source path."
    },
    {
      name: "to",
      required: true,
      description: "Project-relative destination path."
    },
    {
      name: "reason",
      required: true,
      description: "Why the file is being moved."
    }
  ],
  async execute(input, context) {
    const manifest = await readProjectManifest(context.project.path);

    // Verify source exists
    const sourceFile = await readProjectTextFile(context.project.path, input.from);

    const toSafePath = safeProjectPath(context.project.path, input.to);
    const normalizedTo = normalizeRelativePath(context.project.path, toSafePath);

    // Check write policy for both source and destination
    const fromPolicy = resolveWritePolicy(manifest, sourceFile.path);
    assertWritablePolicy(fromPolicy, sourceFile.path);

    const toPolicy = resolveWritePolicy(manifest, normalizedTo);
    assertWritablePolicy(toPolicy, normalizedTo);

    return {
      summary: `Move ${sourceFile.path} → ${normalizedTo} is pending approval.`,
      pendingApproval: createPendingApproval({
        context,
        toolName: "move_file",
        title: `Move ${sourceFile.path} → ${normalizedTo}`,
        reason: input.reason,
        input,
        preview: {
          action: "move",
          fromPath: sourceFile.path,
          toPath: normalizedTo
        }
      })
    };
  }
};

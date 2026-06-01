import { z } from "zod";
import type { AgentTool } from "./registry";
import { readProjectManifest, readProjectTextFile, writeProjectTextFile } from "./project-files";
import { assertWritablePolicy, createPendingApproval, resolveWritePolicy } from "./write-policy";

const proposeEditInputSchema = z.object({
  path: z.string().min(1),
  newContent: z.string(),
  reason: z.string().min(1)
});

type ProposeEditInput = z.infer<typeof proposeEditInputSchema>;

export const proposeEditTool: AgentTool<ProposeEditInput> = {
  name: "propose_edit",
  label: "Propose Edit",
  description: "Edit an existing project file when its section policy allows auto writes; otherwise return a pending approval.",
  category: "file",
  aiWriteLevel: "confirm",
  parameters: proposeEditInputSchema,
  parameterHints: [
    {
      name: "path",
      required: true,
      description: "Project-relative file to edit."
    },
    {
      name: "newContent",
      required: true,
      description: "Complete replacement content."
    },
    {
      name: "reason",
      required: true,
      description: "Why the edit is needed."
    }
  ],
  async execute(input, context) {
    const manifest = await readProjectManifest(context.project.path);
    const existing = await readProjectTextFile(context.project.path, input.path);
    const policy = resolveWritePolicy(manifest, existing.path);
    assertWritablePolicy(policy, existing.path);

    if (policy === "confirm") {
      return {
        summary: `Edit for ${existing.path} is pending approval.`,
        pendingApproval: createPendingApproval({
          context,
          toolName: "propose_edit",
          title: `Edit ${existing.path}`,
          reason: input.reason,
          input,
          preview: {
            action: "edit",
            path: existing.path,
            oldContent: existing.content,
            newContent: input.newContent
          }
        })
      };
    }

    const path = await writeProjectTextFile(context.project.path, existing.path, input.newContent);

    return {
      summary: `Edited ${path}.`,
      output: {
        action: "edit",
        path,
        oldLength: existing.content.length,
        newLength: input.newContent.length
      }
    };
  }
};

import { z } from "zod";
import type { AgentTool } from "./registry";
import { readProjectTextFile, writeProjectTextFile } from "./project-files";
import { addMemory } from "../services/vector-memory-service";

const updateMemoryInputSchema = z.object({
  summaryPatch: z.string().min(1)
});

type UpdateMemoryInput = z.infer<typeof updateMemoryInputSchema>;

export const updateMemoryTool: AgentTool<UpdateMemoryInput> = {
  name: "update_memory",
  label: "Update Memory",
  description: "Append a concise project memory patch to .plug/memory.md.",
  category: "memory",
  aiWriteLevel: "auto",
  parameters: updateMemoryInputSchema,
  parameterHints: [
    {
      name: "summaryPatch",
      required: true,
      description: "New memory note to append."
    }
  ],
  async execute(input, context) {
    const existing = await readMemory(context.project.path);
    const entry = [`## ${new Date().toISOString()}`, "", input.summaryPatch.trim(), ""].join("\n");
    const nextContent = `${existing.trimEnd()}\n\n${entry}`;
    const path = await writeProjectTextFile(context.project.path, ".plug/memory.md", nextContent);

    // Also store as vector memory (fire-and-forget; don't fail tool if embedding fails)
    await addMemory({
      projectRoot: context.project.path,
      projectId: context.project.id,
      content: input.summaryPatch.trim(),
      layer: "core",
      importance: 0.8,
      sessionId: context.invocationId
    }).catch(() => {});

    return {
      summary: `Updated ${path}.`,
      output: {
        path,
        appendedChars: input.summaryPatch.trim().length
      }
    };
  }
};

async function readMemory(projectRoot: string): Promise<string> {
  try {
    return (await readProjectTextFile(projectRoot, ".plug/memory.md")).content;
  } catch {
    return "# Memory\n";
  }
}

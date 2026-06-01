import { z } from "zod";
import type { AgentTool } from "./registry";
import { searchMemories } from "../services/vector-memory-service";

const searchMemoryInputSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(12).optional()
});

type SearchMemoryInput = z.infer<typeof searchMemoryInputSchema>;

export const searchMemoryTool: AgentTool<SearchMemoryInput> = {
  name: "search_memory",
  label: "Search Memory",
  description: "Search relevant entries from the active project's .plug/memory.md.",
  category: "memory",
  aiWriteLevel: "read",
  parameters: searchMemoryInputSchema,
  parameterHints: [
    {
      name: "query",
      required: true,
      description: "Question or topic to retrieve from project memory."
    },
    {
      name: "topK",
      required: false,
      description: "Maximum number of memory hits to return."
    }
  ],
  async execute(input, context) {
    context.emit({
      invocationId: context.invocationId,
      projectId: context.project.id,
      toolName: "search_memory",
      phase: "running",
      message: `Searching memory for ${input.query}.`,
      createdAt: new Date().toISOString()
    });

    const results = await searchMemories({
      projectRoot: context.project.path,
      query: input.query,
      topK: input.topK
    });

    return {
      summary: `Found ${results.length} memory result${results.length === 1 ? "" : "s"}.`,
      output: {
        query: input.query,
        results: results.map((r) => ({
          content: r.content,
          layer: r.layer,
          importance: r.importance,
          score: r.score
        }))
      }
    };
  }
};

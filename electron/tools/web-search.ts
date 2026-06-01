import { z } from "zod";
import type { AgentTool } from "./registry";
import { searchWeb } from "../services/web-service";

const webSearchInputSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().min(1).max(10).optional()
});

type WebSearchInput = z.infer<typeof webSearchInputSchema>;

export const webSearchTool: AgentTool<WebSearchInput> = {
  name: "web_search",
  label: "Web Search",
  description: "Search the web with proxy, timeout, retry events, and HTML result extraction.",
  category: "web",
  aiWriteLevel: "read",
  parameters: webSearchInputSchema,
  parameterHints: [
    {
      name: "query",
      required: true,
      description: "Search query."
    },
    {
      name: "maxResults",
      required: false,
      description: "Maximum results to return, 1-10."
    }
  ],
  async execute(input, context) {
    const result = await searchWeb({
      query: input.query,
      maxResults: input.maxResults ?? 5,
      emit: (event) =>
        context.emit({
          ...event,
          invocationId: context.invocationId,
          projectId: context.project.id,
          toolName: "web_search",
          createdAt: new Date().toISOString()
        })
    });

    return {
      summary: `Search returned ${result.results.length} result(s) for "${result.query}".`,
      output: result
    };
  }
};

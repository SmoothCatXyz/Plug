import { z } from "zod";
import type { AgentTool } from "./registry";
import { fetchWebPage } from "../services/web-service";

const webFetchInputSchema = z.object({
  url: z.string().url()
});

type WebFetchInput = z.infer<typeof webFetchInputSchema>;

export const webFetchTool: AgentTool<WebFetchInput> = {
  name: "web_fetch",
  label: "Web Fetch",
  description: "Fetch a web page over HTTP(S) with proxy, timeout, retry events, and readable text extraction.",
  category: "web",
  aiWriteLevel: "read",
  parameters: webFetchInputSchema,
  parameterHints: [
    {
      name: "url",
      required: true,
      description: "HTTP(S) URL to fetch."
    }
  ],
  async execute(input, context) {
    const result = await fetchWebPage({
      url: input.url,
      emit: (event) =>
        context.emit({
          ...event,
          invocationId: context.invocationId,
          projectId: context.project.id,
          toolName: "web_fetch",
          createdAt: new Date().toISOString()
        })
    });

    return {
      summary: `Fetched ${result.title} (${result.statusCode}).`,
      output: result
    };
  }
};

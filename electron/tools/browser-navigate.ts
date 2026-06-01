import { z } from "zod";
import type { AgentTool } from "./registry";
import { browserNavigate } from "../services/browser-service";

const browserNavigateInputSchema = z.object({
  url: z.string().url(),
  waitMs: z.number().int().min(0).max(5000).optional()
});

type BrowserNavigateInput = z.infer<typeof browserNavigateInputSchema>;

export const browserNavigateTool: AgentTool<BrowserNavigateInput> = {
  name: "browser_navigate",
  label: "Browser Navigate",
  description: "Navigate the headless browser to a URL and return the page title and final URL.",
  category: "web",
  aiWriteLevel: "read",
  parameters: browserNavigateInputSchema,
  parameterHints: [
    {
      name: "url",
      required: true,
      description: "HTTP(S) URL to navigate to."
    },
    {
      name: "waitMs",
      required: false,
      description: "Additional wait time in milliseconds after page load (0–5000)."
    }
  ],
  async execute(input, context) {
    context.emit({
      invocationId: context.invocationId,
      projectId: context.project.id,
      toolName: "browser_navigate",
      phase: "running",
      message: `Navigating to ${input.url}...`,
      createdAt: new Date().toISOString()
    });

    const result = await browserNavigate(input.url);

    if (input.waitMs && input.waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, input.waitMs));
    }

    return {
      summary: `Navigated to "${result.title}" (${result.finalUrl}).`,
      output: {
        url: input.url,
        finalUrl: result.finalUrl,
        title: result.title
      }
    };
  }
};

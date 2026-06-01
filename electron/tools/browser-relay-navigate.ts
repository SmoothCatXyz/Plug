import { z } from "zod";
import type { AgentTool } from "./registry";
import { sendRelayCommand, getRelayStatus } from "../services/relay-service";

const browserRelayNavigateInputSchema = z.object({
  url: z.string().url(),
  waitMs: z.number().int().min(0).max(5000).optional()
});

type BrowserRelayNavigateInput = z.infer<typeof browserRelayNavigateInputSchema>;

export const browserRelayNavigateTool: AgentTool<BrowserRelayNavigateInput> = {
  name: "browser_relay_navigate",
  label: "Browser Relay Navigate",
  description:
    "[Relay] Navigate the real Chrome browser tab (with live session cookies and logins) to a URL.",
  category: "web",
  aiWriteLevel: "read",
  parameters: browserRelayNavigateInputSchema,
  parameterHints: [
    {
      name: "url",
      required: true,
      description: "HTTP(S) URL to navigate to."
    },
    {
      name: "waitMs",
      required: false,
      description: "Additional wait time in milliseconds after navigation (0–5000)."
    }
  ],
  async execute(input, context) {
    const status = getRelayStatus();
    if (!status.connected) {
      throw new Error(
        "Browser relay not connected. Install the Plug Chrome Extension and enable relay for a tab."
      );
    }

    context.emit({
      invocationId: context.invocationId,
      projectId: context.project.id,
      toolName: "browser_relay_navigate",
      phase: "running",
      message: `Navigating relay browser to ${input.url}...`,
      createdAt: new Date().toISOString()
    });

    const response = await sendRelayCommand({
      method: "navigate",
      params: { url: input.url, waitMs: input.waitMs ?? 1500 }
    });

    if (response.error) {
      throw new Error(response.error);
    }

    const nav = response.result as { url: string; title: string };

    return {
      summary: `Relay navigated to "${nav.title}" (${nav.url}).`,
      output: {
        url: input.url,
        finalUrl: nav.url,
        title: nav.title
      }
    };
  }
};

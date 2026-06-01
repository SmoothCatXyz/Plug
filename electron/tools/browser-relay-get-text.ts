import { z } from "zod";
import type { AgentTool } from "./registry";
import { sendRelayCommand, getRelayStatus } from "../services/relay-service";

const browserRelayGetTextInputSchema = z.object({});

type BrowserRelayGetTextInput = z.infer<typeof browserRelayGetTextInputSchema>;

export const browserRelayGetTextTool: AgentTool<BrowserRelayGetTextInput> = {
  name: "browser_relay_get_text",
  label: "Browser Relay Get Text",
  description:
    "[Relay] Extract readable text content from the real Chrome browser relay tab (up to 24,000 chars).",
  category: "web",
  aiWriteLevel: "read",
  parameters: browserRelayGetTextInputSchema,
  parameterHints: [],
  async execute(_input, context) {
    const status = getRelayStatus();
    if (!status.connected) {
      throw new Error(
        "Browser relay not connected. Install the Plug Chrome Extension and enable relay for a tab."
      );
    }

    context.emit({
      invocationId: context.invocationId,
      projectId: context.project.id,
      toolName: "browser_relay_get_text",
      phase: "running",
      message: "Extracting text from relay browser tab...",
      createdAt: new Date().toISOString()
    });

    const response = await sendRelayCommand({ method: "getText", params: {} });

    if (response.error) {
      throw new Error(response.error);
    }

    const page = response.result as { text: string; url: string; title: string };

    return {
      summary: `Relay extracted ${page.text.length} chars from "${page.title}".`,
      output: {
        url: page.url,
        title: page.title,
        text: page.text
      }
    };
  }
};

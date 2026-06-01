import { z } from "zod";
import type { AgentTool } from "./registry";
import { sendRelayCommand, getRelayStatus } from "../services/relay-service";

const browserRelayTypeInputSchema = z.object({
  selector: z.string().min(1),
  text: z.string()
});

type BrowserRelayTypeInput = z.infer<typeof browserRelayTypeInputSchema>;

export const browserRelayTypeTool: AgentTool<BrowserRelayTypeInput> = {
  name: "browser_relay_type",
  label: "Browser Relay Type",
  description:
    "[Relay] Type text into a DOM element in the real Chrome browser relay tab using a CSS selector. The user explicitly enabled the relay tab, granting implicit consent for interactions.",
  category: "web",
  aiWriteLevel: "read",
  parameters: browserRelayTypeInputSchema,
  parameterHints: [
    {
      name: "selector",
      required: true,
      description: "CSS selector for the input element to type into."
    },
    {
      name: "text",
      required: true,
      description: "Text to type into the element."
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
      toolName: "browser_relay_type",
      phase: "running",
      message: `Typing into "${input.selector}" in relay tab...`,
      createdAt: new Date().toISOString()
    });

    const response = await sendRelayCommand({
      method: "type",
      params: { selector: input.selector, text: input.text }
    });

    if (response.error) {
      throw new Error(response.error);
    }

    const result = response.result as { typed: number };

    return {
      summary: `Relay typed ${result.typed} characters into "${input.selector}".`,
      output: {
        typed: result.typed,
        selector: input.selector
      }
    };
  }
};

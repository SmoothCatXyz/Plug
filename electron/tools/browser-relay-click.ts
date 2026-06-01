import { z } from "zod";
import type { AgentTool } from "./registry";
import { sendRelayCommand, getRelayStatus } from "../services/relay-service";

const browserRelayClickInputSchema = z.object({
  selector: z.string().min(1)
});

type BrowserRelayClickInput = z.infer<typeof browserRelayClickInputSchema>;

export const browserRelayClickTool: AgentTool<BrowserRelayClickInput> = {
  name: "browser_relay_click",
  label: "Browser Relay Click",
  description:
    "[Relay] Click a DOM element in the real Chrome browser relay tab using a CSS selector. The user explicitly enabled the relay tab, granting implicit consent for interactions.",
  category: "web",
  aiWriteLevel: "read",
  parameters: browserRelayClickInputSchema,
  parameterHints: [
    {
      name: "selector",
      required: true,
      description: "CSS selector for the element to click."
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
      toolName: "browser_relay_click",
      phase: "running",
      message: `Clicking "${input.selector}" in relay tab...`,
      createdAt: new Date().toISOString()
    });

    const response = await sendRelayCommand({
      method: "click",
      params: { selector: input.selector }
    });

    if (response.error) {
      throw new Error(response.error);
    }

    const result = response.result as { clicked: string };

    return {
      summary: `Relay clicked "${result.clicked}".`,
      output: {
        clicked: result.clicked
      }
    };
  }
};

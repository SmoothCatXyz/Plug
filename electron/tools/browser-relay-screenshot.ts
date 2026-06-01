import { z } from "zod";
import type { AgentTool } from "./registry";
import { sendRelayCommand, getRelayStatus } from "../services/relay-service";

const browserRelayScreenshotInputSchema = z.object({});

type BrowserRelayScreenshotInput = z.infer<typeof browserRelayScreenshotInputSchema>;

export const browserRelayScreenshotTool: AgentTool<BrowserRelayScreenshotInput> = {
  name: "browser_relay_screenshot",
  label: "Browser Relay Screenshot",
  description:
    "[Relay] Capture a PNG screenshot of the real Chrome browser relay tab as a base64 string.",
  category: "web",
  aiWriteLevel: "read",
  parameters: browserRelayScreenshotInputSchema,
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
      toolName: "browser_relay_screenshot",
      phase: "running",
      message: "Capturing relay browser screenshot...",
      createdAt: new Date().toISOString()
    });

    const response = await sendRelayCommand({ method: "screenshot", params: {} });

    if (response.error) {
      throw new Error(response.error);
    }

    const shot = response.result as { base64: string; url: string; title: string };

    return {
      summary: `Relay screenshot captured from "${shot.title}" (${shot.url}).`,
      output: {
        url: shot.url,
        title: shot.title,
        base64: shot.base64
      }
    };
  }
};

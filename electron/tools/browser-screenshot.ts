import { z } from "zod";
import type { AgentTool } from "./registry";
import { browserScreenshot } from "../services/browser-service";

const browserScreenshotInputSchema = z.object({});

type BrowserScreenshotInput = z.infer<typeof browserScreenshotInputSchema>;

export const browserScreenshotTool: AgentTool<BrowserScreenshotInput> = {
  name: "browser_screenshot",
  label: "Browser Screenshot",
  description: "Capture a PNG screenshot of the current browser page as a base64 string.",
  category: "web",
  aiWriteLevel: "read",
  parameters: browserScreenshotInputSchema,
  parameterHints: [],
  async execute(_input, context) {
    context.emit({
      invocationId: context.invocationId,
      projectId: context.project.id,
      toolName: "browser_screenshot",
      phase: "running",
      message: "Capturing screenshot...",
      createdAt: new Date().toISOString()
    });

    const result = await browserScreenshot();

    return {
      summary: `Screenshot captured from "${result.title}" (${result.width}×${result.height}).`,
      output: {
        url: result.url,
        title: result.title,
        width: result.width,
        height: result.height,
        base64: result.base64
      }
    };
  }
};

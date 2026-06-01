import { z } from "zod";
import type { AgentTool } from "./registry";
import { captureScreen } from "../services/computer-service";

const computerScreenshotInputSchema = z.object({});

type ComputerScreenshotInput = z.infer<typeof computerScreenshotInputSchema>;

export const computerScreenshotTool: AgentTool<ComputerScreenshotInput> = {
  name: "computer_screenshot",
  label: "Computer Screenshot",
  description: "Capture a screenshot of the primary display. Returns a base64-encoded PNG image.",
  category: "shell",
  aiWriteLevel: "read",
  parameters: computerScreenshotInputSchema,
  parameterHints: [],
  async execute(_input, context) {
    context.emit({
      invocationId: context.invocationId,
      projectId: context.project.id,
      toolName: "computer_screenshot",
      phase: "running",
      message: "Capturing screen.",
      createdAt: new Date().toISOString()
    });

    const screenshot = await captureScreen();

    return {
      summary: `Screen captured: ${screenshot.width}x${screenshot.height}px.`,
      output: {
        base64: screenshot.base64,
        width: screenshot.width,
        height: screenshot.height,
        mimeType: "image/png"
      }
    };
  }
};

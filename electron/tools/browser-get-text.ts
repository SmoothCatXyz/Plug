import { z } from "zod";
import type { AgentTool } from "./registry";
import { browserGetText } from "../services/browser-service";

const browserGetTextInputSchema = z.object({});

type BrowserGetTextInput = z.infer<typeof browserGetTextInputSchema>;

export const browserGetTextTool: AgentTool<BrowserGetTextInput> = {
  name: "browser_get_text",
  label: "Browser Get Text",
  description: "Extract the visible text content from the current browser page.",
  category: "web",
  aiWriteLevel: "read",
  parameters: browserGetTextInputSchema,
  parameterHints: [],
  async execute(_input, context) {
    context.emit({
      invocationId: context.invocationId,
      projectId: context.project.id,
      toolName: "browser_get_text",
      phase: "running",
      message: "Extracting page text...",
      createdAt: new Date().toISOString()
    });

    const result = await browserGetText();

    return {
      summary: `Extracted text from "${result.title}" (${result.text.length} chars).`,
      output: result
    };
  }
};

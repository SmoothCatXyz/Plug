import { z } from "zod";
import type { AgentTool } from "./registry";
import { browserCurrentUrl } from "../services/browser-service";
import { createPendingApproval } from "./write-policy";

const browserTypeInputSchema = z.object({
  selector: z.string().min(1),
  text: z.string(),
  reason: z.string().min(1)
});

type BrowserTypeInput = z.infer<typeof browserTypeInputSchema>;

export const browserTypeTool: AgentTool<BrowserTypeInput> = {
  name: "browser_type",
  label: "Browser Type",
  description: "Type text into a DOM input element on the current browser page. Requires approval.",
  category: "web",
  aiWriteLevel: "confirm",
  parameters: browserTypeInputSchema,
  parameterHints: [
    {
      name: "selector",
      required: true,
      description: "CSS selector of the input element."
    },
    {
      name: "text",
      required: true,
      description: "Text to type into the element."
    },
    {
      name: "reason",
      required: true,
      description: "Why the text input is needed."
    }
  ],
  async execute(input, context) {
    const currentUrl = browserCurrentUrl();
    const textPreview = input.text.length > 40 ? `${input.text.slice(0, 40)}...` : input.text;

    return {
      summary: `Type into "${input.selector}" is pending approval.`,
      pendingApproval: createPendingApproval({
        context,
        toolName: "browser_type",
        title: `Type into: ${input.selector}`,
        reason: input.reason,
        input,
        preview: {
          action: "command",
          cmd: `browser_type("${input.selector}", "${textPreview}")`,
          cwd: currentUrl || "(no page loaded)"
        }
      })
    };
  }
};

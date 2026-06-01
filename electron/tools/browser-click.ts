import { z } from "zod";
import type { AgentTool } from "./registry";
import { browserCurrentUrl } from "../services/browser-service";
import { createPendingApproval } from "./write-policy";

const browserClickInputSchema = z.object({
  selector: z.string().min(1),
  reason: z.string().min(1)
});

type BrowserClickInput = z.infer<typeof browserClickInputSchema>;

export const browserClickTool: AgentTool<BrowserClickInput> = {
  name: "browser_click",
  label: "Browser Click",
  description: "Click a DOM element on the current browser page by CSS selector. Requires approval.",
  category: "web",
  aiWriteLevel: "confirm",
  parameters: browserClickInputSchema,
  parameterHints: [
    {
      name: "selector",
      required: true,
      description: "CSS selector of the element to click."
    },
    {
      name: "reason",
      required: true,
      description: "Why the click is needed."
    }
  ],
  async execute(input, context) {
    const currentUrl = browserCurrentUrl();

    return {
      summary: `Click "${input.selector}" is pending approval.`,
      pendingApproval: createPendingApproval({
        context,
        toolName: "browser_click",
        title: `Click: ${input.selector}`,
        reason: input.reason,
        input,
        preview: {
          action: "command",
          cmd: `browser_click("${input.selector}")`,
          cwd: currentUrl || "(no page loaded)"
        }
      })
    };
  }
};

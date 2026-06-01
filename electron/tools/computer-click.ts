import { z } from "zod";
import type { AgentTool } from "./registry";
import { mouseClick } from "../services/computer-service";

const computerClickInputSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  button: z.enum(["left", "right"]).optional()
});

type ComputerClickInput = z.infer<typeof computerClickInputSchema>;

export const computerClickTool: AgentTool<ComputerClickInput> = {
  name: "computer_click",
  label: "Computer Click",
  description: "Click at a specific screen coordinate position.",
  category: "shell",
  aiWriteLevel: "confirm",
  parameters: computerClickInputSchema,
  parameterHints: [
    {
      name: "x",
      required: true,
      description: "Horizontal screen coordinate in pixels."
    },
    {
      name: "y",
      required: true,
      description: "Vertical screen coordinate in pixels."
    },
    {
      name: "button",
      required: false,
      description: "Mouse button: left (default) or right."
    }
  ],
  async execute(input, context) {
    const button = input.button ?? "left";
    context.emit({
      invocationId: context.invocationId,
      projectId: context.project.id,
      toolName: "computer_click",
      phase: "running",
      message: `Clicking at (${input.x}, ${input.y}) with ${button} button.`,
      createdAt: new Date().toISOString()
    });

    await mouseClick(input.x, input.y, button);

    return {
      summary: `Clicked at (${input.x}, ${input.y}).`,
      output: { x: input.x, y: input.y, button }
    };
  }
};

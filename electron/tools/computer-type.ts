import { z } from "zod";
import type { AgentTool } from "./registry";
import { typeText } from "../services/computer-service";

const computerTypeInputSchema = z.object({
  text: z.string().min(1)
});

type ComputerTypeInput = z.infer<typeof computerTypeInputSchema>;

export const computerTypeTool: AgentTool<ComputerTypeInput> = {
  name: "computer_type",
  label: "Computer Type",
  description: "Type text into the currently focused application using keyboard input.",
  category: "shell",
  aiWriteLevel: "confirm",
  parameters: computerTypeInputSchema,
  parameterHints: [
    {
      name: "text",
      required: true,
      description: "Text to type into the focused application."
    }
  ],
  async execute(input, context) {
    context.emit({
      invocationId: context.invocationId,
      projectId: context.project.id,
      toolName: "computer_type",
      phase: "running",
      message: `Typing: ${input.text.slice(0, 40)}${input.text.length > 40 ? "…" : ""}.`,
      createdAt: new Date().toISOString()
    });

    await typeText(input.text);

    return {
      summary: `Typed ${input.text.length} characters.`,
      output: { typed: input.text }
    };
  }
};

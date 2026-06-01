import { z } from "zod";
import type { AgentTool } from "./registry";
import { pressKey } from "../services/computer-service";

const computerKeyInputSchema = z.object({
  key: z.string().min(1)
});

type ComputerKeyInput = z.infer<typeof computerKeyInputSchema>;

export const computerKeyTool: AgentTool<ComputerKeyInput> = {
  name: "computer_key",
  label: "Computer Key",
  description: "Press a keyboard key by name (e.g. return, tab, escape, left, right, up, down, delete).",
  category: "shell",
  aiWriteLevel: "confirm",
  parameters: computerKeyInputSchema,
  parameterHints: [
    {
      name: "key",
      required: true,
      description: "Key name: return, tab, escape, space, delete, left, right, up, down, command, shift, option, control."
    }
  ],
  async execute(input, context) {
    context.emit({
      invocationId: context.invocationId,
      projectId: context.project.id,
      toolName: "computer_key",
      phase: "running",
      message: `Pressing key: ${input.key}.`,
      createdAt: new Date().toISOString()
    });

    await pressKey(input.key);

    return {
      summary: `Pressed key: ${input.key}.`,
      output: { key: input.key }
    };
  }
};

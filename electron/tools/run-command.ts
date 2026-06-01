import { z } from "zod";
import type { AgentTool } from "./registry";
import { createPendingApproval } from "./write-policy";

const runCommandInputSchema = z.object({
  cmd: z.string().min(1),
  cwd: z.string().min(1).optional()
});

type RunCommandInput = z.infer<typeof runCommandInputSchema>;

export const runCommandTool: AgentTool<RunCommandInput> = {
  name: "run_command",
  label: "Run Command",
  description: "Request an approved project-local command execution. Disabled by default.",
  category: "shell",
  aiWriteLevel: "confirm",
  parameters: runCommandInputSchema,
  parameterHints: [
    {
      name: "cmd",
      required: true,
      description: "Command to request."
    },
    {
      name: "cwd",
      required: false,
      description: "Project-relative working directory."
    }
  ],
  async execute(input, context) {
    if (process.env.PLUG_ENABLE_RUN_COMMAND !== "1") {
      throw new Error("run_command is disabled by default. Enable PLUG_ENABLE_RUN_COMMAND=1 before requesting shell execution.");
    }

    return {
      summary: `Command "${input.cmd}" is pending approval.`,
      pendingApproval: createPendingApproval({
        context,
        toolName: "run_command",
        title: `Run command: ${input.cmd}`,
        reason: "Shell execution is high risk and requires pilot authorization.",
        input,
        preview: {
          action: "command",
          cmd: input.cmd,
          cwd: input.cwd ?? "."
        }
      })
    };
  }
};

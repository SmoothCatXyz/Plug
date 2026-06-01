import { z } from "zod";

export const pluginToolSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  category: z.enum(["file", "web", "shell", "memory", "mcp", "artifact"]).default("shell"),
  aiWriteLevel: z.enum(["read", "auto", "confirm"]).default("confirm"),
  // Command to execute: receives JSON input via stdin, returns JSON output via stdout
  command: z.string().min(1),
  args: z.array(z.string()).default([])
});

export const pluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string(),
  author: z.string().optional(),
  tools: z.array(pluginToolSchema).default([])
});

export type PluginTool = z.infer<typeof pluginToolSchema>;
export type PluginManifest = z.infer<typeof pluginManifestSchema>;

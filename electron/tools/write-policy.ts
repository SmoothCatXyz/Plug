import type { PendingToolApproval, ToolApprovalPreview } from "../../shared/tool-schema";
import type { ProjectManifest } from "../../shared/types";
import type { ToolExecutionContext } from "./registry";
import { findSectionForPath } from "./project-files";

export type ProjectWritePolicy = "auto" | "confirm" | "readonly";

export function resolveWritePolicy(manifest: ProjectManifest, relativePath: string): ProjectWritePolicy {
  return findSectionForPath(manifest, relativePath)?.aiWrite ?? "confirm";
}

export function assertWritablePolicy(policy: ProjectWritePolicy, relativePath: string): void {
  if (policy === "readonly") {
    throw new Error(`AI writes are disabled for this project section: ${relativePath}`);
  }
}

export function createPendingApproval(options: {
  context: ToolExecutionContext;
  toolName: string;
  title: string;
  reason: string;
  input: unknown;
  preview: ToolApprovalPreview;
}): PendingToolApproval {
  return {
    id: `${options.context.invocationId}:approval`,
    projectId: options.context.project.id,
    toolName: options.toolName,
    title: options.title,
    reason: options.reason,
    input: options.input,
    preview: options.preview,
    createdAt: new Date().toISOString()
  };
}

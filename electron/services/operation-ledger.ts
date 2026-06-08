import type { ToolApprovalPreview, ToolStreamEvent } from "../../shared/types";

export type OperationStatus = "success" | "pending_approval" | "failed";
export type OperationAction =
  | "create_file"
  | "edit_file"
  | "delete_file"
  | "move_file"
  | "write_document"
  | "open_document"
  | "run_command"
  | "mcp_call"
  | "browser_action"
  | "generic_action";

export type OperationRecord = {
  invocationId: string;
  toolName: string;
  status: OperationStatus;
  action: OperationAction;
  message: string;
  path?: string;
  fromPath?: string;
  toPath?: string;
  pendingApprovalId?: string;
  verified: boolean;
  createdAt: string;
};

export function buildOperationLedger(events: ToolStreamEvent[]): OperationRecord[] {
  const latestOutcomeByInvocation = new Map<string, ToolStreamEvent>();

  for (const event of events) {
    if (!isOutcomePhase(event.phase)) {
      continue;
    }

    const current = latestOutcomeByInvocation.get(event.invocationId);
    if (!current || event.createdAt.localeCompare(current.createdAt) >= 0) {
      latestOutcomeByInvocation.set(event.invocationId, event);
    }
  }

  return [...latestOutcomeByInvocation.values()]
    .map(eventToOperation)
    .filter((record): record is OperationRecord => record !== null)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function findDocumentOperationToReveal(operations: OperationRecord[]): { path: string; index: boolean } | null {
  for (const operation of [...operations].reverse()) {
    if (operation.status !== "success" || !operation.path || !isReadableDocumentPath(operation.path)) {
      continue;
    }

    if (operation.action === "open_document") {
      return { path: operation.path, index: false };
    }

    if ((operation.action === "write_document" || operation.action === "create_file") && operation.verified) {
      return { path: operation.path, index: true };
    }
  }

  return null;
}

export function hasGroundedFileWriteOutcome(operations: OperationRecord[]): boolean {
  return operations.some(
    (operation) =>
      isFileMutationAction(operation.action) &&
      (operation.status === "pending_approval" || (operation.status === "success" && operation.verified))
  );
}

export function latestFileOperationFailure(operations: OperationRecord[]): OperationRecord | null {
  return (
    [...operations]
      .reverse()
      .find((operation) => isFileMutationAction(operation.action) && operation.status === "failed") ?? null
  );
}

function eventToOperation(event: ToolStreamEvent): OperationRecord | null {
  const details = asRecord(event.details);
  const output = asRecord(details?.output);
  const approval = getApprovalDetails(details);
  const preview = asPreview(approval?.preview);
  const action = resolveAction(event.toolName, output, preview);
  const path = resolvePath(output, preview, action);
  const status = event.phase === "error" ? "failed" : event.phase === "pending_approval" ? "pending_approval" : "success";

  if (!isActionLike(event.toolName, action)) {
    return null;
  }

  return {
    invocationId: event.invocationId,
    toolName: event.toolName,
    status,
    action,
    message: event.message,
    path,
    fromPath: typeof preview?.action === "string" && preview.action === "move" ? preview.fromPath : undefined,
    toPath: typeof preview?.action === "string" && preview.action === "move" ? preview.toPath : undefined,
    pendingApprovalId: typeof approval?.id === "string" ? approval.id : undefined,
    verified: resolveVerified(status, event.toolName, output),
    createdAt: event.createdAt
  };
}

function isOutcomePhase(phase: ToolStreamEvent["phase"]): boolean {
  return phase === "success" || phase === "pending_approval" || phase === "error";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getApprovalDetails(details: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!details) {
    return null;
  }

  if (typeof details.id === "string" && asRecord(details.preview)) {
    return details;
  }

  const approval = asRecord(details.approval);
  return approval && typeof approval.id === "string" ? approval : null;
}

function asPreview(value: unknown): ToolApprovalPreview | null {
  const preview = asRecord(value);
  if (!preview || typeof preview.action !== "string") {
    return null;
  }

  return preview as ToolApprovalPreview;
}

function resolveAction(
  toolName: string,
  output: Record<string, unknown> | null,
  preview: ToolApprovalPreview | null
): OperationAction {
  const outputAction = typeof output?.action === "string" ? output.action : "";

  if (toolName === "write_document") return "write_document";
  if (toolName === "open_document") return "open_document";
  if (toolName === "run_command") return "run_command";
  if (toolName.startsWith("browser_") || toolName.startsWith("computer_")) return "browser_action";
  if (toolName.startsWith("mcp_") || outputAction === "mcp" || preview?.action === "mcp") return "mcp_call";
  if (outputAction === "create" || preview?.action === "create" || toolName === "create_file") return "create_file";
  if (outputAction === "edit" || preview?.action === "edit" || toolName === "propose_edit") return "edit_file";
  if (outputAction === "delete" || preview?.action === "delete" || toolName === "delete_file") return "delete_file";
  if (outputAction === "move" || preview?.action === "move" || toolName === "move_file") return "move_file";

  return "generic_action";
}

function resolvePath(
  output: Record<string, unknown> | null,
  preview: ToolApprovalPreview | null,
  action: OperationAction
): string | undefined {
  const outputPath = output?.documentPath ?? output?.path;

  if (typeof outputPath === "string") {
    return outputPath;
  }

  if (!preview) {
    return undefined;
  }

  if (preview.action === "move") {
    return preview.toPath;
  }

  if (preview.action === "command" || preview.action === "mcp") {
    return action === "run_command" && preview.action === "command" ? preview.cwd : undefined;
  }

  return preview.path;
}

function resolveVerified(status: OperationStatus, toolName: string, output: Record<string, unknown> | null): boolean {
  if (status !== "success") {
    return false;
  }

  if (output?.verified === true) {
    return true;
  }

  return toolName === "open_document";
}

function isActionLike(toolName: string, action: OperationAction): boolean {
  if (action !== "generic_action") {
    return true;
  }

  return toolName.startsWith("computer_");
}

function isFileMutationAction(action: OperationAction): boolean {
  return action === "create_file" || action === "edit_file" || action === "delete_file" || action === "move_file" || action === "write_document";
}

function isReadableDocumentPath(path: string): boolean {
  return path.endsWith(".md") || /\.html?$/i.test(path);
}

import { expect, test } from "vitest";
import type { ToolStreamEvent } from "../../../shared/types";
import {
  buildOperationLedger,
  findDocumentOperationToReveal,
  hasGroundedFileWriteOutcome,
  latestFileOperationFailure
} from "../operation-ledger";

test("operation ledger normalizes success, pending approval, and failed tool outcomes", () => {
  const events: ToolStreamEvent[] = [
    event("create-json", "create_file", "success", "Created 05-knowledge/project-info.json.", {
      output: {
        action: "create",
        path: "05-knowledge/project-info.json",
        verified: true
      }
    }),
    event("create-prd", "create_file", "pending_approval", "Create 02-prd/login.md is pending approval.", {
      id: "create-prd:approval",
      projectId: "proj",
      toolName: "create_file",
      title: "Create 02-prd/login.md",
      reason: "test",
      input: {},
      preview: {
        action: "create",
        path: "02-prd/login.md",
        content: "# Login\n"
      },
      createdAt: "2026-06-08T00:00:01.000Z"
    }),
    event("bad-doc", "write_document", "error", "write_document cannot create .json files.")
  ];

  const ledger = buildOperationLedger(events);

  expect(ledger).toHaveLength(3);
  expect(ledger[0]).toMatchObject({
    invocationId: "create-json",
    status: "success",
    action: "create_file",
    path: "05-knowledge/project-info.json",
    verified: true
  });
  expect(ledger[1]).toMatchObject({
    invocationId: "create-prd",
    status: "pending_approval",
    action: "create_file",
    path: "02-prd/login.md",
    pendingApprovalId: "create-prd:approval",
    verified: false
  });
  expect(latestFileOperationFailure(ledger)).toMatchObject({
    invocationId: "bad-doc",
    status: "failed",
    action: "write_document"
  });
  expect(hasGroundedFileWriteOutcome(ledger)).toBe(true);
});

test("operation ledger reveals only verified document writes or opens", () => {
  const ledger = buildOperationLedger([
    event("unverified-md", "create_file", "success", "Created 02-prd/ghost.md.", {
      output: {
        action: "create",
        path: "02-prd/ghost.md"
      }
    }),
    event("verified-md", "write_document", "success", "已写好《调研》。", {
      output: {
        documentPath: "05-knowledge/research.md",
        verified: true
      }
    }),
    event("opened-md", "open_document", "success", "已打开《主页》。", {
      output: {
        documentPath: "00-home.md",
        verified: true
      }
    })
  ]);

  expect(findDocumentOperationToReveal(ledger)).toEqual({ path: "00-home.md", index: false });
});

function event(
  invocationId: string,
  toolName: string,
  phase: ToolStreamEvent["phase"],
  message: string,
  details?: unknown
): ToolStreamEvent {
  return {
    invocationId,
    projectId: "proj",
    toolName,
    phase,
    message,
    details,
    createdAt: `2026-06-08T00:00:0${eventCounter++}.000Z`
  };
}

let eventCounter = 0;

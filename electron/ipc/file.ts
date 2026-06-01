import { ipcMain } from "electron";
import { ipcSchemas } from "../../shared/ipc-schema";
import {
  invokeAgentTool,
  listAgentTools,
  listPendingToolApprovals,
  resolveToolApproval
} from "../services/agent-service";
import { registerIpcHandler } from "./register";

export function registerFileIpc(): void {
  registerIpcHandler("tool.list", async (payload) => ({
    tools: await listAgentTools(payload.projectId, payload.mode)
  }));

  registerIpcHandler("tool.pendingApprovals", async (payload) => ({
    approvals: await listPendingToolApprovals(payload.projectId)
  }));

  ipcMain.handle("tool.invoke", async (event, rawPayload: unknown) => {
    const payload = ipcSchemas["tool.invoke"].request.parse(rawPayload);
    const result = await invokeAgentTool({
      invocationId: payload.invocationId,
      projectId: payload.projectId,
      mode: payload.mode,
      name: payload.name,
      input: payload.input,
      emit: (toolEvent) => {
        event.sender.send("tool.event", toolEvent);
      }
    });

    return ipcSchemas["tool.invoke"].response.parse(result);
  });

  ipcMain.handle("tool.resolveApproval", async (event, rawPayload: unknown) => {
    const payload = ipcSchemas["tool.resolveApproval"].request.parse(rawPayload);
    const result = await resolveToolApproval({
      projectId: payload.projectId,
      approvalId: payload.approvalId,
      decision: payload.decision,
      emit: (toolEvent) => {
        event.sender.send("tool.event", toolEvent);
      }
    });

    return ipcSchemas["tool.resolveApproval"].response.parse(result);
  });
}

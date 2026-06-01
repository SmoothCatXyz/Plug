import { createSession, getSessionSnapshot, openSession, renameSession } from "../services/session-service";
import { registerIpcHandler } from "./register";

export function registerSessionIpc(): void {
  registerIpcHandler("session.list", async (payload) => {
    return getSessionSnapshot(payload.projectId);
  });

  registerIpcHandler("session.create", async (payload) => {
    return createSession(payload.projectId);
  });

  registerIpcHandler("session.open", async (payload) => {
    return openSession(payload.projectId, payload.sessionId);
  });

  registerIpcHandler("session.rename", async (payload) => {
    return renameSession(payload.projectId, payload.sessionId, payload.title);
  });
}

import { ipcMain } from "electron";
import { ipcSchemas, sessionSnapshotSchema } from "../../shared/ipc-schema";
import type { ChatStreamEvent, ToolStreamEvent } from "../../shared/types";
import { streamChatResponse } from "../services/ai-service";

export function registerAiIpc(): void {
  const schemas = ipcSchemas["chat.send"];

  ipcMain.handle("chat.send", async (event, rawPayload: unknown) => {
    const payload = schemas.request.parse(rawPayload);
    const snapshot = await streamChatResponse(
      payload,
      (streamEvent: ChatStreamEvent) => {
        event.sender.send("chat.event", streamEvent);
      },
      (toolEvent: ToolStreamEvent) => {
        event.sender.send("tool.event", toolEvent);
      }
    );

    return sessionSnapshotSchema.parse(snapshot);
  });
}

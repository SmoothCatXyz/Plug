import { deletePromptApp, listPromptApps, upsertPromptApp } from "../services/prompt-app-service";
import { registerIpcHandler } from "./register";

export function registerPromptAppIpc(): void {
  registerIpcHandler("promptApp.list", async () => {
    return listPromptApps();
  });

  registerIpcHandler("promptApp.upsert", async (payload) => {
    return upsertPromptApp(payload);
  });

  registerIpcHandler("promptApp.delete", async (payload) => {
    return deletePromptApp(payload.id);
  });
}

import {
  checkForUpdates,
  downloadUpdate,
  getUpdateSnapshot,
  installUpdate
} from "../services/update-service";
import { registerIpcHandler } from "./register";

export function registerUpdateIpc(): void {
  registerIpcHandler("update.getStatus", () => getUpdateSnapshot());
  registerIpcHandler("update.check", () => checkForUpdates());
  registerIpcHandler("update.download", () => downloadUpdate());
  registerIpcHandler("update.install", () => installUpdate());
}

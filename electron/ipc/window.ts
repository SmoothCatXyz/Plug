import { BrowserWindow } from "electron";
import { registerIpcHandler } from "./register";

type RegisterWindowIpcOptions = {
  openSettingsWindow: () => void;
};

export function registerWindowIpc(options: RegisterWindowIpcOptions): void {
  registerIpcHandler("window.openSettings", () => {
    options.openSettingsWindow();
    return { ok: true };
  });

  registerIpcHandler("window.closeCurrent", (_payload, event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
    return { ok: true };
  });
}

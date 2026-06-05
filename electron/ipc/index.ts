import { app } from "electron";
import { APP_NAME } from "../../shared/types";
import { registerAiIpc } from "./ai";
import { registerConfigIpc } from "./config";
import { registerFileIpc } from "./file";
import { registerGitIpc } from "./git";
import { registerMcpIpc } from "./mcp";
import { registerPromptAppIpc } from "./prompt-app";
import { registerProjectIpc } from "./project";
import { registerRelayIpc } from "./relay";
import { registerSessionIpc } from "./session";
import { registerTokenSavingsIpc } from "./token-savings";
import { registerUpdateIpc } from "./update";
import { registerWindowIpc } from "./window";
import { registerWhisperIpc } from "./whisper";
import { registerIpcHandler } from "./register";

type RegisterIpcHandlersOptions = {
  openSettingsWindow: () => void;
};

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  registerIpcHandler("app.info", () => ({
    name: APP_NAME,
    version: app.getVersion(),
    environment: app.isPackaged ? "production" : "development"
  }));

  registerProjectIpc();
  registerSessionIpc();
  registerFileIpc();
  registerGitIpc();
  registerMcpIpc();
  registerAiIpc();
  registerConfigIpc();
  registerPromptAppIpc();
  registerRelayIpc();
  registerTokenSavingsIpc();
  registerUpdateIpc();
  registerWindowIpc(options);
  registerWhisperIpc();
}

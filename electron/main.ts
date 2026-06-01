import { app, BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { APP_NAME } from "../shared/types";
import { registerIpcHandlers } from "./ipc";
import { startRelayServer, stopRelayServer } from "./services/relay-service";
import { ensurePluginsDir } from "./services/plugin-service";

let mainWindow: BrowserWindow | null = null;

function resolvePreloadPath(): string {
  const esmPreloadPath = join(__dirname, "../preload/preload.mjs");

  if (existsSync(esmPreloadPath)) {
    return esmPreloadPath;
  }

  return join(__dirname, "../preload/preload.js");
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1280,
    minHeight: 800,
    title: APP_NAME,
    backgroundColor: "#05080D",
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

void app.whenReady().then(() => {
  registerIpcHandlers();
  startRelayServer();
  void ensurePluginsDir();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopRelayServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

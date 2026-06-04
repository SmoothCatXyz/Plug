import { app, BrowserWindow } from "electron";
import type { BrowserWindowConstructorOptions } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { APP_NAME } from "../shared/types";
import { registerIpcHandlers } from "./ipc";
import { startRelayServer, stopRelayServer } from "./services/relay-service";
import { ensurePluginsDir } from "./services/plugin-service";

if (process.platform === "darwin") {
  app.commandLine.appendSwitch("use-mock-keychain");
}

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

function resolvePreloadPath(): string {
  const esmPreloadPath = join(__dirname, "../preload/preload.mjs");

  if (existsSync(esmPreloadPath)) {
    return esmPreloadPath;
  }

  return join(__dirname, "../preload/preload.js");
}

function resolveAppIconPath(): string | undefined {
  const candidates = [
    join(__dirname, "../../build/icon.png"),
    join(process.cwd(), "build/icon.png")
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function applyDockIcon(): void {
  const iconPath = resolveAppIconPath();

  if (iconPath && process.platform === "darwin") {
    app.dock?.setIcon(iconPath);
  }
}

function applyMacNativeWindowChrome(windowOptions: BrowserWindowConstructorOptions): void {
  if (process.platform !== "darwin") {
    return;
  }

  windowOptions.titleBarStyle = "hiddenInset";
  windowOptions.trafficLightPosition = { x: 18, y: 18 };
}

function loadRendererWindow(window: BrowserWindow, kind: "main" | "settings"): void {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);

    if (kind === "settings") {
      url.searchParams.set("window", "settings");
    } else {
      url.searchParams.delete("window");
    }

    void window.loadURL(url.toString());
    return;
  }

  const rendererPath = join(__dirname, "../renderer/index.html");

  if (kind === "settings") {
    void window.loadFile(rendererPath, { query: { window: "settings" } });
    return;
  }

  void window.loadFile(rendererPath);
}

function createMainWindow(): void {
  const windowOptions: BrowserWindowConstructorOptions = {
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
  };

  const iconPath = resolveAppIconPath();

  if (iconPath) {
    windowOptions.icon = iconPath;
  }

  applyMacNativeWindowChrome(windowOptions);

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  loadRendererWindow(mainWindow, "main");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore();
    }

    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1180,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    title: `${APP_NAME} Settings`,
    backgroundColor: "#252A33",
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };

  const iconPath = resolveAppIconPath();

  if (iconPath) {
    windowOptions.icon = iconPath;
  }

  applyMacNativeWindowChrome(windowOptions);

  settingsWindow = new BrowserWindow(windowOptions);

  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show();
  });

  loadRendererWindow(settingsWindow, "settings");

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

void app.whenReady().then(() => {
  registerIpcHandlers({ openSettingsWindow });
  startRelayServer();
  void ensurePluginsDir();
  applyDockIcon();
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

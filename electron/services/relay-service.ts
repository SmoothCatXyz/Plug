import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";

const DEFAULT_PORT = 23001;
const TOKEN_DIR = join(homedir(), ".plug");
const TOKEN_FILE = join(TOKEN_DIR, "relay-token");
const COMMAND_TIMEOUT_MS = 35000;

export type RelayStatus = {
  running: boolean;
  port: number;
  token: string;
  connected: boolean;
  tabInfo: { tabId: number; url: string; title: string } | null;
};

export type RelayCommand = {
  method: "navigate" | "screenshot" | "getText" | "click" | "type" | "getTabInfo";
  params: Record<string, unknown>;
};

export type RelayResponse = {
  result?: unknown;
  error?: string;
};

type PendingCommand = {
  resolve: (value: RelayResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

// Singleton state
let wss: WebSocketServer | null = null;
let extensionSocket: WebSocket | null = null;
let currentToken: string | null = null;
let currentTabInfo: RelayStatus["tabInfo"] = null;
const pendingCommands = new Map<string, PendingCommand>();

function loadOrCreateToken(): string {
  if (currentToken) return currentToken;

  if (existsSync(TOKEN_FILE)) {
    try {
      const stored = readFileSync(TOKEN_FILE, "utf-8").trim();
      if (stored.length > 0) {
        currentToken = stored;
        return currentToken;
      }
    } catch {
      // fall through to generate new token
    }
  }

  const token = randomUUID();
  try {
    if (!existsSync(TOKEN_DIR)) {
      mkdirSync(TOKEN_DIR, { recursive: true });
    }
    writeFileSync(TOKEN_FILE, token, "utf-8");
  } catch {
    // Non-fatal: token will only live in memory this session
  }
  currentToken = token;
  return currentToken;
}

function isLocalhost(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress;
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function handleExtensionMessage(raw: string): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }

  if (msg.type === "auth") {
    const token = loadOrCreateToken();
    if (msg.token === token) {
      extensionSocket?.send(JSON.stringify({ type: "auth_ok" }));
    } else {
      extensionSocket?.send(JSON.stringify({ type: "auth_fail" }));
      extensionSocket?.close();
      extensionSocket = null;
    }
    return;
  }

  if (msg.type === "tab_info") {
    currentTabInfo = {
      tabId: msg.tabId as number,
      url: msg.url as string,
      title: msg.title as string
    };
    return;
  }

  if (msg.type === "response") {
    const id = msg.id as string;
    const pending = pendingCommands.get(id);
    if (!pending) return;

    pendingCommands.delete(id);
    clearTimeout(pending.timer);

    const response: RelayResponse = {};
    if ("result" in msg) response.result = msg.result;
    if ("error" in msg) response.error = msg.error as string;
    pending.resolve(response);
  }
}

export function startRelayServer(): void {
  if (wss) return;

  loadOrCreateToken();

  const httpServer = createServer();

  wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
    if (!isLocalhost(req)) {
      socket.close();
      return;
    }

    // Only allow one extension connection at a time
    if (extensionSocket && extensionSocket.readyState === WebSocket.OPEN) {
      extensionSocket.close();
    }

    extensionSocket = socket;
    currentTabInfo = null;

    socket.on("message", (data) => {
      handleExtensionMessage(data.toString());
    });

    socket.on("close", () => {
      if (extensionSocket === socket) {
        extensionSocket = null;
        currentTabInfo = null;
      }
    });

    socket.on("error", () => {
      if (extensionSocket === socket) {
        extensionSocket = null;
        currentTabInfo = null;
      }
    });
  });

  httpServer.listen(DEFAULT_PORT, "127.0.0.1");
}

export function stopRelayServer(): void {
  if (!wss) return;

  for (const [, pending] of pendingCommands) {
    clearTimeout(pending.timer);
    pending.reject(new Error("Relay server stopped."));
  }
  pendingCommands.clear();

  extensionSocket?.close();
  extensionSocket = null;
  currentTabInfo = null;

  wss.close();
  wss = null;
}

export function getRelayStatus(): RelayStatus {
  const token = loadOrCreateToken();
  return {
    running: wss !== null,
    port: DEFAULT_PORT,
    token,
    connected: extensionSocket !== null && extensionSocket.readyState === WebSocket.OPEN,
    tabInfo: currentTabInfo
  };
}

export function getRelayToken(): string {
  return loadOrCreateToken();
}

async function sendRelayCommandOnce(
  command: RelayCommand,
  timeoutMs: number
): Promise<RelayResponse> {
  if (!extensionSocket || extensionSocket.readyState !== WebSocket.OPEN) {
    throw new Error(
      "Browser relay not connected. Install the Plug Chrome Extension and enable relay for a tab."
    );
  }

  const id = randomUUID();
  console.log(`[relay] sending ${command.method} (timeout ${timeoutMs}ms)`);

  return new Promise<RelayResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCommands.delete(id);
      reject(new Error(`Relay command timed out after ${timeoutMs}ms: ${command.method}`));
    }, timeoutMs);

    pendingCommands.set(id, { resolve, reject, timer });

    extensionSocket!.send(JSON.stringify({
      type: "command",
      id,
      method: command.method,
      params: command.params
    }));
  });
}

export async function sendRelayCommand(
  command: RelayCommand,
  timeoutMs = COMMAND_TIMEOUT_MS
): Promise<RelayResponse> {
  return sendRelayCommandOnce(command, timeoutMs);
}

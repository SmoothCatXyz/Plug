// Offscreen document — runs persistently, never terminated by Chrome.
// Owns the WebSocket connection to Plug's relay server.
// Delegates CDP execution to background.js (service worker) via chrome.runtime.sendMessage.

console.log("[plug-relay] offscreen.js loaded: 2026-06-01-pollWake (no 20s sleep)");

let ws = null;
let token = null;

// offscreen document cannot access chrome.storage — request token from background instead
async function loadToken() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "get_token" }, r => {
      resolve(r?.token || null);
    });
  });
}

async function ensureConnected() {
  if (!token) token = await loadToken();
  if (!token) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  connect();
}

// Wake the service worker (sending any message auto-starts it in MV3) and
// resolve as soon as it answers a ping. Polls briefly instead of a fixed sleep,
// so a command runs ~immediately once the worker is up, never after a 20s wait.
async function wakeWorker(maxMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const alive = await chrome.runtime.sendMessage({ type: "ping" })
      .then(() => true)
      .catch(() => false);
    if (alive) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

function connect() {
  if (!token) return;
  try {
    ws = new WebSocket("ws://127.0.0.1:23001");

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = async (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === "auth_ok") {
        // Tell background to send current tab info
        chrome.runtime.sendMessage({ type: "relay_authed" }).catch(() => {});
        return;
      }

      if (msg.type === "auth_fail") {
        ws.close();
        return;
      }

      if (msg.type === "command") {
        // MV3 kills the service worker when idle. Wake it and run the command as
        // soon as it answers a ping — polling, NOT a blind 20s sleep. The old
        // fixed wait (20s) exceeded the relay command timeout (15s), so every
        // command issued after the worker went idle failed. The worker restores
        // its tab/debugger state inside execute_cdp, so "alive" is enough.
        await wakeWorker();

        // Now execute the actual command
        let result;
        try {
          result = await chrome.runtime.sendMessage({
            type: "execute_cdp",
            method: msg.method,
            params: msg.params
          });
        } catch (e) {
          result = { error: e?.message || "Service worker unavailable" };
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "response", id: msg.id, ...result }));
        }
      }
    };

    ws.onclose = () => {
      ws = null;
      // Reconnect after a short delay
      setTimeout(ensureConnected, 2000);
    };

    ws.onerror = () => {
      // Routine when the desktop app is briefly unavailable (e.g. it restarted);
      // onclose schedules a reconnect. Log quietly so it isn't mistaken for a
      // real failure. The browser still prints its own "connection failed" line.
      console.debug("[Plug Relay] socket error; will reconnect");
      ws?.close();
    };
  } catch {
    ws = null;
  }
}

// Handle messages from background or popup
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "offscreen_set_token") {
    token = msg.token;
    if (ws) ws.close(); else ensureConnected();
    reply({ ok: true });
    return true;
  }

  if (msg.type === "offscreen_send") {
    // Background wants to push data to relay server (e.g., tab_info)
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg.data));
    }
    reply({ ok: true });
    return true;
  }

  if (msg.type === "offscreen_status") {
    reply({ connected: ws !== null && ws.readyState === WebSocket.OPEN });
    return true;
  }

  return false;
});

// Initial connection
ensureConnected();
// Periodic reconnect check
setInterval(ensureConnected, 5000);

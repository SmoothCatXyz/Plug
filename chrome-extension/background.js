// Service Worker — short-lived, handles CDP commands and tab management.
// WebSocket lives in offscreen.js (persistent, never terminated).

// Build marker — bump this when changing relay logic so a reload is verifiable
// in the service-worker console (chrome://extensions -> Plug -> service worker).
const RELAY_BUILD = "2026-06-01-getText-innerText+cdpSend+pollWake";
console.log("[plug-relay] background.js loaded:", RELAY_BUILD);

let activeTabId = null;

// ── Offscreen document management ────────────────────────────────────────────

async function ensureOffscreen() {
  const exists = await chrome.offscreen.hasDocument().catch(() => false);
  if (!exists) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["BLOBS"],
      justification: "Persistent WebSocket connection to Plug desktop app relay server"
    });
  }
}

// ── Message handler (wakes service worker on demand) ─────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {

  // Liveness check from offscreen — just reply immediately
  if (msg.type === "ping") {
    reply({ ok: true });
    return true;
  }

  // Offscreen requests token (chrome.storage not available in offscreen context)
  if (msg.type === "get_token") {
    chrome.storage.local.get("relayToken", r => reply({ token: r.relayToken || null }));
    return true;
  }

  // Offscreen notified us auth completed — send current tab info
  if (msg.type === "relay_authed") {
    if (activeTabId !== null) {
      chrome.tabs.get(activeTabId).then(tab => {
        chrome.runtime.sendMessage({
          type: "offscreen_send",
          data: { type: "tab_info", tabId: activeTabId, url: tab.url, title: tab.title }
        }).catch(() => {});
      }).catch(() => {});
    }
    return false;
  }

  // Offscreen delegating a CDP command to us
  if (msg.type === "execute_cdp") {
    executeCommand(msg.method, msg.params)
      .then(reply)
      .catch(e => reply({ error: e?.message || String(e) }));
    return true; // keep message channel open for async reply
  }

  // Popup: save token and forward to offscreen WebSocket
  if (msg.type === "set_token") {
    const t = msg.token;
    chrome.storage.local.set({ relayToken: t });
    ensureOffscreen().then(() =>
      chrome.runtime.sendMessage({ type: "offscreen_set_token", token: t }).catch(() => {})
    );
    reply({ ok: true });
    return true;
  }

  // Popup: enable relay for a tab
  if (msg.type === "enable_tab") {
    enableTab(msg.tabId)
      .then(() => reply({ ok: true }))
      .catch(e => reply({ ok: false, error: e.message }));
    return true;
  }

  // Popup: disable relay
  if (msg.type === "disable_tab") {
    disableTab().then(() => reply({ ok: true }));
    return true;
  }

  // Popup: get status
  if (msg.type === "get_status") {
    ensureOffscreen()
      .then(() => chrome.runtime.sendMessage({ type: "offscreen_status" }))
      .then(r => reply({ connected: r?.connected ?? false, activeTabId, hasToken: true }))
      .catch(() => reply({ connected: false, activeTabId, hasToken: false }));
    return true;
  }

  return false;
});

// ── CDP execution ─────────────────────────────────────────────────────────────

// chrome.debugger.sendCommand has no timeout of its own: if CDP wedges, the
// promise never settles and the whole relay command hangs until its 35s cap.
// Race every CDP call against a watchdog so a stuck call fails fast and clearly.
function cdpSend(target, method, params, timeoutMs = 10000) {
  return Promise.race([
    chrome.debugger.sendCommand(target, method, params),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${method} timed out in extension after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

async function executeCommand(method, params) {
  if (activeTabId === null) {
    // Try to restore from storage
    const r = await chrome.storage.local.get("activeTabId");
    if (r.activeTabId) {
      try {
        await chrome.tabs.get(r.activeTabId);
        try {
          await chrome.debugger.attach({ tabId: r.activeTabId }, "1.3");
        } catch (e) {
          // "Another debugger is already attached" = still attached from before SW restart, reuse it
          if (!String(e?.message).includes("already attached")) throw e;
        }
        activeTabId = r.activeTabId;
      } catch {
        await chrome.storage.local.remove("activeTabId");
        return { error: "No active relay tab. Open the Plug extension popup and click 'Enable Relay for This Tab'." };
      }
    } else {
      return { error: "No active relay tab. Open the Plug extension popup and click 'Enable Relay for This Tab'." };
    }
  }

  try {
    if (method === "navigate") {
      await cdpSend({ tabId: activeTabId }, "Page.navigate", { url: params.url });
      const waitMs = typeof params.waitMs === "number" ? params.waitMs : 1500;
      await new Promise(r => setTimeout(r, waitMs));
      const tab = await chrome.tabs.get(activeTabId);
      return { result: { url: tab.url, title: tab.title } };
    }

    if (method === "screenshot") {
      const { data } = await cdpSend(
        { tabId: activeTabId }, "Page.captureScreenshot", { format: "png", quality: 80 }, 12000
      );
      const tab = await chrome.tabs.get(activeTabId);
      return { result: { base64: data, url: tab.url, title: tab.title } };
    }

    if (method === "getText") {
      console.log("[plug-relay] getText via innerText (", RELAY_BUILD, ")");
      // Read the visible text directly via innerText. This is cheap and, unlike
      // DOM.getOuterHTML (which serializes the entire DOM tree and can stall for
      // >15s on heavy pages), it is bounded twice: CDP's own `timeout` aborts a
      // slow evaluation, and cdpSend's watchdog aborts a wedged transport.
      const r = await cdpSend(
        { tabId: activeTabId },
        "Runtime.evaluate",
        {
          expression:
            "((document.body && document.body.innerText) || document.documentElement.innerText || '').slice(0, 24000)",
          returnByValue: true,
          timeout: 8000
        },
        10000
      );
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "getText failed");
      const text = (r.result && r.result.value) || "";
      const tab = await chrome.tabs.get(activeTabId);
      return { result: { text, url: tab.url, title: tab.title } };
    }

    if (method === "click") {
      const r = await cdpSend({ tabId: activeTabId }, "Runtime.evaluate", {
        expression: `(function(){const el=document.querySelector(${JSON.stringify(params.selector)});if(!el)throw new Error('Not found: '+${JSON.stringify(params.selector)});el.click();return el.tagName;})()`,
        returnByValue: true, timeout: 5000
      }, 8000);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "Click failed");
      return { result: { clicked: params.selector } };
    }

    if (method === "type") {
      const r = await cdpSend({ tabId: activeTabId }, "Runtime.evaluate", {
        expression: `(function(){const el=document.querySelector(${JSON.stringify(params.selector)});if(!el)throw new Error('Not found: '+${JSON.stringify(params.selector)});el.focus();el.value=${JSON.stringify(params.text)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`,
        returnByValue: true, timeout: 5000
      }, 8000);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "Type failed");
      return { result: { typed: params.text.length } };
    }

    if (method === "getTabInfo") {
      const tab = await chrome.tabs.get(activeTabId);
      return { result: { tabId: activeTabId, url: tab.url, title: tab.title } };
    }

    return { error: `Unknown method: ${method}` };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

// ── Tab management ────────────────────────────────────────────────────────────

async function enableTab(tabId) {
  if (activeTabId !== null && activeTabId !== tabId) {
    await chrome.debugger.detach({ tabId: activeTabId }).catch(() => {});
  }
  await chrome.debugger.attach({ tabId }, "1.3");
  activeTabId = tabId;
  await chrome.storage.local.set({ activeTabId: tabId });
  const tab = await chrome.tabs.get(tabId);
  await chrome.runtime.sendMessage({
    type: "offscreen_send",
    data: { type: "tab_info", tabId, url: tab.url, title: tab.title }
  }).catch(() => {});
}

async function disableTab() {
  if (activeTabId !== null) {
    await chrome.debugger.detach({ tabId: activeTabId }).catch(() => {});
    activeTabId = null;
    await chrome.storage.local.remove("activeTabId");
  }
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === activeTabId) {
    activeTabId = null;
    await chrome.storage.local.remove("activeTabId");
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

// On install/update — this fires when an unpacked extension is reloaded — tear
// down any stale offscreen document so it is recreated with the latest code.
// Without this, the persistent offscreen document keeps running OLD code across
// reloads (it survives the service-worker restart), which is exactly why relay
// fixes appeared not to take effect.
chrome.runtime.onInstalled.addListener(async () => {
  try { await chrome.offscreen.closeDocument(); } catch {}
  ensureOffscreen().catch(() => {});
});

// Ensure offscreen document is alive whenever this service worker starts
ensureOffscreen().catch(() => {});

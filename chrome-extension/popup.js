// Plug Browser Relay Popup

const statusDot = document.getElementById("status-dot");
const statusLabel = document.getElementById("status-label");
const tabInfoEl = document.getElementById("tab-info");
const tabUrlEl = document.getElementById("tab-url");
const tokenInput = document.getElementById("token-input");
const saveBtn = document.getElementById("save-btn");
const relayBtn = document.getElementById("relay-btn");
const relayHint = document.getElementById("relay-hint");

let currentTabId = null;
let relayActive = false;

async function getCurrentTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function applyStatus(connected, activeTabId) {
  if (connected) {
    statusDot.className = "status-dot connected";
    statusLabel.className = "status-label connected";
    statusLabel.textContent = "Connected";
  } else {
    statusDot.className = "status-dot disconnected";
    statusLabel.className = "status-label";
    statusLabel.textContent = "Disconnected";
  }

  relayActive = activeTabId !== null && activeTabId === currentTabId;

  if (relayActive) {
    relayBtn.textContent = "Disable Relay for This Tab";
    relayBtn.className = "btn btn-relay btn-full active";
    relayHint.textContent = "Relay is active. The agent can see and interact with this tab.";
  } else if (activeTabId !== null) {
    relayBtn.textContent = "Enable Relay for This Tab";
    relayBtn.className = "btn btn-relay btn-full";
    relayHint.textContent = "Relay is active on a different tab. Click to switch to this tab.";
  } else {
    relayBtn.textContent = "Enable Relay for This Tab";
    relayBtn.className = "btn btn-relay btn-full";
    relayHint.textContent = "Click to attach the debugger to the current tab and start relaying.";
  }
}

async function refresh() {
  currentTabId = await getCurrentTabId();

  chrome.runtime.sendMessage({ type: "get_status" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      applyStatus(false, null);
      tabInfoEl.classList.add("hidden");
      return;
    }

    applyStatus(response.connected, response.activeTabId);

    if (response.hasToken) {
      tokenInput.placeholder = "Token saved (hidden)";
    }
  });

  // Fetch tab info via storage for relay URL display
  chrome.storage.local.get("relayTabInfo", (result) => {
    if (result.relayTabInfo) {
      tabUrlEl.textContent = result.relayTabInfo.url || "";
      tabInfoEl.classList.remove("hidden");
    }
  });
}

saveBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) return;

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  chrome.runtime.sendMessage({ type: "set_token", token }, () => {
    tokenInput.value = "";
    tokenInput.placeholder = "Token saved (hidden)";
    saveBtn.textContent = "Saved";
    setTimeout(() => {
      saveBtn.textContent = "Save";
      saveBtn.disabled = false;
      refresh();
    }, 1200);
  });
});

relayBtn.addEventListener("click", async () => {
  if (!currentTabId) return;

  relayBtn.disabled = true;

  if (relayActive) {
    chrome.runtime.sendMessage({ type: "disable_tab" }, () => {
      relayBtn.disabled = false;
      tabInfoEl.classList.add("hidden");
      refresh();
    });
  } else {
    chrome.runtime.sendMessage({ type: "enable_tab", tabId: currentTabId }, (response) => {
      relayBtn.disabled = false;
      if (response && !response.ok) {
        relayHint.textContent = `Error: ${response.error || "Failed to attach debugger."}`;
        relayHint.style.color = "#f87171";
      } else {
        relayHint.style.color = "";
      }
      refresh();
    });
  }
});

// Initial load
refresh();

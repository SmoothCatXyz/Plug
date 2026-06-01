# Plug Browser Relay — Chrome Extension

The Plug Browser Relay extension connects the Plug AI agent to your real Chrome browser, giving the agent access to your live session cookies, logins, and local storage — without proxying credentials through a server.

## How it works

1. The Plug desktop app runs a local WebSocket server on `ws://127.0.0.1:23001`
2. This extension connects to that server and authenticates with a secret token
3. The agent sends CDP commands through the relay to your chosen browser tab

## Installation

### Load the unpacked extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `chrome-extension/` folder from this repository
5. The "Plug Browser Relay" extension will appear in your extensions list

## Finding your relay token

The relay token is generated automatically when Plug starts. To find it:

1. Open Plug
2. Go to **Settings → Relay**
3. Copy the token shown there

Alternatively, the token is stored at `~/.plug/relay-token` on your filesystem.

## Enabling relay for a tab

1. Click the Plug Browser Relay extension icon in the Chrome toolbar
2. Paste your relay token into the **Relay Token** field and click **Save**
3. Navigate to the tab you want the agent to interact with
4. Click **Enable Relay for This Tab**
5. Chrome will show a banner at the top of the tab: "Plug Browser Relay has started debugging this browser"

The agent can now use `browser_relay_*` tools to navigate, screenshot, read text, click, and type in your authenticated browser session.

## Disabling relay

Click the extension icon and click **Disable Relay for This Tab**. The debugger will be detached and the tab banner will disappear.

## Security notes

- The relay server only accepts connections from `127.0.0.1` (localhost) — no remote access
- The token is stored locally at `~/.plug/relay-token` and in Chrome's local storage
- Only one tab can be relay-active at a time
- The agent can only interact with the tab you explicitly enabled

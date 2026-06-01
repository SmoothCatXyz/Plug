import { BrowserWindow } from "electron";

let headlessWindow: BrowserWindow | null = null;

function getOrCreateWindow(): BrowserWindow {
  if (headlessWindow && !headlessWindow.isDestroyed()) {
    return headlessWindow;
  }

  headlessWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  headlessWindow.on("closed", () => {
    headlessWindow = null;
  });

  return headlessWindow;
}

export async function browserNavigate(
  url: string,
  timeoutMs = 20000
): Promise<{ finalUrl: string; title: string; statusOk: boolean }> {
  const win = getOrCreateWindow();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Browser navigation timed out after ${timeoutMs}ms: ${url}`));
    }, timeoutMs);

    let statusOk = true;

    win.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
      clearTimeout(timer);
      reject(new Error(`Navigation failed (${errorCode}): ${errorDescription}`));
    });

    win.webContents.session.webRequest.onHeadersReceived(
      { urls: [url] },
      (details, callback) => {
        statusOk = details.statusCode >= 200 && details.statusCode < 400;
        callback({ responseHeaders: details.responseHeaders });
      }
    );

    win.webContents.once("did-finish-load", () => {
      clearTimeout(timer);
      resolve({
        finalUrl: win.webContents.getURL(),
        title: win.webContents.getTitle(),
        statusOk
      });
    });

    win.loadURL(url).catch((error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export async function browserGetText(): Promise<{ url: string; title: string; text: string }> {
  const win = getOrCreateWindow();

  const text = await win.webContents.executeJavaScript(
    `(function() {
      const clone = document.cloneNode(true);
      const scripts = clone.querySelectorAll('script, style, noscript');
      scripts.forEach(el => el.remove());
      return (clone.body || clone).innerText || clone.textContent || '';
    })()`
  ) as string;

  return {
    url: win.webContents.getURL(),
    title: win.webContents.getTitle(),
    text: text.slice(0, 24000)
  };
}

export async function browserScreenshot(): Promise<{
  base64: string;
  url: string;
  title: string;
  width: number;
  height: number;
}> {
  const win = getOrCreateWindow();
  const image = await win.webContents.capturePage();
  const size = image.getSize();

  return {
    base64: image.toPNG().toString("base64"),
    url: win.webContents.getURL(),
    title: win.webContents.getTitle(),
    width: size.width,
    height: size.height
  };
}

export async function browserClick(selector: string): Promise<{ clicked: string; url: string }> {
  const win = getOrCreateWindow();

  await win.webContents.executeJavaScript(
    `(function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Selector not found: ' + ${JSON.stringify(selector)});
      el.click();
    })()`
  );

  return {
    clicked: selector,
    url: win.webContents.getURL()
  };
}

export async function browserTypeText(selector: string, text: string): Promise<void> {
  const win = getOrCreateWindow();

  await win.webContents.executeJavaScript(
    `(function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Selector not found: ' + ${JSON.stringify(selector)});
      el.focus();
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, ${JSON.stringify(text)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        el.value = ${JSON.stringify(text)};
      }
    })()`
  );
}

export function browserCurrentUrl(): string {
  if (!headlessWindow || headlessWindow.isDestroyed()) {
    return "";
  }

  return headlessWindow.webContents.getURL();
}

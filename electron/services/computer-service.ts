import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { desktopCapturer } from "electron";

const execFileAsync = promisify(execFile);

// Screenshot the primary display using Electron's desktopCapturer.
export async function captureScreen(): Promise<{ base64: string; width: number; height: number }> {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1920, height: 1080 }
  });

  const primary = sources[0];

  if (!primary) {
    throw new Error("No screen source found.");
  }

  const image = primary.thumbnail;
  const dataUrl = image.toDataURL();
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  const size = image.getSize();

  return {
    base64,
    width: size.width,
    height: size.height
  };
}

// Type text via AppleScript (macOS only).
export async function typeText(text: string): Promise<void> {
  // Escape backslashes and double quotes for AppleScript string literal
  const safe = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  await execFileAsync("osascript", [
    "-e",
    `tell application "System Events" to keystroke "${safe}"`
  ]);
}

// Press a named key via AppleScript key code (macOS only).
export async function pressKey(key: string): Promise<void> {
  const code = keyNameToCode(key);
  await execFileAsync("osascript", [
    "-e",
    `tell application "System Events" to key code ${code}`
  ]);
}

// Click at screen coordinates via AppleScript (macOS only).
export async function mouseClick(x: number, y: number, button: "left" | "right" = "left"): Promise<void> {
  if (button === "right") {
    await execFileAsync("osascript", [
      "-e",
      `tell application "System Events" to click at {${x}, ${y}} using {right click:true}`
    ]);
  } else {
    await execFileAsync("osascript", [
      "-e",
      `tell application "System Events" to click at {${x}, ${y}}`
    ]);
  }
}

function keyNameToCode(name: string): number {
  const codes: Record<string, number> = {
    return: 36,
    enter: 36,
    tab: 48,
    space: 49,
    delete: 51,
    backspace: 51,
    escape: 53,
    command: 55,
    shift: 56,
    option: 58,
    control: 59,
    left: 123,
    right: 124,
    down: 125,
    up: 126
  };

  return codes[name.toLowerCase()] ?? 0;
}

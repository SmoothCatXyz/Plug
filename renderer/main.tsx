import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./components/hud/hud.css";
import "./styles/global.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Renderer root element was not found.");
}

document.documentElement.dataset.platform = getRendererPlatform();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);

function getRendererPlatform(): "mac" | "windows" | "linux" {
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();

  if (platform.includes("mac") || userAgent.includes("mac os")) {
    return "mac";
  }

  if (platform.includes("win") || userAgent.includes("windows")) {
    return "windows";
  }

  return "linux";
}

import { join } from "node:path";
import { homedir } from "node:os";

export function getDefaultProjectsDir(): string {
  return join(homedir(), "Documents", "Plug");
}

export function getPlugHomeDir(): string {
  return join(homedir(), ".plug");
}

export function getProjectsRegistryPath(): string {
  return join(getPlugHomeDir(), "projects.json");
}

export function getConfigPath(): string {
  return join(getPlugHomeDir(), "config.json");
}

export function getPromptAppsPath(): string {
  return join(getPlugHomeDir(), "prompt-apps.json");
}

export function getMcpConfigPath(): string {
  return join(getPlugHomeDir(), "mcp.json");
}

export function getTokenSavingsPath(): string {
  return join(getPlugHomeDir(), "token-savings.json");
}

export function getLogsDir(): string {
  return join(getPlugHomeDir(), "logs");
}

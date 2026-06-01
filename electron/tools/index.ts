import { browserClickTool } from "./browser-click";
import { computerClickTool } from "./computer-click";
import { computerKeyTool } from "./computer-key";
import { computerScreenshotTool } from "./computer-screenshot";
import { computerTypeTool } from "./computer-type";
import { browserGetTextTool } from "./browser-get-text";
import { browserNavigateTool } from "./browser-navigate";
import { browserRelayClickTool } from "./browser-relay-click";
import { browserRelayGetTextTool } from "./browser-relay-get-text";
import { browserRelayNavigateTool } from "./browser-relay-navigate";
import { browserRelayScreenshotTool } from "./browser-relay-screenshot";
import { browserRelayTypeTool } from "./browser-relay-type";
import { browserScreenshotTool } from "./browser-screenshot";
import { browserTypeTool } from "./browser-type";
import { createDirectoryTool } from "./create-directory";
import { createFileTool } from "./create-file";
import { deleteFileTool } from "./delete-file";
import { listSectionTool } from "./list-section";
import { moveFileTool } from "./move-file";
import { proposeEditTool } from "./propose-edit";
import { readFileTool } from "./read-file";
import { readMultipleFilesTool } from "./read-multiple-files";
import { runCommandTool } from "./run-command";
import { searchFilesTool } from "./search-files";
import { searchMemoryTool } from "./search-memory";
import { ToolRegistry } from "./registry";
import { updateIndexTool } from "./update-index";
import { updateMemoryTool } from "./update-memory";
import { writeDocumentTool } from "./write-document";
import { openDocumentTool } from "./open-document";
import { webFetchTool } from "./web-fetch";
import { webSearchTool } from "./web-search";

export { ToolRegistry } from "./registry";
export type { AgentTool, ToolExecutionContext, ToolHandlerResult } from "./registry";

export function createCoreToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // File tools
  registry.register(readFileTool);
  registry.register(readMultipleFilesTool);
  registry.register(searchFilesTool);
  registry.register(listSectionTool);
  registry.register(proposeEditTool);
  registry.register(createFileTool);
  registry.register(createDirectoryTool);
  registry.register(deleteFileTool);
  registry.register(moveFileTool);
  registry.register(updateIndexTool);
  registry.register(updateMemoryTool);
  registry.register(searchMemoryTool);
  registry.register(writeDocumentTool);
  registry.register(openDocumentTool);

  // Web tools
  registry.register(webSearchTool);
  registry.register(webFetchTool);
  registry.register(browserNavigateTool);
  registry.register(browserGetTextTool);
  registry.register(browserScreenshotTool);
  registry.register(browserClickTool);
  registry.register(browserTypeTool);

  // Browser relay tools (real Chrome with live session)
  registry.register(browserRelayNavigateTool);
  registry.register(browserRelayScreenshotTool);
  registry.register(browserRelayGetTextTool);
  registry.register(browserRelayClickTool);
  registry.register(browserRelayTypeTool);

  // Shell tools
  registry.register(runCommandTool);

  // Computer use tools (macOS desktop automation)
  registry.register(computerScreenshotTool);
  registry.register(computerTypeTool);
  registry.register(computerKeyTool);
  registry.register(computerClickTool);

  return registry;
}

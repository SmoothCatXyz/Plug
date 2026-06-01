import { checkMcpHealth, deleteMcpServer, listMcpServers, upsertMcpServer } from "../services/mcp-service";
import { registerIpcHandler } from "./register";

export function registerMcpIpc(): void {
  registerIpcHandler("mcp.list", async () => {
    return listMcpServers();
  });

  registerIpcHandler("mcp.upsert", async (payload) => {
    return upsertMcpServer(payload);
  });

  registerIpcHandler("mcp.delete", async (payload) => {
    return deleteMcpServer(payload.id);
  });

  registerIpcHandler("mcp.health", async (payload) => {
    return {
      checks: await checkMcpHealth(payload.id)
    };
  });
}

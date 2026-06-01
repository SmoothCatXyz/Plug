import {
  deleteProvider,
  getConfigSnapshot,
  setNetworkConfig,
  setToolModel,
  upsertProvider
} from "../services/config-service";
import { testProviderConnection } from "../services/ai-service";
import { registerIpcHandler } from "./register";

export function registerConfigIpc(): void {
  registerIpcHandler("config.get", async () => {
    return getConfigSnapshot();
  });

  registerIpcHandler("config.upsertProvider", async (payload) => {
    return upsertProvider(payload);
  });

  registerIpcHandler("config.deleteProvider", async (payload) => {
    return deleteProvider(payload.id);
  });

  registerIpcHandler("config.setToolModel", async (payload) => {
    return setToolModel(payload);
  });

  registerIpcHandler("config.setNetwork", async (payload) => {
    return setNetworkConfig(payload);
  });

  registerIpcHandler("config.testProvider", async (payload) => {
    return testProviderConnection(payload);
  });
}

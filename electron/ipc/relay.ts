import { getRelayStatus, getRelayToken } from "../services/relay-service";
import { registerIpcHandler } from "./register";

export function registerRelayIpc(): void {
  registerIpcHandler("relay.status", () => {
    return getRelayStatus();
  });

  registerIpcHandler("relay.getToken", () => {
    return { token: getRelayToken() };
  });
}

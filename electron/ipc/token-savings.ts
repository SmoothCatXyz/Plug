import { getTokenSavingsSnapshot } from "../services/token-savings-service";
import { registerIpcHandler } from "./register";

export function registerTokenSavingsIpc(): void {
  registerIpcHandler("tokenSavings.get", () => getTokenSavingsSnapshot());
}

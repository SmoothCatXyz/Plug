import { resolveToolProviderSecret } from "../services/config-service";
import { registerIpcHandler } from "./register";

export function registerWhisperIpc(): void {
  registerIpcHandler("whisper.getConfig", async () => {
    const secret = await resolveToolProviderSecret();
    return {
      apiKey: secret.apiKey,
      baseURL: secret.provider.baseURL
    };
  });
}

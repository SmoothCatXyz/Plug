import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { createProviderFetch } from "./network-service";
import type { resolveChatProviderSecret } from "./config-service";

export type ProviderSecret = Awaited<ReturnType<typeof resolveChatProviderSecret>>;

/**
 * providerOptions for "light" paths that don't need a reasoning chain — chat
 * replies, action confirmations, the work/chat classifier. Maps to OpenAI's
 * `reasoning_effort: "minimal"`, which skips most hidden reasoning and cuts a
 * gpt-5 round-trip from ~8s to ~1-2s. The work orchestrator deliberately omits
 * this so it keeps full reasoning for multi-step tool planning.
 */
export const MINIMAL_REASONING = {
  openaiCompatible: { reasoningEffort: "minimal" }
} as const;

export function toLanguageModel(providerSecret: ProviderSecret): LanguageModel {
  const provider = createOpenAICompatible({
    name: providerSecret.provider.id,
    baseURL: providerSecret.provider.baseURL,
    apiKey: providerSecret.apiKey,
    fetch: createProviderFetch(providerSecret.network, {
      mode: providerSecret.provider.proxyMode,
      url: providerSecret.provider.proxyUrl
    })
  });

  return provider(providerSecret.modelId);
}

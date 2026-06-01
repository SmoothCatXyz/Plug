import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { createProviderFetch } from "./network-service";
import type { ProviderSecret } from "./ai-service";

// Detect if a provider config points to an Anthropic-native endpoint.
// We check baseURL for anthropic.com to avoid enabling thinking for
// OpenAI-compatible proxies that happen to front Claude.
export function isAnthropicProvider(baseURL: string): boolean {
  return baseURL.includes("anthropic.com") || baseURL.includes("api.anthropic.com");
}

// Create an Anthropic language model instance using the @ai-sdk/anthropic adapter.
// This is required to use providerOptions.anthropic.thinking — the generic
// openai-compatible adapter does not forward Anthropic-specific extensions.
//
// Note: @ai-sdk/anthropic@1.x returns LanguageModelV1 while ai@6 expects
// LanguageModelV3. The runtime is compatible via the SDK's backward-compat
// wrapper, so we cast here.
export function createAnthropicThinkingModel(secret: ProviderSecret): LanguageModel {
  const anthropic = createAnthropic({
    apiKey: secret.apiKey || "",
    baseURL: secret.provider.baseURL,
    fetch: createProviderFetch(secret.network, {
      mode: secret.provider.proxyMode,
      url: secret.provider.proxyUrl
    })
  });

  return anthropic(secret.modelId, {
    cacheControl: false
  }) as unknown as LanguageModel;
}

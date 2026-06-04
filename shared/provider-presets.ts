import type { ProviderDraft } from "./types";

export type ProviderPreset = Omit<ProviderDraft, "id" | "apiKey" | "models"> & {
  id: string;
  models: readonly string[];
  summary: string;
};

const commonProviderFields = {
  type: "openai-compatible",
  proxyMode: "global",
  proxyUrl: ""
} as const;

export const providerPresets = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-v4-flash",
    summary: "Official DeepSeek OpenAI-compatible endpoint.",
    ...commonProviderFields
  },
  {
    id: "openai",
    label: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    models: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"],
    defaultModel: "gpt-5.4-mini",
    summary: "OpenAI platform API.",
    ...commonProviderFields
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-3.5-flash", "gemini-3-flash", "gemini-2.5-pro", "gemini-2.5-flash"],
    defaultModel: "gemini-3.5-flash",
    summary: "Gemini API OpenAI compatibility layer.",
    ...commonProviderFields
  },
  {
    id: "xai",
    label: "xAI",
    baseURL: "https://api.x.ai/v1",
    models: ["grok-4.3", "grok-4.3-fast", "grok-build-0.1"],
    defaultModel: "grok-4.3",
    summary: "xAI Grok chat completions endpoint.",
    ...commonProviderFields
  },
  {
    id: "groq",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    models: ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "llama-3.3-70b-versatile"],
    defaultModel: "openai/gpt-oss-20b",
    summary: "Groq OpenAI-compatible inference endpoint.",
    ...commonProviderFields
  },
  {
    id: "mistral",
    label: "Mistral AI",
    baseURL: "https://api.mistral.ai/v1",
    models: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest", "codestral-latest"],
    defaultModel: "mistral-small-latest",
    summary: "Mistral chat completions API.",
    ...commonProviderFields
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    models: ["~openai/gpt-latest", "openrouter/auto", "openai/gpt-5", "google/gemini-3.5-flash"],
    defaultModel: "~openai/gpt-latest",
    summary: "Multi-provider OpenAI-compatible router.",
    ...commonProviderFields
  },
  {
    id: "together",
    label: "Together AI",
    baseURL: "https://api.together.ai/v1",
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "meta-llama/Llama-3.3-70B-Instruct-Turbo"],
    defaultModel: "openai/gpt-oss-20b",
    summary: "Together OpenAI-compatible inference API.",
    ...commonProviderFields
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    baseURL: "https://api.fireworks.ai/inference/v1",
    models: [
      "accounts/fireworks/models/llama-v3p1-8b-instruct",
      "accounts/fireworks/models/deepseek-v3p1",
      "accounts/fireworks/models/kimi-k2-instruct-0905"
    ],
    defaultModel: "accounts/fireworks/models/llama-v3p1-8b-instruct",
    summary: "Fireworks OpenAI-compatible inference endpoint.",
    ...commonProviderFields
  },
  {
    id: "qwen-dashscope",
    label: "Qwen DashScope",
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-plus", "qwen3.6-plus", "qwen3.7-max", "qwen3.6-flash", "qwen3-coder-plus"],
    defaultModel: "qwen-plus",
    summary: "Alibaba Cloud DashScope international endpoint.",
    ...commonProviderFields
  },
  {
    id: "kimi",
    label: "Moonshot Kimi",
    baseURL: "https://api.moonshot.ai/v1",
    models: ["kimi-k2.6", "kimi-k2.5", "kimi-k2"],
    defaultModel: "kimi-k2.6",
    summary: "Moonshot Kimi OpenAI-compatible API.",
    ...commonProviderFields
  },
  {
    id: "zai-glm",
    label: "Z.AI GLM",
    baseURL: "https://api.z.ai/api/paas/v4",
    models: ["glm-5.1", "glm-4.7", "glm-4.6", "glm-4.5"],
    defaultModel: "glm-5.1",
    summary: "Z.AI GLM OpenAI-compatible endpoint.",
    ...commonProviderFields
  }
] as const satisfies readonly ProviderPreset[];

export const defaultProviderPreset = providerPresets[0];

export function providerDraftFromPreset(preset: ProviderPreset = defaultProviderPreset): ProviderDraft {
  return {
    label: preset.label,
    type: preset.type,
    baseURL: preset.baseURL,
    models: [...preset.models],
    defaultModel: preset.defaultModel,
    proxyMode: preset.proxyMode,
    proxyUrl: preset.proxyUrl,
    apiKey: ""
  };
}

export function findProviderPreset(id: string): ProviderPreset | undefined {
  return providerPresets.find((preset) => preset.id === id);
}

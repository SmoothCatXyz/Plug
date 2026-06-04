import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  appConfigSnapshotSchema,
  networkConfigSchema,
  providerDraftSchema,
  toolModelSelectionSchema
} from "../../shared/ipc-schema";
import { defaultProviderPreset } from "../../shared/provider-presets";
import type {
  AppConfigSnapshot,
  NetworkConfig,
  ProviderDraft,
  ProviderProxyMode,
  ProviderSummary,
  ToolModelSelection
} from "../../shared/types";
import { getConfigPath, getPlugHomeDir } from "../utils/paths";
import { decryptSecret, encryptSecret, hasEncryptedSecret } from "./secret-service";

const storedProviderSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.literal("openai-compatible"),
  baseURL: z.string(),
  encryptedApiKey: z.string(),
  models: z.array(z.string()),
  defaultModel: z.string(),
  proxyMode: z.enum(["global", "off", "custom"]),
  proxyUrl: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const storedConfigSchema = z.object({
  version: z.literal(1),
  modelConnectors: z.array(storedProviderSchema),
  chatModel: toolModelSelectionSchema.optional(),
  toolModel: toolModelSelectionSchema,
  network: networkConfigSchema
});

type StoredProvider = z.infer<typeof storedProviderSchema>;
type StoredConfig = z.infer<typeof storedConfigSchema>;

export async function getConfigSnapshot(): Promise<AppConfigSnapshot> {
  return toSnapshot(await readConfig());
}

export async function upsertProvider(draft: ProviderDraft): Promise<AppConfigSnapshot> {
  const providerDraft = providerDraftSchema.parse(draft);
  const config = await readConfig();
  const now = new Date().toISOString();
  const normalizedModels = normalizeModels(providerDraft.models);
  const existing = providerDraft.id
    ? config.modelConnectors.find((provider) => provider.id === providerDraft.id)
    : undefined;
  const id = existing?.id ?? providerDraft.id?.trim() ?? providerIdFromLabel(providerDraft.label);
  const apiKey = providerDraft.apiKey?.trim();
  const provider: StoredProvider = {
    id,
    label: providerDraft.label.trim(),
    type: "openai-compatible",
    baseURL: normalizeBaseUrl(providerDraft.baseURL),
    encryptedApiKey: apiKey ? encryptSecret(apiKey) : existing?.encryptedApiKey ?? "",
    models: normalizedModels,
    defaultModel: normalizedModels.includes(providerDraft.defaultModel)
      ? providerDraft.defaultModel
      : normalizedModels[0],
    proxyMode: providerDraft.proxyMode,
    proxyUrl: normalizeProviderProxyUrl(providerDraft.proxyMode, providerDraft.proxyUrl),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  const nextConfig = ensureModelSelectionsValid({
    ...config,
    modelConnectors: [provider, ...config.modelConnectors.filter((entry) => entry.id !== id)]
  });

  await writeConfig(nextConfig);
  return toSnapshot(nextConfig);
}

export async function deleteProvider(id: string): Promise<AppConfigSnapshot> {
  const config = await readConfig();
  const nextProviders = config.modelConnectors.filter((provider) => provider.id !== id);
  const nextConfig = ensureModelSelectionsValid({
    ...config,
    modelConnectors: nextProviders.length ? nextProviders : [defaultProvider()]
  });

  await writeConfig(nextConfig);
  return toSnapshot(nextConfig);
}

export async function setToolModel(selection: ToolModelSelection): Promise<AppConfigSnapshot> {
  const config = await readConfig();
  const parsedSelection = validateModelSelection(config, selection);

  const nextConfig = {
    ...config,
    toolModel: parsedSelection
  };

  await writeConfig(nextConfig);
  return toSnapshot(nextConfig);
}

export async function setChatModel(selection: ToolModelSelection): Promise<AppConfigSnapshot> {
  const config = await readConfig();
  const parsedSelection = validateModelSelection(config, selection);

  const nextConfig = {
    ...config,
    chatModel: parsedSelection
  };

  await writeConfig(nextConfig);
  return toSnapshot(nextConfig);
}

export async function setNetworkConfig(network: NetworkConfig): Promise<AppConfigSnapshot> {
  const parsedNetwork = normalizeNetworkConfig(networkConfigSchema.parse(network));
  const config = await readConfig();
  const nextConfig: StoredConfig = {
    ...config,
    network: parsedNetwork
  };

  await writeConfig(nextConfig);
  return toSnapshot(nextConfig);
}

export async function getProviderSecret(id: string): Promise<{
  provider: ProviderSummary;
  apiKey: string;
  network: NetworkConfig;
}> {
  const config = await readConfig();
  const provider = config.modelConnectors.find((entry) => entry.id === id);

  if (!provider) {
    throw new Error(`Provider was not found: ${id}`);
  }

  return {
    provider: toProviderSummary(provider),
    apiKey: provider.encryptedApiKey ? decryptSecret(provider.encryptedApiKey) : "",
    network: config.network
  };
}

export async function resolveChatProviderSecret(modelId: string): Promise<{
  provider: ProviderSummary;
  apiKey: string;
  modelId: string;
  network: NetworkConfig;
}> {
  const config = await readConfig();
  const chatModel = config.chatModel;
  const provider = chatModel
    ? config.modelConnectors.find((entry) => entry.id === chatModel.providerId) ?? config.modelConnectors[0]
    : config.modelConnectors.find((entry) => entry.models.includes(modelId)) ?? config.modelConnectors[0];

  if (!provider) {
    throw new Error("No provider is configured.");
  }

  return {
    provider: toProviderSummary(provider),
    apiKey: provider.encryptedApiKey ? decryptSecret(provider.encryptedApiKey) : "",
    modelId: chatModel && provider.models.includes(chatModel.modelId)
      ? chatModel.modelId
      : provider.models.includes(modelId)
        ? modelId
        : provider.defaultModel,
    network: config.network
  };
}

export async function resolveToolProviderSecret(): Promise<{
  provider: ProviderSummary;
  apiKey: string;
  modelId: string;
  network: NetworkConfig;
}> {
  const config = await readConfig();
  const provider =
    config.modelConnectors.find((entry) => entry.id === config.toolModel.providerId) ?? config.modelConnectors[0];

  if (!provider) {
    throw new Error("No provider is configured.");
  }

  return {
    provider: toProviderSummary(provider),
    apiKey: provider.encryptedApiKey ? decryptSecret(provider.encryptedApiKey) : "",
    modelId: provider.models.includes(config.toolModel.modelId) ? config.toolModel.modelId : provider.defaultModel,
    network: config.network
  };
}

export async function readRawConfigForVerification(): Promise<StoredConfig> {
  return readConfig();
}

async function readConfig(): Promise<StoredConfig> {
  await ensureConfigDir();

  try {
    const raw = await readFile(getConfigPath(), "utf8");
    const parsed = storedConfigSchema.safeParse(JSON.parse(raw));

    if (parsed.success) {
      return ensureModelSelectionsValid(normalizeStoredConfig(parsed.data));
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const config = defaultConfig();
  await writeConfig(config);
  return config;
}

async function writeConfig(config: StoredConfig): Promise<void> {
  await ensureConfigDir();
  await writeFile(getConfigPath(), `${JSON.stringify(storedConfigSchema.parse(config), null, 2)}\n`, "utf8");
}

async function ensureConfigDir(): Promise<void> {
  await mkdir(getPlugHomeDir(), { recursive: true });
}

function toSnapshot(config: StoredConfig): AppConfigSnapshot {
  return appConfigSnapshotSchema.parse({
    configPath: getConfigPath(),
    providers: config.modelConnectors.map(toProviderSummary),
    chatModel: config.chatModel,
    toolModel: config.toolModel,
    network: config.network
  });
}

function toProviderSummary(provider: StoredProvider): ProviderSummary {
  return {
    id: provider.id,
    label: provider.label,
    type: provider.type,
    baseURL: provider.baseURL,
    models: provider.models,
    defaultModel: provider.defaultModel,
    proxyMode: provider.proxyMode,
    proxyUrl: provider.proxyUrl,
    hasApiKey: hasEncryptedSecret(provider.encryptedApiKey),
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt
  };
}

function defaultConfig(): StoredConfig {
  const provider = defaultProvider();

  return {
    version: 1,
    modelConnectors: [provider],
    chatModel: {
      providerId: provider.id,
      modelId: provider.defaultModel
    },
    toolModel: {
      providerId: provider.id,
      modelId: provider.defaultModel
    },
    network: {
      proxyMode: "off",
      proxyUrl: "",
      timeoutMs: 60000,
      longTimeoutMs: 300000,
      maxRetries: 3,
      retryBaseDelayMs: 1000
    }
  };
}

function defaultProvider(): StoredProvider {
  const now = new Date().toISOString();

  return {
    id: "deepseek-default",
    label: defaultProviderPreset.label,
    type: defaultProviderPreset.type,
    baseURL: defaultProviderPreset.baseURL,
    encryptedApiKey: "",
    models: [...defaultProviderPreset.models],
    defaultModel: defaultProviderPreset.defaultModel,
    proxyMode: defaultProviderPreset.proxyMode,
    proxyUrl: defaultProviderPreset.proxyUrl,
    createdAt: now,
    updatedAt: now
  };
}

function ensureModelSelectionsValid(config: StoredConfig): StoredConfig {
  const chatModel = ensureModelSelectionValid(config, config.chatModel);
  const toolModel = ensureModelSelectionValid(config, config.toolModel);

  if (!chatModel || !toolModel) {
    return defaultConfig();
  }

  return {
    ...config,
    chatModel,
    toolModel
  };
}

function ensureModelSelectionValid(
  config: StoredConfig,
  selection: ToolModelSelection | undefined
): ToolModelSelection | null {
  const provider =
    config.modelConnectors.find((entry) => entry.id === selection?.providerId) ?? config.modelConnectors[0];

  if (!provider) {
    return null;
  }

  return {
    providerId: provider.id,
    modelId: selection && provider.models.includes(selection.modelId) ? selection.modelId : provider.defaultModel
  };
}

function validateModelSelection(config: StoredConfig, selection: ToolModelSelection): ToolModelSelection {
  const parsedSelection = toolModelSelectionSchema.parse(selection);
  const provider = config.modelConnectors.find((entry) => entry.id === parsedSelection.providerId);

  if (!provider) {
    throw new Error(`Provider was not found: ${parsedSelection.providerId}`);
  }

  if (!provider.models.includes(parsedSelection.modelId)) {
    throw new Error(`Model is not defined on provider ${provider.id}: ${parsedSelection.modelId}`);
  }

  return parsedSelection;
}

function normalizeStoredConfig(config: StoredConfig): StoredConfig {
  return {
    ...config,
    modelConnectors: config.modelConnectors.map((provider) => ({
      ...provider,
      baseURL: normalizeBaseUrl(provider.baseURL),
      models: normalizeModels(provider.models),
      defaultModel: provider.models.includes(provider.defaultModel) ? provider.defaultModel : provider.models[0],
      proxyUrl: normalizeProviderProxyUrl(provider.proxyMode, provider.proxyUrl)
    })),
    network: normalizeNetworkConfig(config.network)
  };
}

function normalizeModels(models: string[]): string[] {
  const uniqueModels = [...new Set(models.map((model) => model.trim()).filter(Boolean))];

  if (!uniqueModels.length) {
    throw new Error("At least one model is required.");
  }

  return uniqueModels;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmedUrl = baseUrl.trim().replace(/\/+$/, "");
  const parsedUrl = new URL(trimmedUrl);

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error(`Provider baseURL must use http or https: ${baseUrl}`);
  }

  return parsedUrl.toString().replace(/\/+$/, "");
}

function normalizeProviderProxyUrl(mode: ProviderProxyMode, proxyUrl: string): string {
  const trimmedUrl = proxyUrl.trim();

  if (mode !== "custom") {
    return "";
  }

  assertProxyUrl(trimmedUrl, "provider proxy");
  return trimmedUrl;
}

function normalizeNetworkConfig(network: NetworkConfig): NetworkConfig {
  const proxyUrl = network.proxyMode === "off" ? "" : network.proxyUrl.trim();

  if (network.proxyMode !== "off") {
    assertProxyUrl(proxyUrl, "global proxy");
  }

  return {
    ...network,
    proxyUrl,
    longTimeoutMs: Math.max(network.longTimeoutMs, network.timeoutMs)
  };
}

function assertProxyUrl(proxyUrl: string, label: string): void {
  if (!proxyUrl) {
    throw new Error(`${label} URL is required.`);
  }

  const parsedUrl = new URL(proxyUrl);

  if (!["http:", "https:", "socks:", "socks5:"].includes(parsedUrl.protocol)) {
    throw new Error(`${label} must use HTTP or SOCKS: ${proxyUrl}`);
  }
}

function providerIdFromLabel(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const hash = createHash("sha256").update(label).digest("hex").slice(0, 6);

  return `${slug || "provider"}-${hash}`;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

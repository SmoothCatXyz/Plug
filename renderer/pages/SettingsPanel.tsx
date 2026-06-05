import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import type {
  AppConfigSnapshot,
  McpServerConfig,
  McpServerDraft,
  McpServerHealth,
  NetworkConfig,
  ProviderDraft,
  ProviderSummary,
  ProviderTestResult,
  TokenSavingsSnapshot,
  ToolModelSelection,
  UpdateSnapshot
} from "../../shared/types";
import type { ProviderPreset } from "../../shared/provider-presets";
import {
  defaultProviderPreset,
  providerDraftFromPreset,
  providerPresets
} from "../../shared/provider-presets";
import { HUDPanel, NumericText, StatusDot } from "../components/hud";
import type { StatusDotStatus } from "../components/hud";
import "./settings.css";

type SettingsPanelProps = {
  config: AppConfigSnapshot | null;
  mcpServers: McpServerConfig[];
  mcpConfigPath: string | null;
  mcpHealthChecks: McpServerHealth[];
  tokenSavings: TokenSavingsSnapshot | null;
  updateSnapshot: UpdateSnapshot | null;
  bridgeAvailable: boolean;
  onClose: () => void;
  onReloadConfig: () => Promise<AppConfigSnapshot | null>;
  onReloadMcpServers: () => Promise<McpServerConfig[]>;
  onReloadTokenSavings: () => Promise<TokenSavingsSnapshot | null>;
  onUpsertProvider: (draft: ProviderDraft) => Promise<void>;
  onDeleteProvider: (id: string) => Promise<void>;
  onSetChatModel: (selection: ToolModelSelection) => Promise<void>;
  onSetToolModel: (selection: ToolModelSelection) => Promise<void>;
  onSetNetwork: (network: NetworkConfig) => Promise<void>;
  onTestProvider: (providerId: string, modelId?: string) => Promise<ProviderTestResult>;
  onUpsertMcpServer: (draft: McpServerDraft) => Promise<McpServerConfig[]>;
  onDeleteMcpServer: (id: string) => Promise<McpServerConfig[]>;
  onCheckMcpHealth: (id?: string) => Promise<McpServerHealth[]>;
  onCheckForUpdates: () => Promise<UpdateSnapshot>;
  onDownloadUpdate: () => Promise<UpdateSnapshot>;
  onInstallUpdate: () => Promise<void>;
};

const NEW_CUSTOM_PROVIDER_CATALOG_ID = "provider:new";
const SETTINGS_AUTOSAVE_DELAY_MS = 550;
const newProviderDraft: ProviderDraft = {
  label: "Custom Provider",
  type: "openai-compatible",
  baseURL: "",
  models: ["model-id"],
  defaultModel: "model-id",
  proxyMode: "global",
  proxyUrl: "",
  apiKey: ""
};

const newMcpDraft: McpServerDraft = {
  label: "Local MCP",
  transport: "stdio",
  command: "node",
  args: [],
  env: {},
  enabled: true,
  aiWriteLevel: "confirm",
  timeoutMs: 10000
};

type SettingsSectionId =
  | "general"
  | "providers"
  | "agents"
  | "channels"
  | "projects"
  | "chat"
  | "token-savings"
  | "prompts"
  | "memory"
  | "activity-recorder"
  | "computer-use"
  | "appshots"
  | "updates"
  | "mcp-servers"
  | "skills"
  | "plugins"
  | "hooks"
  | "speech";

type SettingsSection = {
  id: SettingsSectionId;
  label: string;
  icon: string;
};

type ProviderCatalogItem = {
  id: string;
  label: string;
  summary: string;
  baseURL: string;
  models: readonly string[];
  defaultModel: string;
  preset: ProviderPreset | null;
  provider: ProviderSummary | null;
};

const settingsSections: SettingsSection[] = [
  { id: "general", label: "General", icon: "GE" },
  { id: "providers", label: "Providers", icon: "PR" },
  { id: "agents", label: "Agents", icon: "AG" },
  { id: "channels", label: "Channels", icon: "CH" },
  { id: "projects", label: "Projects", icon: "PJ" },
  { id: "chat", label: "Chat", icon: "CT" },
  { id: "token-savings", label: "Token Savings", icon: "TS" },
  { id: "prompts", label: "Prompts", icon: "PM" },
  { id: "memory", label: "Memory", icon: "MY" },
  { id: "activity-recorder", label: "Activity Recorder", icon: "AR" },
  { id: "computer-use", label: "Computer Use", icon: "CU" },
  { id: "appshots", label: "Appshots", icon: "AS" },
  { id: "updates", label: "Updates", icon: "UP" },
  { id: "mcp-servers", label: "MCP Servers", icon: "MC" },
  { id: "skills", label: "Skills", icon: "SK" },
  { id: "plugins", label: "Plugins", icon: "PL" },
  { id: "hooks", label: "Hooks", icon: "HK" },
  { id: "speech", label: "Speech", icon: "SP" }
];

export function SettingsPanel({
  config,
  mcpServers,
  mcpConfigPath,
  mcpHealthChecks,
  tokenSavings,
  updateSnapshot,
  bridgeAvailable,
  onClose,
  onReloadConfig,
  onReloadMcpServers,
  onReloadTokenSavings,
  onUpsertProvider,
  onDeleteProvider,
  onSetChatModel,
  onSetToolModel,
  onSetNetwork,
  onTestProvider,
  onUpsertMcpServer,
  onDeleteMcpServer,
  onCheckMcpHealth,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallUpdate
}: SettingsPanelProps): ReactElement {
  const [activeSectionId, setActiveSectionId] = useState<SettingsSectionId>("general");
  const [selectedProviderCatalogId, setSelectedProviderCatalogId] = useState<string>(
    `preset:${defaultProviderPreset.id}`
  );
  const [selectedMcpId, setSelectedMcpId] = useState<string>("");
  const [providerSearch, setProviderSearch] = useState("");
  const activeSection =
    settingsSections.find((section) => section.id === activeSectionId) ?? settingsSections[0];
  const providerCatalog = useMemo(
    () => buildProviderCatalog(config?.providers ?? []),
    [config?.providers]
  );
  const selectedProviderCatalogItem = useMemo(
    () => {
      if (selectedProviderCatalogId === NEW_CUSTOM_PROVIDER_CATALOG_ID) {
        return null;
      }

      return providerCatalog.find((provider) => provider.id === selectedProviderCatalogId) ?? providerCatalog[0] ?? null;
    },
    [providerCatalog, selectedProviderCatalogId]
  );
  const selectedProvider = selectedProviderCatalogItem?.provider ?? null;
  const selectedMcpServer = useMemo(
    () => mcpServers.find((server) => server.id === selectedMcpId) ?? mcpServers[0] ?? null,
    [mcpServers, selectedMcpId]
  );
  const visibleProviders = useMemo(() => {
    const query = providerSearch.trim().toLowerCase();

    if (!query) {
      return providerCatalog;
    }

    return providerCatalog.filter((provider) =>
      [provider.label, provider.defaultModel, provider.baseURL, provider.summary].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [providerCatalog, providerSearch]);
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(newProviderDraft);
  const [mcpDraft, setMcpDraft] = useState<McpServerDraft>(newMcpDraft);
  const [modelsText, setModelsText] = useState(newProviderDraft.models.join(", "));
  const [mcpArgsText, setMcpArgsText] = useState("");
  const [mcpEnvText, setMcpEnvText] = useState("");
  const [networkDraft, setNetworkDraft] = useState<NetworkConfig | null>(null);
  const [chatModelDraft, setChatModelDraft] = useState<ToolModelSelection | null>(null);
  const [toolModelDraft, setToolModelDraft] = useState<ToolModelSelection | null>(null);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [providerDirty, setProviderDirty] = useState(false);
  const [mcpDirty, setMcpDirty] = useState(false);
  const [networkDirty, setNetworkDirty] = useState(false);
  const [chatModelDirty, setChatModelDirty] = useState(false);
  const [toolModelDirty, setToolModelDirty] = useState(false);
  const providerSaveKey = useMemo(
    () => makeSaveKey([selectedProviderCatalogId, providerDraft, modelsText]),
    [modelsText, providerDraft, selectedProviderCatalogId]
  );
  const mcpSaveKey = useMemo(() => makeSaveKey([mcpDraft, mcpArgsText, mcpEnvText]), [
    mcpArgsText,
    mcpDraft,
    mcpEnvText
  ]);
  const networkSaveKey = useMemo(() => makeSaveKey(networkDraft), [networkDraft]);
  const chatModelSaveKey = useMemo(() => makeSaveKey(chatModelDraft), [chatModelDraft]);
  const toolModelSaveKey = useMemo(() => makeSaveKey(toolModelDraft), [toolModelDraft]);
  const providerSaveKeyRef = useRef(providerSaveKey);
  const mcpSaveKeyRef = useRef(mcpSaveKey);
  const networkSaveKeyRef = useRef(networkSaveKey);
  const chatModelSaveKeyRef = useRef(chatModelSaveKey);
  const toolModelSaveKeyRef = useRef(toolModelSaveKey);

  useEffect(() => {
    providerSaveKeyRef.current = providerSaveKey;
  }, [providerSaveKey]);

  useEffect(() => {
    mcpSaveKeyRef.current = mcpSaveKey;
  }, [mcpSaveKey]);

  useEffect(() => {
    networkSaveKeyRef.current = networkSaveKey;
  }, [networkSaveKey]);

  useEffect(() => {
    chatModelSaveKeyRef.current = chatModelSaveKey;
  }, [chatModelSaveKey]);

  useEffect(() => {
    toolModelSaveKeyRef.current = toolModelSaveKey;
  }, [toolModelSaveKey]);

  useEffect(() => {
    if (!bridgeAvailable) {
      return;
    }

    void onReloadConfig();
    void onReloadMcpServers();
    void onReloadTokenSavings();
  }, [bridgeAvailable, onReloadConfig, onReloadMcpServers, onReloadTokenSavings]);

  useEffect(() => {
    if (!config) {
      return;
    }

    setNetworkDraft(config.network);
    setChatModelDraft(config.chatModel);
    setToolModelDraft(config.toolModel);
    setNetworkDirty(false);
    setChatModelDirty(false);
    setToolModelDirty(false);
  }, [config]);

  useEffect(() => {
    if (selectedProviderCatalogId === NEW_CUSTOM_PROVIDER_CATALOG_ID || !providerCatalog.length) {
      return;
    }

    if (!providerCatalog.some((provider) => provider.id === selectedProviderCatalogId)) {
      setSelectedProviderCatalogId(providerCatalog[0]?.id ?? `preset:${defaultProviderPreset.id}`);
    }
  }, [providerCatalog, selectedProviderCatalogId]);

  useEffect(() => {
    if (selectedProviderCatalogId === NEW_CUSTOM_PROVIDER_CATALOG_ID) {
      return;
    }

    if (!selectedProviderCatalogItem) {
      return;
    }

    const draft = toCatalogDraft(selectedProviderCatalogItem);
    setProviderDraft(draft);
    setModelsText(draft.models.join(", "));
    setTestResult(null);
    setLocalError(null);
    setProviderDirty(false);
  }, [selectedProviderCatalogId, selectedProviderCatalogItem]);

  useEffect(() => {
    const server = selectedMcpServer ?? mcpServers[0];
    setSelectedMcpId(server?.id ?? "");

    if (server) {
      setMcpDraft(toMcpDraft(server));
      setMcpArgsText(server.args.join("\n"));
      setMcpEnvText(formatEnv(server.env));
      setMcpDirty(false);
      return;
    }

    setMcpDraft(newMcpDraft);
    setMcpArgsText("");
    setMcpEnvText("");
    setMcpDirty(false);
  }, [mcpServers, selectedMcpServer]);

  const finishBusy = useCallback((label: string) => {
    setBusyLabel((current) => (current === label ? null : current));
  }, []);

  const updateProviderDraft = useCallback((updater: (current: ProviderDraft) => ProviderDraft) => {
    setProviderDirty(true);
    setLocalError(null);
    setTestResult(null);
    setProviderDraft(updater);
  }, []);

  const updateModelsText = useCallback((value: string) => {
    setProviderDirty(true);
    setLocalError(null);
    setTestResult(null);
    setModelsText(value);
  }, []);

  const updateMcpDraft = useCallback((updater: (current: McpServerDraft) => McpServerDraft) => {
    setMcpDirty(true);
    setLocalError(null);
    setMcpDraft(updater);
  }, []);

  const updateMcpArgsText = useCallback((value: string) => {
    setMcpDirty(true);
    setLocalError(null);
    setMcpArgsText(value);
  }, []);

  const updateMcpEnvText = useCallback((value: string) => {
    setMcpDirty(true);
    setLocalError(null);
    setMcpEnvText(value);
  }, []);

  const updateNetworkDraft = useCallback((updater: (current: NetworkConfig | null) => NetworkConfig | null) => {
    setNetworkDirty(true);
    setLocalError(null);
    setNetworkDraft(updater);
  }, []);

  const updateChatModelDraft = useCallback(
    (updater: (current: ToolModelSelection | null) => ToolModelSelection | null) => {
      setChatModelDirty(true);
      setLocalError(null);
      setChatModelDraft(updater);
    },
    []
  );

  const updateToolModelDraft = useCallback(
    (updater: (current: ToolModelSelection | null) => ToolModelSelection | null) => {
      setToolModelDirty(true);
      setLocalError(null);
      setToolModelDraft(updater);
    },
    []
  );

  const saveProviderDraftNow = useCallback(
    async (saveKey = providerSaveKey): Promise<boolean> => {
      const trimmedLabel = providerDraft.label.trim();
      const trimmedBaseURL = providerDraft.baseURL.trim();
      const trimmedModels = modelsText.trim();

      if (!trimmedLabel || !trimmedBaseURL || !trimmedModels) {
        return true;
      }

      let models: string[];
      try {
        models = parseModels(modelsText);
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : "Provider model list is invalid.");
        return false;
      }

      if (providerDraft.proxyMode === "custom" && !providerDraft.proxyUrl.trim()) {
        return true;
      }

      const wasNewCustomProvider = selectedProviderCatalogId === NEW_CUSTOM_PROVIDER_CATALOG_ID;
      const savedDraft: ProviderDraft = {
        ...providerDraft,
        label: trimmedLabel,
        baseURL: trimmedBaseURL,
        models,
        defaultModel: models.includes(providerDraft.defaultModel) ? providerDraft.defaultModel : models[0],
        apiKey: providerDraft.apiKey?.trim() || undefined
      };
      const busy = "Saving provider";

      setBusyLabel(busy);
      setLocalError(null);

      try {
        await onUpsertProvider(savedDraft);
        if (providerSaveKeyRef.current === saveKey) {
          setProviderDirty(false);
          if (savedDraft.apiKey) {
            setProviderDraft((current) => ({ ...current, apiKey: "" }));
          }
        }
        setTestResult(null);

        if (wasNewCustomProvider) {
          const nextConfig = await onReloadConfig();
          const savedProvider = nextConfig?.providers.find(
            (provider) =>
              provider.label === trimmedLabel &&
              normalizeProviderBaseURL(provider.baseURL) === normalizeProviderBaseURL(trimmedBaseURL)
          );
          if (savedProvider && providerSaveKeyRef.current === saveKey) {
            setSelectedProviderCatalogId(`provider:${savedProvider.id}`);
          }
        }
        return true;
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : "Provider save failed.");
        return false;
      } finally {
        finishBusy(busy);
      }
    },
    [
      finishBusy,
      modelsText,
      onReloadConfig,
      onUpsertProvider,
      providerDraft,
      providerSaveKey,
      selectedProviderCatalogId
    ]
  );

  useEffect(() => {
    if (!providerDirty || !bridgeAvailable) {
      return;
    }

    const saveKey = providerSaveKey;
    const timer = window.setTimeout(() => {
      void saveProviderDraftNow(saveKey);
    }, SETTINGS_AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [bridgeAvailable, providerDirty, providerSaveKey, saveProviderDraftNow]);

  async function handleDeleteProvider(): Promise<void> {
    if (!selectedProvider) {
      return;
    }

    setBusyLabel("Deleting provider");
    setLocalError(null);

    try {
      await onDeleteProvider(selectedProvider.id);
      setTestResult(null);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Provider delete failed.");
    } finally {
      setBusyLabel(null);
    }
  }

  const saveChatModelNow = useCallback(
    async (saveKey = chatModelSaveKey): Promise<boolean> => {
      if (!chatModelDraft) {
        return true;
      }

      const busy = "Saving chat model";
      setBusyLabel(busy);
      setLocalError(null);

      try {
        await onSetChatModel(chatModelDraft);
        if (chatModelSaveKeyRef.current === saveKey) {
          setChatModelDirty(false);
        }
        return true;
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : "Chat model save failed.");
        return false;
      } finally {
        finishBusy(busy);
      }
    },
    [chatModelDraft, chatModelSaveKey, finishBusy, onSetChatModel]
  );

  useEffect(() => {
    if (!chatModelDirty || !chatModelDraft || !bridgeAvailable) {
      return;
    }

    const saveKey = chatModelSaveKey;
    const timer = window.setTimeout(() => {
      void saveChatModelNow(saveKey);
    }, SETTINGS_AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [bridgeAvailable, chatModelDirty, chatModelDraft, chatModelSaveKey, saveChatModelNow]);

  const saveToolModelNow = useCallback(
    async (saveKey = toolModelSaveKey): Promise<boolean> => {
      if (!toolModelDraft) {
        return true;
      }

      const busy = "Saving tool model";
      setBusyLabel(busy);
      setLocalError(null);

      try {
        await onSetToolModel(toolModelDraft);
        if (toolModelSaveKeyRef.current === saveKey) {
          setToolModelDirty(false);
        }
        return true;
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : "Tool model save failed.");
        return false;
      } finally {
        finishBusy(busy);
      }
    },
    [finishBusy, onSetToolModel, toolModelDraft, toolModelSaveKey]
  );

  useEffect(() => {
    if (!toolModelDirty || !toolModelDraft || !bridgeAvailable) {
      return;
    }

    const saveKey = toolModelSaveKey;
    const timer = window.setTimeout(() => {
      void saveToolModelNow(saveKey);
    }, SETTINGS_AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [bridgeAvailable, saveToolModelNow, toolModelDirty, toolModelDraft, toolModelSaveKey]);

  const saveNetworkNow = useCallback(
    async (saveKey = networkSaveKey): Promise<boolean> => {
      if (!networkDraft) {
        return true;
      }

      const busy = "Saving network";
      setBusyLabel(busy);
      setLocalError(null);

      try {
        await onSetNetwork(networkDraft);
        if (networkSaveKeyRef.current === saveKey) {
          setNetworkDirty(false);
        }
        return true;
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : "Network save failed.");
        return false;
      } finally {
        finishBusy(busy);
      }
    },
    [finishBusy, networkDraft, networkSaveKey, onSetNetwork]
  );

  useEffect(() => {
    if (!networkDirty || !networkDraft || !bridgeAvailable) {
      return;
    }

    const saveKey = networkSaveKey;
    const timer = window.setTimeout(() => {
      void saveNetworkNow(saveKey);
    }, SETTINGS_AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [bridgeAvailable, networkDirty, networkDraft, networkSaveKey, saveNetworkNow]);

  async function handleTestProvider(): Promise<void> {
    const providerId = selectedProvider?.id;
    const modelId = selectedProvider?.defaultModel;

    if (!providerId) {
      return;
    }

    setBusyLabel("Testing provider");
    setLocalError(null);
    setTestResult(null);

    try {
      setTestResult(await onTestProvider(providerId, modelId));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Provider test failed.");
    } finally {
      setBusyLabel(null);
    }
  }

  const saveMcpServerNow = useCallback(
    async (saveKey = mcpSaveKey): Promise<boolean> => {
      const trimmedLabel = mcpDraft.label.trim();
      const trimmedCommand = mcpDraft.command.trim();

      if (!trimmedLabel || !trimmedCommand) {
        return true;
      }

      let args: string[];
      let env: Record<string, string>;
      try {
        args = parseLines(mcpArgsText);
        env = parseEnv(mcpEnvText);
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : "MCP server input is invalid.");
        return false;
      }

      const busy = "Saving MCP";
      const savedDraft: McpServerDraft = {
        ...mcpDraft,
        label: trimmedLabel,
        command: trimmedCommand,
        args,
        env
      };

      setBusyLabel(busy);
      setLocalError(null);

      try {
        const servers = await onUpsertMcpServer(savedDraft);
        if (mcpSaveKeyRef.current === saveKey) {
          setMcpDirty(false);
        }

        const savedServer = savedDraft.id
          ? servers.find((server) => server.id === savedDraft.id)
          : servers.find((server) => server.label === savedDraft.label) ?? servers[0];
        if (savedServer && mcpSaveKeyRef.current === saveKey) {
          setSelectedMcpId(savedServer.id);
        }
        return true;
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : "MCP server save failed.");
        return false;
      } finally {
        finishBusy(busy);
      }
    },
    [finishBusy, mcpArgsText, mcpDraft, mcpEnvText, mcpSaveKey, onUpsertMcpServer]
  );

  useEffect(() => {
    if (!mcpDirty || !bridgeAvailable) {
      return;
    }

    const saveKey = mcpSaveKey;
    const timer = window.setTimeout(() => {
      void saveMcpServerNow(saveKey);
    }, SETTINGS_AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [bridgeAvailable, mcpDirty, mcpSaveKey, saveMcpServerNow]);

  async function handleDeleteMcpServer(): Promise<void> {
    if (!selectedMcpServer) {
      return;
    }

    setBusyLabel("Deleting MCP");
    setLocalError(null);

    try {
      const servers = await onDeleteMcpServer(selectedMcpServer.id);
      setSelectedMcpId(servers[0]?.id ?? "");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "MCP server delete failed.");
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleCheckMcpHealth(id?: string): Promise<void> {
    setBusyLabel("Checking MCP");
    setLocalError(null);

    try {
      await onCheckMcpHealth(id);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "MCP health check failed.");
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleCheckForUpdates(): Promise<void> {
    setBusyLabel("Checking updates");
    setLocalError(null);

    try {
      await onCheckForUpdates();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Update check failed.");
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleDownloadUpdate(): Promise<void> {
    setBusyLabel("Downloading update");
    setLocalError(null);

    try {
      await onDownloadUpdate();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Update download failed.");
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleInstallUpdate(): Promise<void> {
    setBusyLabel("Installing update");
    setLocalError(null);

    try {
      await onInstallUpdate();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Update install failed.");
    } finally {
      setBusyLabel(null);
    }
  }

  function renderGeneralSection(): ReactElement {
    return (
      <div className="settings-section-stack">
        <section className="settings-card">
          <div className="settings-section-head settings-section-head--large">
            <div>
              <span className="hud-label">Model Routing</span>
              <h3>Chat / Tool Model</h3>
            </div>
            <StatusDot status="pending" label="global" />
          </div>

          <div className="settings-route-list settings-route-list--two">
            <ModelRouteEditor
              label="Chat Model"
              config={config}
              selection={chatModelDraft}
              onProviderChange={(providerId) => updateChatModelDraft(() => modelSelectionForProvider(config, providerId))}
              onModelChange={(modelId) =>
                updateChatModelDraft((current) => (current ? { ...current, modelId } : current))
              }
            />
            <ModelRouteEditor
              label="Tool Model"
              config={config}
              selection={toolModelDraft}
              onProviderChange={(providerId) => updateToolModelDraft(() => modelSelectionForProvider(config, providerId))}
              onModelChange={(modelId) =>
                updateToolModelDraft((current) => (current ? { ...current, modelId } : current))
              }
            />
          </div>
        </section>

        {networkDraft ? (
          <section className="settings-card">
            <div className="settings-section-head settings-section-head--large">
              <div>
                <span className="hud-label">Network</span>
                <h3>Connection</h3>
              </div>
              <NumericText muted>{`${networkDraft.maxRetries} retry`}</NumericText>
            </div>

            <div className="settings-grid settings-grid--three">
              <label className="hud-field">
                <span>Proxy</span>
                <select
                  value={networkDraft.proxyMode}
                  onChange={(event) =>
                    updateNetworkDraft((current) =>
                      current ? { ...current, proxyMode: event.target.value as NetworkConfig["proxyMode"] } : current
                    )
                  }
                >
                  <option value="off">Off</option>
                  <option value="http">HTTP</option>
                  <option value="socks5">SOCKS5</option>
                </select>
              </label>
              <label className="hud-field hud-field--wide-2">
                <span>Proxy URL</span>
                <input
                  value={networkDraft.proxyUrl}
                  disabled={networkDraft.proxyMode === "off"}
                  onChange={(event) =>
                    updateNetworkDraft((current) => (current ? { ...current, proxyUrl: event.target.value } : current))
                  }
                />
              </label>
              <NumberField label="Timeout" value={networkDraft.timeoutMs} onChange={(value) => updateNetworkDraft((current) => current ? { ...current, timeoutMs: value } : current)} />
              <NumberField label="Long Timeout" value={networkDraft.longTimeoutMs} onChange={(value) => updateNetworkDraft((current) => current ? { ...current, longTimeoutMs: value } : current)} />
              <NumberField label="Retries" value={networkDraft.maxRetries} onChange={(value) => updateNetworkDraft((current) => current ? { ...current, maxRetries: value } : current)} />
              <NumberField label="Backoff" value={networkDraft.retryBaseDelayMs} onChange={(value) => updateNetworkDraft((current) => current ? { ...current, retryBaseDelayMs: value } : current)} />
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  function renderProviderForm(): ReactElement {
    const isNewCustomProvider = selectedProviderCatalogId === NEW_CUSTOM_PROVIDER_CATALOG_ID;
    const status = providerCatalogStatus(selectedProviderCatalogItem, isNewCustomProvider);
    const modelOptions = modelOptionsFromText(modelsText, providerDraft.defaultModel);
    const title = isNewCustomProvider ? providerDraft.label || "Custom Provider" : selectedProviderCatalogItem?.label ?? "Provider";
    const summary = isNewCustomProvider
      ? "Custom OpenAI-compatible endpoint."
      : selectedProviderCatalogItem?.summary ?? "OpenAI-compatible endpoint.";

    return (
      <section className="settings-card settings-provider-detail-card">
        <div className="settings-provider-hero">
          <div className="settings-provider-identity">
            <div className="settings-provider-logo" aria-hidden="true">
              {providerInitials(title)}
            </div>
            <div>
              <div className="settings-provider-title-row">
                <h3>{title}</h3>
                <span className={`settings-provider-badge settings-provider-badge--${status.tone}`}>
                  {status.label}
                </span>
              </div>
              <p>{summary}</p>
            </div>
          </div>
        </div>

        <div className="settings-provider-facts">
          <div>
            <span>Base URL</span>
            <strong>{providerDraft.baseURL || "Not set"}</strong>
          </div>
          <div>
            <span>Default Model</span>
            <strong>{providerDraft.defaultModel || modelOptions[0] || "Not set"}</strong>
          </div>
          <div>
            <span>Models</span>
            <strong>{modelOptions.length}</strong>
          </div>
        </div>

        <div className="settings-provider-setup">
          <label className="hud-field">
            <span>API Key</span>
            <input
              type="password"
              value={providerDraft.apiKey ?? ""}
              placeholder={selectedProvider?.hasApiKey ? "configured" : "Enter API key"}
              onChange={(event) => updateProviderDraft((current) => ({ ...current, apiKey: event.target.value }))}
            />
          </label>
          <label className="hud-field">
            <span>Default Model</span>
            <select
              value={providerDraft.defaultModel}
              onChange={(event) => updateProviderDraft((current) => ({ ...current, defaultModel: event.target.value }))}
            >
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          <label className="hud-field">
            <span>Provider Proxy</span>
            <select
              value={providerDraft.proxyMode}
              onChange={(event) =>
                updateProviderDraft((current) => ({
                  ...current,
                  proxyMode: event.target.value as ProviderDraft["proxyMode"]
                }))
              }
            >
              <option value="global">Global</option>
              <option value="off">Off</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="hud-field">
            <span>Proxy URL</span>
            <input
              value={providerDraft.proxyUrl}
              disabled={providerDraft.proxyMode !== "custom"}
              onChange={(event) => updateProviderDraft((current) => ({ ...current, proxyUrl: event.target.value }))}
            />
          </label>
        </div>

        <details className="settings-provider-advanced">
          <summary>Endpoint settings</summary>
          <div className="settings-grid">
            <label className="hud-field">
              <span>Label</span>
              <input
                value={providerDraft.label}
                onChange={(event) => updateProviderDraft((current) => ({ ...current, label: event.target.value }))}
              />
            </label>
            <label className="hud-field">
              <span>Base URL</span>
              <input
                value={providerDraft.baseURL}
                onChange={(event) => updateProviderDraft((current) => ({ ...current, baseURL: event.target.value }))}
              />
            </label>
            <label className="hud-field hud-field--wide">
              <span>Models</span>
              <input value={modelsText} onChange={(event) => updateModelsText(event.target.value)} />
            </label>
          </div>
        </details>

        <div className="settings-actions">
          <button
            className="hud-button"
            type="button"
            disabled={!selectedProvider || !bridgeAvailable || Boolean(busyLabel)}
            onClick={() => void handleDeleteProvider()}
          >
            Disable
          </button>
          <button
            className="hud-button"
            type="button"
            disabled={!selectedProvider || !bridgeAvailable || Boolean(busyLabel)}
            onClick={() => void handleTestProvider()}
          >
            Test
          </button>
        </div>
      </section>
    );
  }

  function renderProviderTest(): ReactElement {
    return (
      <section className="settings-card">
        <div className="settings-section-head">
          <span className="hud-label">Provider Test</span>
          <StatusDot status={busyLabel ? "running" : testResult?.ok ? "complete" : testResult ? "error" : "pending"} label={busyLabel ?? "idle"} />
        </div>

        {testResult ? (
          <div className="settings-test-result">
            <strong>{testResult.ok ? "PASS" : "FAIL"}</strong>
            <p>{testResult.message}</p>
            <NumericText muted>{`${testResult.durationMs}ms`}</NumericText>
            <ol>
              {testResult.attempts.map((attempt) => (
                <li key={attempt.attempt}>
                  <span>{attempt.status}</span>
                  <em>{attempt.message}</em>
                  <NumericText muted>{`${attempt.durationMs}ms`}</NumericText>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="settings-test-empty">NO TEST RUN</div>
        )}
      </section>
    );
  }

  function renderProvidersSection(): ReactElement {
    return (
      <div className="settings-provider-catalog-shell">
        <div className="settings-provider-catalog-toolbar">
          <div className="settings-provider-search">
            <label className="hud-field">
              <span>Search</span>
              <input
                value={providerSearch}
                placeholder="Search providers..."
                onChange={(event) => setProviderSearch(event.target.value)}
              />
            </label>
          </div>
          <button
            className="hud-button"
            type="button"
            disabled={!bridgeAvailable || Boolean(busyLabel)}
            onClick={() => {
              setSelectedProviderCatalogId(NEW_CUSTOM_PROVIDER_CATALOG_ID);
              setProviderDraft(newProviderDraft);
              setModelsText(newProviderDraft.models.join(", "));
              setProviderDirty(false);
              setProviderSearch("");
              setTestResult(null);
              setLocalError(null);
            }}
          >
            Add Custom Provider
          </button>
        </div>

        <div className="settings-providers-page">
          <aside className="settings-provider-browser" aria-label="Providers">
            <div className="settings-provider-list">
              {visibleProviders.map((provider) => (
                <ProviderButton
                  key={provider.id}
                  provider={provider}
                  active={provider.id === selectedProviderCatalogItem?.id}
                  onSelect={() => setSelectedProviderCatalogId(provider.id)}
                />
              ))}
              {!visibleProviders.length ? <div className="settings-empty-row">NO PROVIDERS</div> : null}
            </div>
          </aside>

          <section className="settings-provider-detail">
            {renderProviderForm()}
            {renderProviderTest()}
          </section>
        </div>
      </div>
    );
  }

  function renderMcpServersSection(): ReactElement {
    return (
      <div className="settings-mcp-page">
        <section className="settings-card">
          <div className="settings-section-head settings-section-head--large">
            <div>
              <span className="hud-label">MCP Servers</span>
              <h3>{mcpDraft.label || "Local MCP"}</h3>
            </div>
            <button
              className="hud-link-button"
              type="button"
              onClick={() => {
                setSelectedMcpId("");
                setMcpDraft(newMcpDraft);
                setMcpArgsText("");
                setMcpEnvText("");
                setMcpDirty(false);
              }}
            >
              New
            </button>
          </div>

          <div className="settings-mcp-list">
            {mcpServers.length ? (
              mcpServers.map((server) => (
                <button
                  className={["settings-mcp-row", server.id === selectedMcpServer?.id ? "settings-mcp-row--active" : ""].filter(Boolean).join(" ")}
                  key={server.id}
                  type="button"
                  onClick={() => setSelectedMcpId(server.id)}
                >
                  <span>⬢</span>
                  <strong>{server.label}</strong>
                  <em>{server.enabled ? `${server.transport} · ${server.aiWriteLevel}` : "disabled"}</em>
                </button>
              ))
            ) : (
              <div className="settings-mcp-empty">NO MCP SERVERS</div>
            )}
          </div>

          <div className="settings-grid settings-grid--three">
            <label className="hud-field">
              <span>Label</span>
              <input
                value={mcpDraft.label}
                onChange={(event) => updateMcpDraft((current) => ({ ...current, label: event.target.value }))}
              />
            </label>
            <label className="hud-field">
              <span>Enabled</span>
              <select
                value={mcpDraft.enabled ? "yes" : "no"}
                onChange={(event) => updateMcpDraft((current) => ({ ...current, enabled: event.target.value === "yes" }))}
              >
                <option value="yes">Enabled</option>
                <option value="no">Disabled</option>
              </select>
            </label>
            <label className="hud-field">
              <span>AI Write</span>
              <select
                value={mcpDraft.aiWriteLevel}
                onChange={(event) =>
                  updateMcpDraft((current) => ({ ...current, aiWriteLevel: event.target.value as McpServerDraft["aiWriteLevel"] }))
                }
              >
                <option value="read">Read</option>
                <option value="auto">Auto</option>
                <option value="confirm">Confirm</option>
              </select>
            </label>
            <label className="hud-field hud-field--wide-2">
              <span>Command</span>
              <input
                value={mcpDraft.command}
                onChange={(event) => updateMcpDraft((current) => ({ ...current, command: event.target.value }))}
              />
            </label>
            <NumberField label="Timeout" value={mcpDraft.timeoutMs} onChange={(value) => updateMcpDraft((current) => ({ ...current, timeoutMs: value }))} />
            <label className="hud-field hud-field--wide">
              <span>Args</span>
              <textarea
                value={mcpArgsText}
                placeholder="/path/to/server.js"
                onChange={(event) => updateMcpArgsText(event.target.value)}
              />
            </label>
            <label className="hud-field hud-field--wide">
              <span>Env</span>
              <textarea
                value={mcpEnvText}
                placeholder="API_KEY=value"
                onChange={(event) => updateMcpEnvText(event.target.value)}
              />
            </label>
          </div>

          <div className="settings-actions">
            <button
              className="hud-button"
              type="button"
              disabled={!selectedMcpServer || !bridgeAvailable || Boolean(busyLabel)}
              onClick={() => void handleCheckMcpHealth(selectedMcpServer?.id)}
            >
              Health
            </button>
            <button
              className="hud-button"
              type="button"
              disabled={!selectedMcpServer || !bridgeAvailable || Boolean(busyLabel)}
              onClick={() => void handleDeleteMcpServer()}
            >
              Delete
            </button>
          </div>
        </section>

        <section className="settings-card settings-mcp-health">
          <div className="settings-section-head">
            <span className="hud-label">MCP Health</span>
            <button className="hud-link-button" type="button" disabled={!bridgeAvailable || Boolean(busyLabel)} onClick={() => void handleCheckMcpHealth()}>
              Check All
            </button>
          </div>
          {mcpHealthChecks.length ? (
            <ol>
              {mcpHealthChecks.map((check) => (
                <li key={check.serverId}>
                  <StatusDot status={check.ok ? "complete" : check.enabled ? "error" : "waiting"} label={check.ok ? "ok" : "blocked"} />
                  <strong>{check.label}</strong>
                  <em>{`${check.toolCount} tools`}</em>
                  <p>{check.message}</p>
                </li>
              ))}
            </ol>
          ) : (
            <div className="settings-test-empty">NO MCP CHECK</div>
          )}
        </section>
      </div>
    );
  }

  function renderTokenSavingsSection(): ReactElement {
    const ptc = tokenSavings?.ptc;
    const rtk = tokenSavings?.rtk;
    const hasRtkData = Boolean(rtk?.available && rtk.summary.totalCommands > 0);
    const rtkAvailable = Boolean(rtk?.available);

    return (
      <div className="settings-token-savings-page">
        <section className="settings-card settings-token-card settings-token-card--ptc">
          <div className="settings-token-card__head">
            <div>
              <span className="settings-token-kicker">&lt;/&gt;</span>
              <h3>Programmatic Tool Calling</h3>
              <p>Tokens kept out of the model's context by run_script (tool results processed in the sandbox)</p>
            </div>
            <button
              className="hud-link-button"
              type="button"
              disabled={!bridgeAvailable || Boolean(busyLabel)}
              onClick={() => void onReloadTokenSavings()}
            >
              Refresh
            </button>
          </div>

          <div className="settings-token-metrics">
            <TokenSavingsMetric label="Tokens Saved" value={ptc?.totalSavedTokens ?? 0} accent="green" />
            <TokenSavingsMetric label="Scripts Run" value={ptc?.totalRuns ?? 0} accent="cyan" />
            <TokenSavingsMetric label="Tool Calls" value={ptc?.totalToolCalls ?? 0} accent="blue" />
            <TokenSavingsMetric label="Results Processed" value={ptc?.totalResultTokens ?? 0} accent="purple" />
          </div>
        </section>

        {hasRtkData && rtk ? (
          <section className="settings-card settings-token-card">
            <div className="settings-token-card__head">
              <div>
                <span className="settings-token-kicker">RTK</span>
                <h3>RTK Command Compression</h3>
                <p>Tokens saved by the RTK binary proxying supported shell commands before output reaches model context.</p>
              </div>
              <StatusDot status="complete" label={`${Math.round(rtk.summary.avgSavingsPct)}% avg`} />
            </div>

            <div className="settings-token-metrics settings-token-metrics--six">
              <TokenSavingsMetric label="Tokens Saved" value={rtk.summary.totalSavedTokens} accent="green" />
              <TokenSavingsMetric label="Commands" value={rtk.summary.totalCommands} accent="cyan" />
              <TokenSavingsMetric label="Avg Savings" value={`${Math.round(rtk.summary.avgSavingsPct)}%`} accent="blue" />
              <TokenSavingsMetric label="Input Tokens" value={rtk.summary.totalInputTokens} accent="purple" />
              <TokenSavingsMetric label="Output Tokens" value={rtk.summary.totalOutputTokens} accent="cyan" />
              <TokenSavingsMetric label="Avg Time" value={`${Math.round(rtk.summary.avgTimeMs)}ms`} accent="blue" />
            </div>
          </section>
        ) : (
          <section className="settings-card settings-token-empty">
            <div className="settings-token-empty__mark">TS</div>
            <h3>{rtkAvailable ? "No RTK savings yet" : "RTK binary not found"}</h3>
            <p>
              {rtkAvailable
                ? "RTK is active and will record savings when Plug rewrites supported shell commands through the RTK proxy. run_script savings are shown above."
                : "Install the rtk binary or set PLUG_RTK_PATH so Plug can use the same command rewrite path as Hermes and Alma."}
            </p>
          </section>
        )}
      </div>
    );
  }

  function renderUpdatesSection(): ReactElement {
    const update = updateSnapshot;
    const progress = update?.progress;
    const statusLabel = update ? updateStatusLabel(update) : "Unavailable";
    const statusTone = update ? updateStatusDot(update) : "waiting";

    return (
      <div className="settings-section-stack">
        <section className="settings-card settings-update-card">
          <div className="settings-section-head settings-section-head--large">
            <div>
              <span className="hud-label">GitHub Releases</span>
              <h3>Application Update</h3>
            </div>
            <StatusDot status={statusTone} label={statusLabel} />
          </div>

          <div className="settings-provider-facts settings-update-facts">
            <div>
              <span>Current Version</span>
              <strong>{update?.currentVersion ?? "Unknown"}</strong>
            </div>
            <div>
              <span>Latest Version</span>
              <strong>{update?.updateVersion ?? "Not checked"}</strong>
            </div>
            <div>
              <span>Release Date</span>
              <strong>{formatUpdateDate(update?.releaseDate)}</strong>
            </div>
          </div>

          {progress ? (
            <div className="settings-update-progress" aria-label="Update download progress">
              <div>
                <strong>{`${Math.round(progress.percent)}%`}</strong>
                <span>{formatBytes(progress.transferred)} / {formatBytes(progress.total)}</span>
              </div>
              <div className="settings-update-progress__track">
                <span style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }} />
              </div>
            </div>
          ) : null}

          {update?.releaseNotes ? (
            <div className="settings-update-notes">
              <span className="hud-label">{update.releaseName ?? "Release Notes"}</span>
              <p>{update.releaseNotes}</p>
            </div>
          ) : null}

          {update?.error ? <p className="settings-error">{update.error}</p> : null}

          <div className="settings-actions settings-actions--split">
            <button
              className="hud-button"
              type="button"
              disabled={!bridgeAvailable || Boolean(busyLabel) || !update?.canCheck}
              onClick={() => void handleCheckForUpdates()}
            >
              Check
            </button>
            <button
              className="hud-button hud-button--primary"
              type="button"
              disabled={!bridgeAvailable || Boolean(busyLabel) || !update?.canDownload}
              onClick={() => void handleDownloadUpdate()}
            >
              Download
            </button>
            <button
              className="hud-button hud-button--primary"
              type="button"
              disabled={!bridgeAvailable || Boolean(busyLabel) || !update?.canInstall}
              onClick={() => void handleInstallUpdate()}
            >
              Install and Restart
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderPlaceholderSection(section: SettingsSection): ReactElement {
    return (
      <section className="settings-card settings-placeholder-card">
        <div className="settings-placeholder-mark">{section.icon}</div>
        <h3>{section.label}</h3>
        <p>READY</p>
      </section>
    );
  }

  function renderActiveSection(): ReactElement {
    if (activeSectionId === "general") {
      return renderGeneralSection();
    }

    if (activeSectionId === "providers") {
      return renderProvidersSection();
    }

    if (activeSectionId === "mcp-servers") {
      return renderMcpServersSection();
    }

    if (activeSectionId === "token-savings") {
      return renderTokenSavingsSection();
    }

    if (activeSectionId === "updates") {
      return renderUpdatesSection();
    }

    return renderPlaceholderSection(activeSection);
  }

  const handleCloseSettings = useCallback(() => {
    if (!bridgeAvailable) {
      onClose();
      return;
    }

    const pendingSaves: Promise<boolean>[] = [];

    if (providerDirty) {
      pendingSaves.push(saveProviderDraftNow(providerSaveKey));
    }
    if (mcpDirty) {
      pendingSaves.push(saveMcpServerNow(mcpSaveKey));
    }
    if (networkDirty) {
      pendingSaves.push(saveNetworkNow(networkSaveKey));
    }
    if (chatModelDirty) {
      pendingSaves.push(saveChatModelNow(chatModelSaveKey));
    }
    if (toolModelDirty) {
      pendingSaves.push(saveToolModelNow(toolModelSaveKey));
    }

    if (!pendingSaves.length) {
      onClose();
      return;
    }

    void Promise.all(pendingSaves).then((results) => {
      if (results.every(Boolean)) {
        onClose();
      }
    });
  }, [
    bridgeAvailable,
    chatModelDirty,
    chatModelSaveKey,
    mcpDirty,
    mcpSaveKey,
    networkDirty,
    networkSaveKey,
    onClose,
    providerDirty,
    providerSaveKey,
    saveChatModelNow,
    saveMcpServerNow,
    saveNetworkNow,
    saveProviderDraftNow,
    saveToolModelNow,
    toolModelDirty,
    toolModelSaveKey
  ]);

  const hasPendingChanges = providerDirty || mcpDirty || networkDirty || chatModelDirty || toolModelDirty;
  const footerStatus = busyLabel ?? (hasPendingChanges ? "Pending changes" : "All changes saved");

  return (
    <div className="settings-window-root" role="application" aria-label="Settings">
      <HUDPanel className="settings-panel settings-panel--workspace" label="Plug settings" active>
        <aside className="settings-sidebar" aria-label="Settings sections">
          <div className="settings-window-controls" aria-hidden="true" />

          <nav className="settings-nav">
            {settingsSections.map((section) => (
              <button
                key={section.id}
                className={["settings-nav-item", activeSectionId === section.id ? "settings-nav-item--active" : ""].filter(Boolean).join(" ")}
                type="button"
                onClick={() => setActiveSectionId(section.id)}
              >
                <span>{section.icon}</span>
                <strong>{section.label}</strong>
              </button>
            ))}
          </nav>
        </aside>

        <section className="settings-main" aria-label={`${activeSection.label} settings`}>
          <header className="settings-main__header">
            <div className="settings-main__title">
              <span>{activeSection.icon}</span>
              <h2>{activeSection.label}</h2>
            </div>
          </header>

          <div className="settings-main__content">
            {renderActiveSection()}
          </div>

          <footer className="settings-footer">
            <div>
              {localError ? <p className="settings-error">{localError}</p> : null}
              <p className="settings-save-status">{footerStatus}</p>
              <p className="settings-config-path">{`${config?.configPath ?? "~/.plug/config.json"} · ${mcpConfigPath ?? "~/.plug/mcp.json"}`}</p>
            </div>
            <button className="hud-button" type="button" onClick={handleCloseSettings}>
              Close
            </button>
          </footer>
        </section>
      </HUDPanel>
    </div>
  );
}

type ProviderButtonProps = {
  provider: ProviderCatalogItem;
  active: boolean;
  onSelect: () => void;
};

function ProviderButton({ provider, active, onSelect }: ProviderButtonProps): ReactElement {
  const status = providerCatalogStatus(provider, false);

  return (
    <button
      className={["settings-provider-button", active ? "settings-provider-button--active" : ""].filter(Boolean).join(" ")}
      type="button"
      onClick={onSelect}
    >
      <span className="settings-provider-button__mark">{providerInitials(provider.label)}</span>
      <strong>{provider.label}</strong>
      <em>{provider.defaultModel}</em>
      <StatusDot status={status.dotStatus} label={status.label} />
    </button>
  );
}

function makeSaveKey(value: unknown): string {
  return JSON.stringify(value);
}

function updateStatusLabel(update: UpdateSnapshot): string {
  if (update.status === "available") {
    return "Available";
  }

  if (update.status === "not-available") {
    return "Current";
  }

  if (update.status === "downloading") {
    return "Downloading";
  }

  if (update.status === "downloaded") {
    return "Ready";
  }

  if (update.status === "checking") {
    return "Checking";
  }

  if (update.status === "error") {
    return "Blocked";
  }

  return "Idle";
}

function updateStatusDot(update: UpdateSnapshot): StatusDotStatus {
  if (update.status === "checking" || update.status === "downloading") {
    return "running";
  }

  if (update.status === "downloaded" || update.status === "not-available") {
    return "complete";
  }

  if (update.status === "error") {
    return "error";
  }

  if (update.status === "available") {
    return "waiting";
  }

  return "pending";
}

function formatUpdateDate(value?: string | null): string {
  if (!value) {
    return "Not checked";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let unitIndex = 0;

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${amount >= 10 || unitIndex === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[unitIndex]}`;
}

function buildProviderCatalog(providers: ProviderSummary[]): ProviderCatalogItem[] {
  const matchedProviderIds = new Set<string>();

  const presetItems = providerPresets.map((preset) => {
    const provider = findConfiguredProviderForPreset(providers, preset, matchedProviderIds);

    if (provider) {
      matchedProviderIds.add(provider.id);
    }

    return {
      id: `preset:${preset.id}`,
      label: preset.label,
      summary: preset.summary,
      baseURL: preset.baseURL,
      models: preset.models,
      defaultModel: preset.defaultModel,
      preset,
      provider: provider ?? null
    };
  });

  const customItems = providers
    .filter((provider) => !matchedProviderIds.has(provider.id))
    .map((provider) => ({
      id: `provider:${provider.id}`,
      label: provider.label,
      summary: "Custom OpenAI-compatible endpoint.",
      baseURL: provider.baseURL,
      models: provider.models,
      defaultModel: provider.defaultModel,
      preset: null,
      provider
    }));

  return [...presetItems, ...customItems];
}

function findConfiguredProviderForPreset(
  providers: ProviderSummary[],
  preset: ProviderPreset,
  matchedProviderIds: Set<string>
): ProviderSummary | undefined {
  const presetBaseURL = normalizeProviderBaseURL(preset.baseURL);

  return providers.find((provider) => {
    if (matchedProviderIds.has(provider.id)) {
      return false;
    }

    const sameBaseURL = normalizeProviderBaseURL(provider.baseURL) === presetBaseURL;
    const sameLabel = provider.label.toLowerCase() === preset.label.toLowerCase();
    return sameBaseURL || sameLabel;
  });
}

function toCatalogDraft(item: ProviderCatalogItem): ProviderDraft {
  if (item.provider) {
    return toDraft(item.provider);
  }

  if (item.preset) {
    return providerDraftFromPreset(item.preset);
  }

  return {
    label: item.label,
    type: "openai-compatible",
    baseURL: item.baseURL,
    models: [...item.models],
    defaultModel: item.defaultModel,
    proxyMode: "global",
    proxyUrl: "",
    apiKey: ""
  };
}

function providerCatalogStatus(
  item: ProviderCatalogItem | null,
  isNewCustomProvider: boolean
): { label: string; tone: "active" | "warning" | "inactive"; dotStatus: "complete" | "waiting" | "pending" } {
  if (isNewCustomProvider || !item) {
    return { label: "Draft", tone: "inactive", dotStatus: "pending" };
  }

  if (!item.provider) {
    return { label: "Inactive", tone: "inactive", dotStatus: "pending" };
  }

  if (!item.provider.hasApiKey) {
    return { label: "Needs API Key", tone: "warning", dotStatus: "waiting" };
  }

  return { label: "Active", tone: "active", dotStatus: "complete" };
}

function providerInitials(label: string): string {
  const words = label
    .replace(/[^\dA-Za-z\s.]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return "AI";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function modelOptionsFromText(modelsText: string, defaultModel: string): string[] {
  const models = modelsText
    .split(/[\n,]+/)
    .map((model) => model.trim())
    .filter(Boolean);

  if (defaultModel && !models.includes(defaultModel)) {
    models.unshift(defaultModel);
  }

  return [...new Set(models)];
}

type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

function NumberField({ label, value, onChange }: NumberFieldProps): ReactElement {
  return (
    <label className="hud-field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

type TokenSavingsMetricProps = {
  label: string;
  value: number | string;
  accent: "green" | "cyan" | "blue" | "purple";
};

function TokenSavingsMetric({ label, value, accent }: TokenSavingsMetricProps): ReactElement {
  return (
    <div className={`settings-token-metric settings-token-metric--${accent}`}>
      <span>{label}</span>
      <strong>{typeof value === "number" ? formatCompactNumber(value) : value}</strong>
    </div>
  );
}

type ModelRouteEditorProps = {
  label: string;
  config: AppConfigSnapshot | null;
  selection: ToolModelSelection | null;
  onProviderChange: (providerId: string) => void;
  onModelChange: (modelId: string) => void;
};

function ModelRouteEditor({
  label,
  config,
  selection,
  onProviderChange,
  onModelChange
}: ModelRouteEditorProps): ReactElement {
  return (
    <div className="settings-route-block">
      <div className="settings-route-block__head">
        <span className="hud-label">{label}</span>
        <em>{selectedProviderLabel(config, selection)}</em>
      </div>
      <label className="hud-field">
        <span>Provider</span>
        <select value={selection?.providerId ?? ""} onChange={(event) => onProviderChange(event.target.value)}>
          {config?.providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label}
            </option>
          ))}
        </select>
      </label>
      <label className="hud-field">
        <span>Model</span>
        <select value={selection?.modelId ?? ""} onChange={(event) => onModelChange(event.target.value)}>
          {modelsForSelection(config, selection).map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function toDraft(provider: ProviderSummary): ProviderDraft {
  return {
    id: provider.id,
    label: provider.label,
    type: provider.type,
    baseURL: provider.baseURL,
    models: provider.models,
    defaultModel: provider.defaultModel,
    proxyMode: provider.proxyMode,
    proxyUrl: provider.proxyUrl,
    apiKey: ""
  };
}

function toMcpDraft(server: McpServerConfig): McpServerDraft {
  return {
    id: server.id,
    label: server.label,
    transport: server.transport,
    command: server.command,
    args: server.args,
    env: server.env,
    enabled: server.enabled,
    aiWriteLevel: server.aiWriteLevel,
    timeoutMs: server.timeoutMs
  };
}

function parseModels(value: string): string[] {
  const models = value
    .split(/[\n,]+/)
    .map((model) => model.trim())
    .filter(Boolean);

  if (!models.length) {
    throw new Error("At least one model is required.");
  }

  return [...new Set(models)];
}

function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseEnv(value: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const line of parseLines(value)) {
    const separator = line.indexOf("=");

    if (separator <= 0) {
      throw new Error(`Invalid env entry: ${line}`);
    }

    env[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }

  return env;
}

function formatEnv(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function modelSelectionForProvider(
  config: AppConfigSnapshot | null,
  providerId: string
): ToolModelSelection {
  const provider = config?.providers.find((entry) => entry.id === providerId) ?? config?.providers[0];

  return {
    providerId: provider?.id ?? providerId,
    modelId: provider?.defaultModel ?? provider?.models[0] ?? ""
  };
}

function modelsForSelection(config: AppConfigSnapshot | null, selection: ToolModelSelection | null): string[] {
  const provider = config?.providers.find((entry) => entry.id === selection?.providerId) ?? config?.providers[0];
  return provider?.models ?? [];
}

function selectedProviderLabel(config: AppConfigSnapshot | null, selection: ToolModelSelection | null): string {
  const provider = config?.providers.find((entry) => entry.id === selection?.providerId);
  return provider?.label ?? "No provider";
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function normalizeProviderBaseURL(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/, "").toLowerCase();
}

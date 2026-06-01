import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import type {
  AppConfigSnapshot,
  McpServerConfig,
  McpServerDraft,
  McpServerHealth,
  NetworkConfig,
  ProviderDraft,
  ProviderSummary,
  ProviderTestResult,
  ToolModelSelection
} from "../../shared/types";
import { HUDPanel, NumericText, StatusDot } from "../components/hud";
import "./settings.css";

type SettingsPanelProps = {
  config: AppConfigSnapshot | null;
  mcpServers: McpServerConfig[];
  mcpConfigPath: string | null;
  mcpHealthChecks: McpServerHealth[];
  bridgeAvailable: boolean;
  onClose: () => void;
  onReloadConfig: () => Promise<AppConfigSnapshot | null>;
  onReloadMcpServers: () => Promise<McpServerConfig[]>;
  onUpsertProvider: (draft: ProviderDraft) => Promise<void>;
  onDeleteProvider: (id: string) => Promise<void>;
  onSetToolModel: (selection: ToolModelSelection) => Promise<void>;
  onSetNetwork: (network: NetworkConfig) => Promise<void>;
  onTestProvider: (providerId: string, modelId?: string) => Promise<ProviderTestResult>;
  onUpsertMcpServer: (draft: McpServerDraft) => Promise<McpServerConfig[]>;
  onDeleteMcpServer: (id: string) => Promise<McpServerConfig[]>;
  onCheckMcpHealth: (id?: string) => Promise<McpServerHealth[]>;
};

const newProviderDraft: ProviderDraft = {
  label: "DeepSeek",
  type: "openai-compatible",
  baseURL: "https://api.deepseek.com/v1",
  models: ["deepseek-chat", "deepseek-reasoner"],
  defaultModel: "deepseek-chat",
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

export function SettingsPanel({
  config,
  mcpServers,
  mcpConfigPath,
  mcpHealthChecks,
  bridgeAvailable,
  onClose,
  onReloadConfig,
  onReloadMcpServers,
  onUpsertProvider,
  onDeleteProvider,
  onSetToolModel,
  onSetNetwork,
  onTestProvider,
  onUpsertMcpServer,
  onDeleteMcpServer,
  onCheckMcpHealth
}: SettingsPanelProps): ReactElement {
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [selectedMcpId, setSelectedMcpId] = useState<string>("");
  const selectedProvider = useMemo(
    () => config?.providers.find((provider) => provider.id === selectedProviderId) ?? config?.providers[0] ?? null,
    [config?.providers, selectedProviderId]
  );
  const selectedMcpServer = useMemo(
    () => mcpServers.find((server) => server.id === selectedMcpId) ?? mcpServers[0] ?? null,
    [mcpServers, selectedMcpId]
  );
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(newProviderDraft);
  const [mcpDraft, setMcpDraft] = useState<McpServerDraft>(newMcpDraft);
  const [modelsText, setModelsText] = useState(newProviderDraft.models.join(", "));
  const [mcpArgsText, setMcpArgsText] = useState("");
  const [mcpEnvText, setMcpEnvText] = useState("");
  const [networkDraft, setNetworkDraft] = useState<NetworkConfig | null>(null);
  const [toolModelDraft, setToolModelDraft] = useState<ToolModelSelection | null>(null);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!bridgeAvailable) {
      return;
    }

    void onReloadConfig();
    void onReloadMcpServers();
  }, [bridgeAvailable, onReloadConfig, onReloadMcpServers]);

  useEffect(() => {
    if (!config) {
      return;
    }

    const provider = selectedProvider ?? config.providers[0];
    setSelectedProviderId(provider?.id ?? "");
    setNetworkDraft(config.network);
    setToolModelDraft(config.toolModel);

    if (provider) {
      setProviderDraft(toDraft(provider));
      setModelsText(provider.models.join(", "));
    }
  }, [config, selectedProvider]);

  useEffect(() => {
    const server = selectedMcpServer ?? mcpServers[0];
    setSelectedMcpId(server?.id ?? "");

    if (server) {
      setMcpDraft(toMcpDraft(server));
      setMcpArgsText(server.args.join("\n"));
      setMcpEnvText(formatEnv(server.env));
      return;
    }

    setMcpDraft(newMcpDraft);
    setMcpArgsText("");
    setMcpEnvText("");
  }, [mcpServers, selectedMcpServer]);

  async function handleSaveProvider(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusyLabel("Saving provider");
    setLocalError(null);

    try {
      const models = parseModels(modelsText);
      await onUpsertProvider({
        ...providerDraft,
        models,
        defaultModel: models.includes(providerDraft.defaultModel) ? providerDraft.defaultModel : models[0],
        apiKey: providerDraft.apiKey?.trim() || undefined
      });
      setProviderDraft((current) => ({ ...current, apiKey: "" }));
      setTestResult(null);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Provider save failed.");
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleDeleteProvider(): Promise<void> {
    if (!selectedProvider) {
      return;
    }

    setBusyLabel("Deleting provider");
    setLocalError(null);

    try {
      await onDeleteProvider(selectedProvider.id);
      setSelectedProviderId("");
      setTestResult(null);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Provider delete failed.");
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleSaveToolModel(): Promise<void> {
    if (!toolModelDraft) {
      return;
    }

    setBusyLabel("Saving tool model");
    setLocalError(null);

    try {
      await onSetToolModel(toolModelDraft);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Tool model save failed.");
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleSaveNetwork(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!networkDraft) {
      return;
    }

    setBusyLabel("Saving network");
    setLocalError(null);

    try {
      await onSetNetwork(networkDraft);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Network save failed.");
    } finally {
      setBusyLabel(null);
    }
  }

  async function handleTestProvider(): Promise<void> {
    const providerId = toolModelDraft?.providerId || selectedProvider?.id;
    const modelId = toolModelDraft?.modelId || selectedProvider?.defaultModel;

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

  async function handleSaveMcpServer(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusyLabel("Saving MCP");
    setLocalError(null);

    try {
      const servers = await onUpsertMcpServer({
        ...mcpDraft,
        args: parseLines(mcpArgsText),
        env: parseEnv(mcpEnvText)
      });
      const savedServer = mcpDraft.id
        ? servers.find((server) => server.id === mcpDraft.id)
        : servers.find((server) => server.label === mcpDraft.label) ?? servers[0];
      setSelectedMcpId(savedServer?.id ?? "");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "MCP server save failed.");
    } finally {
      setBusyLabel(null);
    }
  }

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

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <HUDPanel className="settings-panel" label="Plug settings" active>
        <header className="settings-panel__header">
          <div>
            <span className="hud-label">Settings</span>
            <h2>Providers / Network / Tool Model</h2>
          </div>
          <button className="hud-button" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="settings-panel__body">
          <aside className="settings-provider-list" aria-label="Providers">
            <div className="settings-section-head">
              <span className="hud-label">Providers</span>
              <button
                className="hud-link-button"
                type="button"
                onClick={() => {
                  setSelectedProviderId("");
                  setProviderDraft(newProviderDraft);
                  setModelsText(newProviderDraft.models.join(", "));
                  setTestResult(null);
                }}
              >
                New
              </button>
            </div>

            {config?.providers.map((provider) => (
              <ProviderButton
                key={provider.id}
                provider={provider}
                active={provider.id === selectedProvider?.id}
                onSelect={() => setSelectedProviderId(provider.id)}
              />
            ))}
          </aside>

          <section className="settings-editor" aria-label="Provider editor">
            <form className="settings-card" onSubmit={(event) => void handleSaveProvider(event)}>
              <div className="settings-section-head">
                <span className="hud-label">Model Connector</span>
                <StatusDot status={providerDraft.apiKey || selectedProvider?.hasApiKey ? "complete" : "waiting"} label="api key" />
              </div>

              <div className="settings-grid">
                <label className="hud-field">
                  <span>Label</span>
                  <input
                    value={providerDraft.label}
                    onChange={(event) => setProviderDraft((current) => ({ ...current, label: event.target.value }))}
                  />
                </label>
                <label className="hud-field">
                  <span>Base URL</span>
                  <input
                    value={providerDraft.baseURL}
                    onChange={(event) => setProviderDraft((current) => ({ ...current, baseURL: event.target.value }))}
                  />
                </label>
                <label className="hud-field hud-field--wide">
                  <span>Models</span>
                  <input value={modelsText} onChange={(event) => setModelsText(event.target.value)} />
                </label>
                <label className="hud-field">
                  <span>Default Model</span>
                  <input
                    value={providerDraft.defaultModel}
                    onChange={(event) => setProviderDraft((current) => ({ ...current, defaultModel: event.target.value }))}
                  />
                </label>
                <label className="hud-field">
                  <span>API Key</span>
                  <input
                    type="password"
                    value={providerDraft.apiKey ?? ""}
                    placeholder={selectedProvider?.hasApiKey ? "configured" : ""}
                    onChange={(event) => setProviderDraft((current) => ({ ...current, apiKey: event.target.value }))}
                  />
                </label>
                <label className="hud-field">
                  <span>Provider Proxy</span>
                  <select
                    value={providerDraft.proxyMode}
                    onChange={(event) =>
                      setProviderDraft((current) => ({
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
                    onChange={(event) => setProviderDraft((current) => ({ ...current, proxyUrl: event.target.value }))}
                  />
                </label>
              </div>

              <div className="settings-actions">
                <button className="hud-button hud-button--primary" type="submit" disabled={!bridgeAvailable || Boolean(busyLabel)}>
                  Save Provider
                </button>
                <button
                  className="hud-button"
                  type="button"
                  disabled={!selectedProvider || !bridgeAvailable || Boolean(busyLabel)}
                  onClick={() => void handleDeleteProvider()}
                >
                  Delete
                </button>
              </div>
            </form>

            <section className="settings-card">
              <div className="settings-section-head">
                <span className="hud-label">Tool Model</span>
                <button className="hud-link-button" type="button" onClick={() => void handleTestProvider()}>
                  Test
                </button>
              </div>

              <div className="settings-grid settings-grid--two">
                <label className="hud-field">
                  <span>Provider</span>
                  <select
                    value={toolModelDraft?.providerId ?? ""}
                    onChange={(event) => {
                      const provider = config?.providers.find((entry) => entry.id === event.target.value);
                      setToolModelDraft({
                        providerId: event.target.value,
                        modelId: provider?.defaultModel ?? provider?.models[0] ?? ""
                      });
                    }}
                  >
                    {config?.providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="hud-field">
                  <span>Model</span>
                  <select
                    value={toolModelDraft?.modelId ?? ""}
                    onChange={(event) =>
                      setToolModelDraft((current) =>
                        current ? { ...current, modelId: event.target.value } : current
                      )
                    }
                  >
                    {modelsForToolModel(config, toolModelDraft).map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="settings-actions">
                <button className="hud-button hud-button--primary" type="button" onClick={() => void handleSaveToolModel()}>
                  Save Tool Model
                </button>
              </div>
            </section>

            {networkDraft ? (
              <form className="settings-card" onSubmit={(event) => void handleSaveNetwork(event)}>
                <div className="settings-section-head">
                  <span className="hud-label">Network</span>
                  <NumericText muted>{`${networkDraft.maxRetries} retry`}</NumericText>
                </div>

                <div className="settings-grid settings-grid--three">
                  <label className="hud-field">
                    <span>Proxy</span>
                    <select
                      value={networkDraft.proxyMode}
                      onChange={(event) =>
                        setNetworkDraft((current) =>
                          current
                            ? { ...current, proxyMode: event.target.value as NetworkConfig["proxyMode"] }
                            : current
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
                        setNetworkDraft((current) => (current ? { ...current, proxyUrl: event.target.value } : current))
                      }
                    />
                  </label>
                  <NumberField label="Timeout" value={networkDraft.timeoutMs} onChange={(value) => setNetworkDraft((current) => current ? { ...current, timeoutMs: value } : current)} />
                  <NumberField label="Long Timeout" value={networkDraft.longTimeoutMs} onChange={(value) => setNetworkDraft((current) => current ? { ...current, longTimeoutMs: value } : current)} />
                  <NumberField label="Retries" value={networkDraft.maxRetries} onChange={(value) => setNetworkDraft((current) => current ? { ...current, maxRetries: value } : current)} />
                  <NumberField label="Backoff" value={networkDraft.retryBaseDelayMs} onChange={(value) => setNetworkDraft((current) => current ? { ...current, retryBaseDelayMs: value } : current)} />
                </div>

                <div className="settings-actions">
                  <button className="hud-button hud-button--primary" type="submit" disabled={!bridgeAvailable || Boolean(busyLabel)}>
                    Save Network
                  </button>
                </div>
              </form>
            ) : null}

            <form className="settings-card" onSubmit={(event) => void handleSaveMcpServer(event)}>
              <div className="settings-section-head">
                <span className="hud-label">MCP Servers</span>
                <button
                  className="hud-link-button"
                  type="button"
                  onClick={() => {
                    setSelectedMcpId("");
                    setMcpDraft(newMcpDraft);
                    setMcpArgsText("");
                    setMcpEnvText("");
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
                    onChange={(event) => setMcpDraft((current) => ({ ...current, label: event.target.value }))}
                  />
                </label>
                <label className="hud-field">
                  <span>Enabled</span>
                  <select
                    value={mcpDraft.enabled ? "yes" : "no"}
                    onChange={(event) => setMcpDraft((current) => ({ ...current, enabled: event.target.value === "yes" }))}
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
                      setMcpDraft((current) => ({ ...current, aiWriteLevel: event.target.value as McpServerDraft["aiWriteLevel"] }))
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
                    onChange={(event) => setMcpDraft((current) => ({ ...current, command: event.target.value }))}
                  />
                </label>
                <NumberField label="Timeout" value={mcpDraft.timeoutMs} onChange={(value) => setMcpDraft((current) => ({ ...current, timeoutMs: value }))} />
                <label className="hud-field hud-field--wide">
                  <span>Args</span>
                  <textarea
                    value={mcpArgsText}
                    placeholder="/path/to/server.js"
                    onChange={(event) => setMcpArgsText(event.target.value)}
                  />
                </label>
                <label className="hud-field hud-field--wide">
                  <span>Env</span>
                  <textarea
                    value={mcpEnvText}
                    placeholder="API_KEY=value"
                    onChange={(event) => setMcpEnvText(event.target.value)}
                  />
                </label>
              </div>

              <div className="settings-actions">
                <button className="hud-button hud-button--primary" type="submit" disabled={!bridgeAvailable || Boolean(busyLabel)}>
                  Save MCP
                </button>
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
            </form>
          </section>

          <aside className="settings-test-panel" aria-label="Provider test result">
            <div className="settings-section-head">
              <span className="hud-label">Test Bus</span>
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

            <div className="settings-mcp-health">
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
            </div>

            {localError ? <p className="settings-error">{localError}</p> : null}
            <p className="settings-config-path">{`${config?.configPath ?? "~/.plug/config.json"} · ${mcpConfigPath ?? "~/.plug/mcp.json"}`}</p>
          </aside>
        </div>
      </HUDPanel>
    </div>
  );
}

type ProviderButtonProps = {
  provider: ProviderSummary;
  active: boolean;
  onSelect: () => void;
};

function ProviderButton({ provider, active, onSelect }: ProviderButtonProps): ReactElement {
  return (
    <button
      className={["settings-provider-button", active ? "settings-provider-button--active" : ""].filter(Boolean).join(" ")}
      type="button"
      onClick={onSelect}
    >
      <span>◆</span>
      <strong>{provider.label}</strong>
      <em>{provider.defaultModel}</em>
      <StatusDot status={provider.hasApiKey ? "complete" : "waiting"} label={provider.hasApiKey ? "key" : "no key"} />
    </button>
  );
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

function modelsForToolModel(config: AppConfigSnapshot | null, selection: ToolModelSelection | null): string[] {
  const provider = config?.providers.find((entry) => entry.id === selection?.providerId) ?? config?.providers[0];
  return provider?.models ?? [];
}

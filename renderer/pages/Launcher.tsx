import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import type { AppInfo, ProjectSummary, TemplateSummary } from "../../shared/types";
import type { CreateProjectDraft } from "../App";
import plugLogo from "../assets/icons/plug-logo.svg?raw";
import { HUDIcon, HUDPanel, Keycap, NumericText, StatusDot } from "../components/hud";
import { commandHotkeys, usePlugHotkeys } from "../lib/keyboard-guards";
import type { StatusDotStatus } from "../components/hud";
import "./launcher.css";

type LauncherProps = {
  appInfo: AppInfo | null;
  projects: ProjectSummary[];
  templates: TemplateSummary[];
  registryPath: string | null;
  defaultParentDir: string | null;
  bridgeAvailable: boolean;
  statusMessage: string | null;
  error: string | null;
  onRegisterProject: () => Promise<void>;
  onChooseProjectParent: () => Promise<string | null>;
  onCreateProject: (draft: CreateProjectDraft) => Promise<void>;
  onOpenProject: (projectId: string) => Promise<void>;
  onRefreshProjects: () => Promise<ProjectSummary[]>;
  onShowSettings: () => void;
  onShowCommandPalette: () => void;
  newProjectSignal: number;
};

export function Launcher({
  appInfo,
  projects,
  templates,
  registryPath,
  defaultParentDir,
  bridgeAvailable,
  statusMessage,
  error,
  onRegisterProject,
  onChooseProjectParent,
  onCreateProject,
  onOpenProject,
  onRefreshProjects,
  onShowSettings,
  onShowCommandPalette,
  newProjectSignal
}: LauncherProps): ReactElement {
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const defaultTemplate = templates[0];
  const [draft, setDraft] = useState<CreateProjectDraft>({
    templateId: "product-dev",
    projectName: "",
    parentDir: "",
    defaultModel: "deepseek-chat",
    planningModel: "deepseek-reasoner",
    gitUrl: "",
    gitBranch: "main"
  });
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === draft.templateId) ?? defaultTemplate,
    [defaultTemplate, draft.templateId, templates]
  );
  const ipcStatus = !bridgeAvailable ? "waiting" : error ? "error" : appInfo ? "complete" : "running";
  const ipcLabel = !bridgeAvailable ? "Renderer Preview" : error ? "IPC Error" : appInfo ? "IPC Ready" : "IPC Sync";
  const activeProject = projects.find((project) => project.status === "active");

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      templateId: current.templateId || defaultTemplate?.id || "product-dev",
      parentDir: current.parentDir || defaultParentDir || "",
      defaultModel: current.defaultModel || defaultTemplate?.defaultModel || "deepseek-chat"
    }));
  }, [defaultParentDir, defaultTemplate]);

  useEffect(() => {
    if (newProjectSignal > 0 && bridgeAvailable) {
      setIsWizardOpen(true);
    }
  }, [bridgeAvailable, newProjectSignal]);

  usePlugHotkeys(
    commandHotkeys("n"),
    () => {
      if (bridgeAvailable) {
        setIsWizardOpen(true);
      }
    },
    {},
    [bridgeAvailable]
  );

  async function handleChooseParent(): Promise<void> {
    const path = await onChooseProjectParent();
    if (path) {
      setDraft((current) => ({ ...current, parentDir: path }));
    }
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await onCreateProject(draft);
    setIsWizardOpen(false);
    setDraft((current) => ({ ...current, projectName: "", gitUrl: "" }));
  }

  return (
    <main className="app-shell">
      <HUDPanel className="launcher-panel" label="Plug launcher" active>
        <header className="launcher-panel__header">
          <div className="launcher-panel__brand">
            <HUDIcon svg={plugLogo} size="lg" label="Plug" />
            <div>
              <div className="launcher-panel__wordmark">PLUG</div>
              <div className="launcher-panel__subtitle">MISSION REGISTRY / LOCAL FIRST</div>
            </div>
          </div>
          <StatusDot status={ipcStatus} label={ipcLabel} />
        </header>

        <div className="hud-divider" />

        {!bridgeAvailable ? (
          <section className="launcher-panel__preview-lock" aria-label="Renderer preview diagnostics">
            <span className="launcher-panel__preview-mark">◇</span>
            <div className="launcher-panel__preview-copy">
              <span className="hud-label">Renderer Preview</span>
              <h1>Desktop window required</h1>
              <p>
                This browser tab is only the Vite renderer preview. It has no Electron preload bridge, so project
                registry, file access, settings, and chat are intentionally unavailable here.
              </p>
              <div className="launcher-panel__preview-steps" aria-label="How to test Plug">
                <span>1</span>
                <p>
                  Keep <code>npm run dev</code> running in the terminal.
                </p>
                <span>2</span>
                <p>Switch to the Electron desktop window named Plug.</p>
                <span>3</span>
                <p>Open or create a project there, then use the workspace composer to chat.</p>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="launcher-panel__actions" aria-label="Launcher actions">
              <button className="hud-button hud-button--primary" type="button" onClick={() => setIsWizardOpen(true)}>
                ◆ New Project
              </button>
              <button className="hud-button" type="button" onClick={() => void onRegisterProject()}>
                Register Existing
              </button>
              <button className="hud-button" type="button" onClick={() => void onRefreshProjects()}>
                Refresh
              </button>
              <button className="hud-button" type="button" onClick={onShowCommandPalette}>
                Cmd Palette
              </button>
              <button className="hud-button" type="button" onClick={onShowSettings}>
                Settings
              </button>
            </section>

            <section className="launcher-panel__readout" aria-label="Runtime readout">
              <div>
                <span className="hud-label">Runtime</span>
                <NumericText>{appInfo ? appInfo.environment.toUpperCase() : "SYNCING"}</NumericText>
              </div>
              <div>
                <span className="hud-label">Version</span>
                <NumericText>{appInfo ? appInfo.version : "0.0.0"}</NumericText>
              </div>
              <div>
                <span className="hud-label">Projects</span>
                <NumericText>{projects.length}</NumericText>
              </div>
              <div>
                <span className="hud-label">Active</span>
                <NumericText muted>{activeProject ? activeProject.name.toUpperCase() : "NONE"}</NumericText>
              </div>
            </section>
          </>
        )}

        {isWizardOpen && bridgeAvailable ? (
          <form className="new-project-wizard" onSubmit={(event) => void handleCreateProject(event)}>
            <div className="launcher-panel__section-head">
              <span className="hud-label">Initialize New Mission</span>
              <button className="hud-link-button" type="button" onClick={() => setIsWizardOpen(false)}>
                Close
              </button>
            </div>

            <div className="new-project-wizard__grid">
              <label className="hud-field">
                <span>Template</span>
                <select
                  value={draft.templateId}
                  onChange={(event) => setDraft((current) => ({ ...current, templateId: event.target.value }))}
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="hud-field">
                <span>Project Name</span>
                <input
                  required
                  value={draft.projectName}
                  placeholder="登录系统重构"
                  onChange={(event) => setDraft((current) => ({ ...current, projectName: event.target.value }))}
                />
              </label>

              <label className="hud-field hud-field--wide">
                <span>Location</span>
                <div className="hud-field__inline">
                  <input
                    required
                    value={draft.parentDir}
                    onChange={(event) => setDraft((current) => ({ ...current, parentDir: event.target.value }))}
                  />
                  <button className="hud-button" type="button" onClick={() => void handleChooseParent()}>
                    Browse
                  </button>
                </div>
              </label>

              <label className="hud-field">
                <span>Chat Model</span>
                <input
                  value={draft.defaultModel}
                  onChange={(event) => setDraft((current) => ({ ...current, defaultModel: event.target.value }))}
                />
              </label>

              <label className="hud-field">
                <span>Planning Model</span>
                <input
                  value={draft.planningModel}
                  onChange={(event) => setDraft((current) => ({ ...current, planningModel: event.target.value }))}
                />
              </label>

              <label className="hud-field">
                <span>Git Remote</span>
                <input
                  value={draft.gitUrl}
                  placeholder="optional"
                  onChange={(event) => setDraft((current) => ({ ...current, gitUrl: event.target.value }))}
                />
              </label>

              <label className="hud-field">
                <span>Git Branch</span>
                <input
                  value={draft.gitBranch}
                  onChange={(event) => setDraft((current) => ({ ...current, gitBranch: event.target.value }))}
                />
              </label>
            </div>

            <div className="new-project-wizard__summary">
              <span className="hud-label">{selectedTemplate?.id ?? "template"}</span>
              <p>{selectedTemplate?.description ?? "Template metadata loading."}</p>
            </div>

            <div className="new-project-wizard__actions">
              <button className="hud-button" type="button" onClick={() => setIsWizardOpen(false)}>
                Cancel
              </button>
              <button className="hud-button hud-button--primary" type="submit" disabled={!templates.length || !bridgeAvailable}>
                Initialize
              </button>
            </div>
          </form>
        ) : null}

        {bridgeAvailable ? (
          <section className="launcher-panel__projects" aria-label="Recent projects">
            <div className="launcher-panel__section-head">
              <span className="hud-label">Recent Missions</span>
              <span className="launcher-panel__registry-path">{registryPath ?? "~/.plug/projects.json"}</span>
            </div>

            {projects.length === 0 ? (
              <div className="launcher-panel__empty">
                <span className="launcher-panel__empty-mark">◇</span>
                <div>
                  <strong>No registered projects</strong>
                  <p>Register a local folder to add it to the Plug mission registry.</p>
                </div>
              </div>
            ) : (
              <ul className="project-list">
                {projects.map((project) => (
                  <li key={project.id}>
                    <button className="project-row" type="button" onClick={() => void onOpenProject(project.id)}>
                      <span className="project-row__marker">◆</span>
                      <span className="project-row__main">
                        <span className="project-row__name">{project.name}</span>
                        <span className="project-row__path">{project.path}</span>
                      </span>
                      <span className="project-row__meta">
                        <StatusDot status={statusForProject(project)} label={project.status} />
                        <NumericText muted>{formatDate(project.updatedAt)}</NumericText>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <footer className="launcher-panel__footer">
          <span className="hud-label">{statusMessage ?? "Command Bus"}</span>
          <div className="launcher-panel__keys">
            <Keycap>⌘</Keycap>
            <Keycap>N</Keycap>
            <Keycap>⌘</Keycap>
            <Keycap>O</Keycap>
            <Keycap>⌘</Keycap>
            <Keycap>K</Keycap>
          </div>
        </footer>

        {error ? <p className="launcher-panel__error">IPC bootstrap failed: {error}</p> : null}
      </HUDPanel>
    </main>
  );
}

function statusForProject(project: ProjectSummary): StatusDotStatus {
  if (project.status === "active") {
    return "complete";
  }

  if (project.status === "missing") {
    return "error";
  }

  return "pending";
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "UNKNOWN";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

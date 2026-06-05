import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from "electron-updater";
import type { UpdateSnapshot, UpdateStatus } from "../../shared/types";

let initialized = false;
let snapshot: UpdateSnapshot = buildSnapshot({ status: "idle" });

export function initializeUpdateService(): void {
  if (initialized) {
    return;
  }

  initialized = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = null;

  autoUpdater.on("checking-for-update", () => {
    updateSnapshot({ status: "checking", error: null, progress: null });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    updateSnapshot({
      status: "available",
      updateVersion: info.version,
      releaseName: info.releaseName ?? null,
      releaseDate: info.releaseDate ?? null,
      releaseNotes: formatReleaseNotes(info.releaseNotes),
      error: null,
      downloaded: false,
      progress: null
    });
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    updateSnapshot({
      status: "not-available",
      updateVersion: info.version ?? null,
      releaseName: info.releaseName ?? null,
      releaseDate: info.releaseDate ?? null,
      releaseNotes: formatReleaseNotes(info.releaseNotes),
      error: null,
      downloaded: false,
      progress: null
    });
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    updateSnapshot({
      status: "downloading",
      error: null,
      progress: {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      }
    });
  });

  autoUpdater.on("update-downloaded", (event: UpdateDownloadedEvent) => {
    updateSnapshot({
      status: "downloaded",
      updateVersion: event.version,
      releaseName: event.releaseName ?? null,
      releaseDate: event.releaseDate ?? null,
      releaseNotes: formatReleaseNotes(event.releaseNotes),
      error: null,
      downloaded: true,
      progress: null
    });
  });

  autoUpdater.on("error", (error: Error) => {
    updateSnapshot({
      status: "error",
      error: error.message || "Update check failed.",
      progress: null
    });
  });
}

export function getUpdateSnapshot(): UpdateSnapshot {
  initializeUpdateService();
  return snapshot;
}

export async function checkForUpdates(): Promise<UpdateSnapshot> {
  initializeUpdateService();

  if (!app.isPackaged) {
    updateSnapshot({
      status: "error",
      error: "Updates are only available in packaged builds."
    });
    return snapshot;
  }

  if (snapshot.status === "checking" || snapshot.status === "downloading") {
    return snapshot;
  }

  try {
    const result = await autoUpdater.checkForUpdates();

    if (!result) {
      updateSnapshot({
        status: "error",
        error: "Updater is not active for this build."
      });
    }

    return snapshot;
  } catch (error) {
    updateSnapshot({
      status: "error",
      error: error instanceof Error ? error.message : "Update check failed."
    });
    return snapshot;
  }
}

export async function downloadUpdate(): Promise<UpdateSnapshot> {
  initializeUpdateService();

  if (!app.isPackaged) {
    updateSnapshot({
      status: "error",
      error: "Updates are only available in packaged builds."
    });
    return snapshot;
  }

  if (snapshot.status === "downloading") {
    return snapshot;
  }

  if (!snapshot.canDownload) {
    updateSnapshot({
      status: "error",
      error: "No update is ready to download. Check for updates first."
    });
    return snapshot;
  }

  updateSnapshot({ status: "downloading", error: null });

  try {
    await autoUpdater.downloadUpdate();
    return snapshot;
  } catch (error) {
    updateSnapshot({
      status: "error",
      error: error instanceof Error ? error.message : "Update download failed.",
      progress: null
    });
    return snapshot;
  }
}

export function installUpdate(): { ok: boolean } {
  initializeUpdateService();

  if (!snapshot.canInstall) {
    updateSnapshot({
      status: "error",
      error: "No downloaded update is ready to install."
    });
    return { ok: false };
  }

  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
}

function updateSnapshot(next: Partial<UpdateSnapshot> & { status?: UpdateStatus }): UpdateSnapshot {
  snapshot = buildSnapshot({
    ...snapshot,
    ...next
  });
  emitUpdateSnapshot();
  return snapshot;
}

function buildSnapshot(input: Partial<UpdateSnapshot> & { status: UpdateStatus }): UpdateSnapshot {
  const status = input.status;
  const isPackaged = app.isPackaged;
  const downloaded = Boolean(input.downloaded || status === "downloaded");
  const checkingOrDownloading = status === "checking" || status === "downloading";

  return {
    status,
    currentVersion: app.getVersion(),
    updateVersion: input.updateVersion ?? null,
    releaseName: input.releaseName ?? null,
    releaseDate: input.releaseDate ?? null,
    releaseNotes: input.releaseNotes ?? null,
    error: input.error ?? (isPackaged ? null : "Updates are only available in packaged builds."),
    downloaded,
    canCheck: isPackaged && !checkingOrDownloading,
    canDownload: isPackaged && status === "available" && !downloaded,
    canInstall: isPackaged && downloaded,
    progress: input.progress ?? null
  };
}

function emitUpdateSnapshot(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("update.event", snapshot);
  }
}

function formatReleaseNotes(notes: UpdateInfo["releaseNotes"]): string | null {
  if (!notes) {
    return null;
  }

  if (typeof notes === "string") {
    return notes;
  }

  if (Array.isArray(notes)) {
    return notes
      .map((note) => {
        if (typeof note === "string") {
          return note;
        }

        if (note && typeof note === "object" && "note" in note) {
          return String(note.note);
        }

        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }

  return String(notes);
}

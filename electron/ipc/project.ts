import { dialog } from "electron";
import {
  addProjectPath,
  getProjectRegistryPath,
  listProjects,
  openProject
} from "../services/project-service";
import {
  createProjectFromTemplate,
  getDefaultProjectParentDir,
  listTemplates
} from "../services/template-service";
import {
  loadWorkspace,
  openWorkspaceDocumentPath,
  openWorkspaceSection,
  saveWorkspaceDocument
} from "../services/workspace-service";
import { registerIpcHandler } from "./register";

export function registerProjectIpc(): void {
  registerIpcHandler("project.list", async () => ({
    projects: await listProjects()
  }));

  registerIpcHandler("project.add", async (payload) => {
    return addProjectPath(payload.path);
  });

  registerIpcHandler("project.addFromDialog", async () => {
    const projectsBeforeDialog = await listProjects();
    const result = await dialog.showOpenDialog({
      title: "Open Plug Project Folder",
      properties: ["openDirectory", "createDirectory"]
    });

    if (result.canceled || !result.filePaths[0]) {
      return {
        cancelled: true,
        project: null,
        projects: projectsBeforeDialog
      };
    }

    const added = await addProjectPath(result.filePaths[0]);

    return {
      cancelled: false,
      project: added.project,
      projects: added.projects
    };
  });

  registerIpcHandler("project.open", async (payload) => {
    return openProject(payload.id);
  });

  registerIpcHandler("project.registryPath", () => ({
    path: getProjectRegistryPath()
  }));

  registerIpcHandler("template.list", async () => ({
    templates: await listTemplates()
  }));

  registerIpcHandler("template.defaultParentDir", () => ({
    path: getDefaultProjectParentDir()
  }));

  registerIpcHandler("template.chooseParentDir", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select Plug Projects Folder",
      defaultPath: getDefaultProjectParentDir(),
      properties: ["openDirectory", "createDirectory"]
    });

    return {
      cancelled: result.canceled || !result.filePaths[0],
      path: result.filePaths[0] ?? null
    };
  });

  registerIpcHandler("project.createFromTemplate", async (payload) => {
    return createProjectFromTemplate(payload);
  });

  registerIpcHandler("workspace.load", async (payload) => {
    return loadWorkspace(payload.projectId);
  });

  registerIpcHandler("workspace.openSection", async (payload) => {
    return openWorkspaceSection(payload.projectId, payload.sectionId);
  });

  registerIpcHandler("workspace.openDocumentPath", async (payload) => {
    return openWorkspaceDocumentPath(payload.projectId, payload.path, payload.fromPath);
  });

  registerIpcHandler("workspace.saveDocument", async (payload) => {
    return saveWorkspaceDocument(payload.projectId, payload.path, payload.content);
  });
}

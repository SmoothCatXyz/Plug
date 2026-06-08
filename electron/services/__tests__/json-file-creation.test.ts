import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createOrchestratorTools } from "../agent-crew";
import { invokeAgentTool } from "../agent-service";
import { createProjectFromTemplate } from "../template-service";

test("explicit JSON file creation uses create_file and stays JSON", async () => {
  process.env.HOME = await mkdtemp(join(tmpdir(), "plug-home-"));

  const parentDir = await mkdtemp(join(tmpdir(), "plug-projects-"));
  const { project } = await createProjectFromTemplate({
    templateId: "product-dev",
    projectName: "JSON File Contract",
    parentDir,
    defaultModel: "deepseek-chat",
    planningModel: "deepseek-chat",
    gitUrl: "",
    gitBranch: "main"
  });
  const events: Array<{ phase: string; toolName: string }> = [];
  const emitTool = (event: { phase: string; toolName: string }): void => {
    events.push(event);
  };
  const jsonContent = `${JSON.stringify(
    {
      name: "JSON File Contract",
      kind: "project-info",
      createdBy: "plug-test"
    },
    null,
    2
  )}\n`;

  const createResult = await invokeAgentTool({
    invocationId: "json-contract:create-file",
    projectId: project.id,
    mode: "execute",
    name: "create_file",
    input: {
      path: "05-knowledge/project-info.json",
      content: jsonContent,
      reason: "Verify explicit JSON file requests are stored as JSON, not Markdown."
    },
    emit: emitTool
  });

  expect(createResult.status).toBe("success");

  const written = await readFile(join(project.path, "05-knowledge", "project-info.json"), "utf8");
  expect(written).toBe(jsonContent);
  expect(JSON.parse(written)).toMatchObject({ kind: "project-info" });

  const orchestratorTools = await createOrchestratorTools({
    streamId: "json-contract-orchestrator",
    projectId: project.id,
    mode: "execute",
    emitTool,
    projectContext: `Project: ${project.name}`
  });

  const createFileTool = orchestratorTools.create_file;

  if (!createFileTool?.execute) {
    throw new Error("Expected orchestrator to expose executable create_file.");
  }

  const directResult = await createFileTool.execute(
    {
      path: "05-knowledge/direct-json.json",
      content: "{\"ok\":true}\n",
      reason: "Verify orchestrator direct create_file can write JSON."
    },
    { toolCallId: "direct-json", messages: [] }
  );

  expect(directResult).toMatchObject({ status: "success", toolName: "create_file" });
  expect(JSON.parse(await readFile(join(project.path, "05-knowledge", "direct-json.json"), "utf8"))).toMatchObject({
    ok: true
  });

  const documentResult = await invokeAgentTool({
    invocationId: "json-contract:write-document",
    projectId: project.id,
    mode: "execute",
    name: "write_document",
    input: {
      section: "knowledge",
      title: "project-info.json",
      content: "{\"should\":\"not become markdown\"}",
      summary: "Should be rejected.",
      tags: ["json"],
      status: "done"
    },
    emit: emitTool
  });

  expect(documentResult.status).toBe("error");
  expect(documentResult.error).toContain("create_file");
  expect(events.some((event) => event.phase === "success" && event.toolName === "create_file")).toBe(true);
});

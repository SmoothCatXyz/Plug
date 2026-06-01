import { describe, it, expect } from "vitest";
import { resolveDocumentOpenIntent } from "../document-intent";
import type { ProjectSection } from "../../../shared/types";

const sections: ProjectSection[] = [
  { id: "home", label: "主页", path: "00-home.md", type: "file", aiWrite: "auto" },
  { id: "purpose", label: "项目目的", path: "01-purpose.md", type: "file", aiWrite: "auto" },
  { id: "prd", label: "PRD", path: "02-prd/", type: "folder", aiWrite: "confirm" },
  { id: "design", label: "设计", path: "03-design/", type: "folder", aiWrite: "confirm" },
  { id: "knowledge", label: "知识仓库", path: "05-knowledge/", type: "folder", aiWrite: "confirm" }
] as ProjectSection[];

describe("resolveDocumentOpenIntent", () => {
  it("resolves a section file by keyword", () => {
    expect(resolveDocumentOpenIntent("打开项目主页", sections)).toEqual({ kind: "path", path: "00-home.md" });
  });

  it("resolves a folder section to its _index.md", () => {
    expect(resolveDocumentOpenIntent("打开项目设计文档", sections)).toEqual({ kind: "path", path: "03-design/_index.md" });
    expect(resolveDocumentOpenIntent("打开PRD", sections)).toEqual({ kind: "path", path: "02-prd/_index.md" });
    expect(resolveDocumentOpenIntent("查看知识库", sections)).toEqual({ kind: "path", path: "05-knowledge/_index.md" });
  });

  it("resolves a generic document command to the latest doc", () => {
    expect(resolveDocumentOpenIntent("打开文档", sections)).toEqual({ kind: "latest" });
    expect(resolveDocumentOpenIntent("打开那篇调研", sections)).toEqual({ kind: "latest" });
  });

  it("does NOT hijack non-open or ambiguous commands", () => {
    expect(resolveDocumentOpenIntent("打开百度网页", sections)).toBeNull(); // browser, not a doc
    expect(resolveDocumentOpenIntent("帮我写一份PRD", sections)).toBeNull(); // write, not open
    expect(resolveDocumentOpenIntent("你好", sections)).toBeNull();
    expect(resolveDocumentOpenIntent("打开思路聊聊这个项目接下来该怎么推进比较好", sections)).toBeNull(); // too long
  });
});

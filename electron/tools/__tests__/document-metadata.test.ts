import { describe, it, expect } from "vitest";
import {
  parseDocMetadata,
  renderMetadataBlock,
  resolveDocTitle,
  resolveDocSummary
} from "../document-metadata";

describe("document-metadata", () => {
  it("parses markdown YAML front-matter", () => {
    const content = "---\ntitle: 登录调研\nsummary: 竞品登录方式\ntags: [登录, 竞品]\nstatus: done\n---\n# 登录调研\n正文。";
    const { meta, body } = parseDocMetadata(content, "x.md");
    expect(meta.title).toBe("登录调研");
    expect(meta.summary).toBe("竞品登录方式");
    expect(meta.tags).toEqual(["登录", "竞品"]);
    expect(meta.status).toBe("done");
    expect(body.startsWith("# 登录调研")).toBe(true);
  });

  it("parses html plug comment block", () => {
    const content = "<!--plug\ntitle: 登录 PRD\ntags: [登录]\n-->\n<!DOCTYPE html><h1>登录 PRD</h1>";
    const { meta, body } = parseDocMetadata(content, "x.html");
    expect(meta.title).toBe("登录 PRD");
    expect(meta.tags).toEqual(["登录"]);
    expect(body.startsWith("<!DOCTYPE html>")).toBe(true);
  });

  it("round-trips a metadata block", () => {
    const meta = { title: "A", tags: ["x", "y"], status: "draft", created: "2026-06-02" };
    const md = renderMetadataBlock(meta, "a.md");
    expect(parseDocMetadata(`${md}body`, "a.md").meta).toMatchObject(meta);
    const html = renderMetadataBlock(meta, "a.html");
    expect(parseDocMetadata(`${html}body`, "a.html").meta).toMatchObject(meta);
  });

  it("falls back to headings for title/summary", () => {
    expect(resolveDocTitle({}, "# 标题\n首段内容", "x.md", "fb")).toBe("标题");
    expect(resolveDocTitle({}, "<title>HT</title><h1>H1</h1>", "x.html", "fb")).toBe("HT");
    expect(resolveDocSummary({}, "# 标题\n这是摘要句。", "x.md")).toBe("这是摘要句。");
  });
});

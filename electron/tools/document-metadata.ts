// Lightweight document metadata: a small, dependency-free front-matter model
// shared by Markdown docs (YAML `---` block) and HTML docs (a leading
// `<!--plug ... -->` comment block). One metadata shape, two encodings, so the
// catalog can treat .md and .html documents uniformly.

export interface DocMeta {
  title?: string;
  summary?: string;
  tags?: string[];
  status?: string; // draft | in-progress | done
  created?: string; // YYYY-MM-DD
  updated?: string; // YYYY-MM-DD
}

const SCALAR_KEYS = new Set(["title", "summary", "status", "created", "updated"]);

export function isHtmlPath(path: string): boolean {
  return /\.html?$/i.test(path);
}

/** Split a document into its metadata block and the remaining body. */
export function parseDocMetadata(content: string, path: string): { meta: DocMeta; body: string } {
  if (isHtmlPath(path)) {
    const match = content.match(/^﻿?\s*<!--\s*plug\s*([\s\S]*?)-->\s*\n?/i);
    if (match) {
      return { meta: parseYamlish(match[1]), body: content.slice(match[0].length) };
    }
    return { meta: {}, body: content };
  }

  const match = content.match(/^﻿?---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (match) {
    return { meta: parseYamlish(match[1]), body: content.slice(match[0].length) };
  }
  return { meta: {}, body: content };
}

/** Render a metadata block in the right encoding for the path's extension. */
export function renderMetadataBlock(meta: DocMeta, path: string): string {
  const lines: string[] = [];
  if (meta.title) lines.push(`title: ${meta.title}`);
  if (meta.summary) lines.push(`summary: ${meta.summary}`);
  if (meta.tags && meta.tags.length) lines.push(`tags: [${meta.tags.join(", ")}]`);
  if (meta.status) lines.push(`status: ${meta.status}`);
  if (meta.created) lines.push(`created: ${meta.created}`);
  if (meta.updated) lines.push(`updated: ${meta.updated}`);
  const body = lines.join("\n");

  return isHtmlPath(path) ? `<!--plug\n${body}\n-->\n` : `---\n${body}\n---\n`;
}

/** Best-effort document title: metadata first, then the body's first heading. */
export function resolveDocTitle(meta: DocMeta, body: string, path: string, fallback: string): string {
  if (meta.title) return meta.title;
  if (isHtmlPath(path)) {
    const titleTag = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    if (titleTag?.trim()) return stripTags(titleTag).trim();
    const h1 = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
    if (h1?.trim()) return stripTags(h1).trim();
  } else {
    const h1 = body.split("\n").find((line) => line.trim().startsWith("# "));
    if (h1) return h1.replace(/^#\s+/, "").trim();
  }
  return fallback;
}

/** Best-effort one-line summary when metadata has none. */
export function resolveDocSummary(meta: DocMeta, body: string, path: string): string {
  if (meta.summary) return meta.summary;
  const text = isHtmlPath(path) ? stripTags(body) : body.replace(/^#.*$/m, "");
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith(">") && !line.startsWith("#"));
  if (!firstLine) return "";
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

function parseYamlish(text: string): DocMeta {
  const meta: DocMeta = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim();
    if (key === "tags") {
      meta.tags = parseInlineList(value);
    } else if (SCALAR_KEYS.has(key)) {
      (meta as Record<string, string>)[key] = stripQuotes(value);
    }
  }
  return meta;
}

function parseInlineList(value: string): string[] {
  return value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((item) => stripQuotes(item.trim()))
    .filter(Boolean);
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "").trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

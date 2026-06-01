import type { ProjectSection } from "../../shared/types";

export type DocumentOpenIntent = { kind: "path"; path: string } | { kind: "latest" } | null;

// Verbs that signal "reveal a document". The intent only fires on a short command
// so it never hijacks a real request that merely contains one of these words.
const OPEN_VERBS = /(打开|查看|显示|看一下|看看|开一下|调出|open|show|view|reveal|pull up)/i;

// Extra keywords per section id, beyond the section's own (localized) label.
const SECTION_KEYWORDS: Record<string, string[]> = {
  home: ["主页", "首页", "home", "homepage"],
  purpose: ["目的", "愿景", "purpose"],
  prd: ["prd", "需求文档"],
  design: ["设计", "design"],
  code: ["代码", "code"],
  knowledge: ["知识", "knowledge", "调研库"],
  deliverables: ["交付", "成果", "deliverable"]
};

const GENERIC_DOC = /(文档|笔记|调研|报告|文件|doc|document|最近|那篇|刚.*写)/i;

/**
 * Resolve a plain "open <doc>" command to a target, deterministically and without
 * a model call. Returns null for anything that isn't a high-confidence open
 * command, so non-matches fall through to the normal pipeline untouched.
 *
 * - A section keyword/label match → that section's file or `_index.md`.
 * - A generic document word ("打开文档", "打开那篇调研") → the latest document.
 */
export function resolveDocumentOpenIntent(content: string, sections: ProjectSection[]): DocumentOpenIntent {
  const text = content.trim();
  // Short, open-verb commands only — guards against hijacking longer requests.
  if (text.length === 0 || text.length > 24 || !OPEN_VERBS.test(text)) {
    return null;
  }
  const lower = text.toLowerCase();

  for (const section of sections) {
    const keys = [section.label, ...(SECTION_KEYWORDS[section.id] ?? [])].filter(Boolean);
    if (keys.some((key) => lower.includes(key.toLowerCase()))) {
      const path = section.type === "file" ? section.path : `${section.path.replace(/\/+$/, "")}/_index.md`;
      return { kind: "path", path };
    }
  }

  if (GENERIC_DOC.test(text)) {
    return { kind: "latest" };
  }

  return null;
}

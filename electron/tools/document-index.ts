import {
  findSectionForPath,
  readProjectManifest,
  readProjectTextFile,
  writeProjectTextFile
} from "./project-files";
import { regenerateSectionIndex } from "./update-index";
import { isHtmlPath, parseDocMetadata, resolveDocTitle } from "./document-metadata";

const HOME_RECENT_HEADING = "## 最近文档";
const HOME_RECENT_LIMIT = 12;

/**
 * Post-write maintenance for an AI-authored document: rebuild the containing
 * folder section's _index.md and link it from the project home page.
 *
 * Tool-agnostic and idempotent — ai-service runs it for whatever file the turn
 * wrote (create_file OR write_document), so indexing never depends on the model
 * picking a particular tool. Returns the document title (for messaging) or null
 * if the path isn't an indexable project document.
 */
export async function indexProjectDocument(projectRoot: string, relPath: string): Promise<string | null> {
  const fileName = relPath.split("/").pop() ?? "";
  const indexable = relPath.endsWith(".md") || isHtmlPath(relPath);
  if (!indexable || fileName === "_index.md" || fileName === "00-home.md") {
    return null;
  }

  const manifest = await readProjectManifest(projectRoot);
  const section = findSectionForPath(manifest, relPath);
  if (!section || section.type === "file" || section.aiWrite === "readonly") {
    return null; // not a writable folder section we index
  }

  const title = await documentTitle(projectRoot, relPath, fileName.replace(/\.[^.]+$/, ""));
  await regenerateSectionIndex(projectRoot, section);
  await linkFromHome(projectRoot, relPath, title);
  return title;
}

async function documentTitle(projectRoot: string, relPath: string, fallback: string): Promise<string> {
  try {
    const { content } = await readProjectTextFile(projectRoot, relPath);
    const { meta, body } = parseDocMetadata(content, relPath);
    return resolveDocTitle(meta, body, relPath, fallback);
  } catch {
    return fallback;
  }
}

function nowStamp(): string {
  return new Date().toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Maintain a "## 最近文档" list near the top of 00-home.md. De-duplicated by path.
async function linkFromHome(projectRoot: string, relPath: string, title: string): Promise<void> {
  let home: string;
  try {
    home = (await readProjectTextFile(projectRoot, "00-home.md")).content;
  } catch {
    return; // no home page — nothing to index against
  }

  const entry = `- [${title}](./${relPath}) · ${nowStamp()}`;
  const lines = home.split("\n");
  const headingIdx = lines.findIndex((line) => line.trim() === HOME_RECENT_HEADING);

  if (headingIdx === -1) {
    const block = ["", HOME_RECENT_HEADING, "", entry, ""];
    const nextStepIdx = lines.findIndex((line) => line.trim().startsWith("## 下一步"));
    if (nextStepIdx === -1) {
      lines.push(...block);
    } else {
      lines.splice(nextStepIdx, 0, ...block);
    }
  } else {
    let end = headingIdx + 1;
    while (end < lines.length && !lines[end].trim().startsWith("## ")) end += 1;
    const existing = lines
      .slice(headingIdx + 1, end)
      .filter((line) => line.trim().startsWith("- ") && !line.includes(`(./${relPath})`));
    const merged = [entry, ...existing].slice(0, HOME_RECENT_LIMIT);
    lines.splice(headingIdx + 1, end - (headingIdx + 1), "", ...merged, "");
  }

  await writeProjectTextFile(projectRoot, "00-home.md", lines.join("\n"));
}

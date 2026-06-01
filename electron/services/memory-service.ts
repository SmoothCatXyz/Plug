import { readProjectTextFile } from "../tools/project-files";

export type MemorySearchResult = {
  id: string;
  title: string;
  content: string;
  score: number;
};

export async function searchProjectMemory(input: {
  projectRoot: string;
  query: string;
  topK?: number;
}): Promise<MemorySearchResult[]> {
  const topK = Math.max(1, Math.min(input.topK ?? 5, 12));
  const query = input.query.trim();

  if (!query) {
    return [];
  }

  const content = await readMemory(input.projectRoot);
  const entries = parseMemoryEntries(content);
  const queryTerms = extractSearchTerms(query);
  const normalizedQuery = normalizeSearchText(query);

  return entries
    .map((entry) => ({
      ...entry,
      score: scoreMemoryEntry(entry, queryTerms, normalizedQuery)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, topK);
}

async function readMemory(projectRoot: string): Promise<string> {
  try {
    return (await readProjectTextFile(projectRoot, ".plug/memory.md")).content;
  } catch {
    return "";
  }
}

function parseMemoryEntries(content: string): Array<Omit<MemorySearchResult, "score">> {
  const lines = content.split("\n");
  const entries: Array<Omit<MemorySearchResult, "score">> = [];
  let currentTitle = "Project Memory";
  let currentLines: string[] = [];

  function flush(): void {
    const body = currentLines.join("\n").trim();

    if (!body || /^#\s*Memory\s*$/i.test(currentTitle)) {
      currentLines = [];
      return;
    }

    entries.push({
      id: `memory-${entries.length + 1}`,
      title: currentTitle,
      content: body
    });
    currentLines = [];
  }

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);

    if (heading) {
      flush();
      currentTitle = heading[1].trim();
      continue;
    }

    currentLines.push(line);
  }

  flush();

  if (!entries.length && content.trim()) {
    return [
      {
        id: "memory-1",
        title: "Project Memory",
        content: content.trim()
      }
    ];
  }

  return entries;
}

function scoreMemoryEntry(
  entry: Omit<MemorySearchResult, "score">,
  queryTerms: string[],
  normalizedQuery: string
): number {
  const haystack = normalizeSearchText(`${entry.title}\n${entry.content}`);
  let score = 0;

  if (normalizedQuery && haystack.includes(normalizedQuery)) {
    score += 20;
  }

  for (const term of queryTerms) {
    if (haystack.includes(term)) {
      score += term.length > 1 ? 4 : 1;
    }
  }

  return score;
}

function extractSearchTerms(value: string): string[] {
  const normalized = normalizeSearchText(value);
  const terms = new Set<string>();

  for (const token of normalized.match(/[a-z0-9_+-]{2,}/g) ?? []) {
    terms.add(token);
  }

  for (const chunk of normalized.match(/[\u3400-\u9fff]{2,}/g) ?? []) {
    for (let index = 0; index < chunk.length - 1; index += 1) {
      terms.add(chunk.slice(index, index + 2));
    }
  }

  return [...terms];
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_+-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

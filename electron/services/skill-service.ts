import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import { getPlugHomeDir } from "../utils/paths";
import { generateEmbedding, generateEmbeddings } from "./embedding-service";

// Below this cosine similarity a skill is considered irrelevant to the query.
const SEMANTIC_THRESHOLD = 0.28;
const EMBED_CACHE_VERSION = 1;

export type LoadedSkill = {
  name: string;
  description: string;
  triggers: string[];
  applicableSections: string[];
  source: "personal" | "project";
  path: string;
  body: string;
};

type LoadRelevantSkillsInput = {
  projectRoot: string;
  query: string;
  currentSectionId?: string;
  limit?: number;
};

type SkillCandidate = LoadedSkill & {
  score: number;
};

export async function loadRelevantSkills(input: LoadRelevantSkillsInput): Promise<LoadedSkill[]> {
  const limit = input.limit ?? 3;
  const rawQuery = input.query.trim();

  if (!rawQuery) {
    return [];
  }

  const skills = await loadAllLocalSkills(input.projectRoot);
  if (skills.length === 0) {
    return [];
  }

  const normalizedQuery = normalizeText(rawQuery);

  // Semantic match is primary; skill embeddings are cached on disk so only the
  // query is embedded per turn. Both run concurrently.
  const [skillEmbeddings, queryEmbedding] = await Promise.all([
    ensureSkillEmbeddings(skills),
    generateEmbedding(rawQuery)
  ]);

  // No embedding capability (provider lacks /embeddings, or it failed) — fall
  // back to the original keyword scoring so the feature still works.
  if (!queryEmbedding) {
    return keywordRank(skills, normalizedQuery, input.currentSectionId, limit);
  }

  const ranked = skills
    .map((skill) => {
      const embedding = skillEmbeddings.get(skill.path);
      const semantic = embedding ? cosineSimilarity(queryEmbedding, embedding) : 0;
      const keyword = keywordBoost(skill, normalizedQuery, input.currentSectionId);
      return { skill, semantic, score: semantic + keyword };
    })
    // Keep semantically relevant skills, or ones the user named outright.
    .filter((candidate) => candidate.semantic >= SEMANTIC_THRESHOLD || candidate.score > candidate.semantic)
    .sort((left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name));

  return ranked.slice(0, limit).map((candidate) => candidate.skill);
}

// Keyword signal layered on top of semantic similarity: a named framework or an
// exact trigger should outrank a merely-similar one.
function keywordBoost(skill: LoadedSkill, normalizedQuery: string, currentSectionId?: string): number {
  let boost = 0;

  if (skill.triggers.some((trigger) => trigger && normalizedQuery.includes(normalizeText(trigger)))) {
    boost += 0.35;
  }
  if (skill.name && normalizedQuery.includes(normalizeText(skill.name))) {
    boost += 0.15;
  }
  if (currentSectionId && skill.applicableSections.includes(currentSectionId)) {
    boost += 0.03;
  }

  return boost;
}

// Pure-keyword ranking used when embeddings are unavailable.
function keywordRank(
  skills: LoadedSkill[],
  normalizedQuery: string,
  currentSectionId: string | undefined,
  limit: number
): LoadedSkill[] {
  return skills
    .map((skill): SkillCandidate => ({ ...skill, score: scoreSkill(skill, normalizedQuery, currentSectionId) }))
    .filter((skill) => skill.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, limit)
    .map(({ score: _score, ...skill }) => skill);
}

async function loadAllLocalSkills(projectRoot: string): Promise<LoadedSkill[]> {
  const [personalSkills, projectSkills] = await Promise.all([
    loadSkillsFromRoot(join(getPlugHomeDir(), "skills"), "personal"),
    loadSkillsFromRoot(join(projectRoot, ".plug", "skills"), "project")
  ]);

  return [...projectSkills, ...personalSkills];
}

async function loadSkillsFromRoot(root: string, source: LoadedSkill["source"]): Promise<LoadedSkill[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const loaded = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => loadSkill(join(root, entry.name, "SKILL.md"), source, entry.name))
    );

    return loaded.filter((skill): skill is LoadedSkill => Boolean(skill));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function loadSkill(path: string, source: LoadedSkill["source"], fallbackName: string): Promise<LoadedSkill | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = parseSkillMarkdown(raw);

    return {
      name: parsed.name || fallbackName || basename(path),
      description: parsed.description,
      triggers: parsed.triggers,
      applicableSections: parsed.applicableSections,
      source,
      path,
      body: parsed.body.trim()
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function parseSkillMarkdown(raw: string): {
  name: string;
  description: string;
  triggers: string[];
  applicableSections: string[];
  body: string;
} {
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontmatter = frontmatterMatch?.[1] ?? "";
  const body = frontmatterMatch ? raw.slice(frontmatterMatch[0].length) : raw;

  return {
    name: readScalar(frontmatter, "name"),
    description: readScalar(frontmatter, "description"),
    triggers: readList(frontmatter, "triggers"),
    applicableSections: readInlineOrBlockList(frontmatter, "applicableSections"),
    body
  };
}

function readScalar(frontmatter: string, key: string): string {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return stripQuotes(match?.[1]?.trim() ?? "");
}

function readList(frontmatter: string, key: string): string[] {
  const blockMatch = frontmatter.match(new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.+\\n?)+)`, "m"));

  if (!blockMatch) {
    return readInlineOrBlockList(frontmatter, key);
  }

  return blockMatch[1]
    .split("\n")
    .map((line) => stripQuotes(line.replace(/^\s+-\s+/, "").trim()))
    .filter(Boolean);
}

function readInlineOrBlockList(frontmatter: string, key: string): string[] {
  const scalar = readScalar(frontmatter, key);

  if (!scalar) {
    return [];
  }

  if (scalar.startsWith("[") && scalar.endsWith("]")) {
    return scalar
      .slice(1, -1)
      .split(",")
      .map((value) => stripQuotes(value.trim()))
      .filter(Boolean);
  }

  return [scalar];
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function scoreSkill(skill: LoadedSkill, normalizedQuery: string, currentSectionId?: string): number {
  let score = 0;

  for (const trigger of skill.triggers) {
    if (trigger && normalizedQuery.includes(normalizeText(trigger))) {
      score += 10;
    }
  }

  if (skill.name && normalizedQuery.includes(normalizeText(skill.name))) {
    score += 4;
  }

  if (skill.description && normalizedQuery.includes(normalizeText(skill.description))) {
    score += 2;
  }

  if (currentSectionId && skill.applicableSections.includes(currentSectionId)) {
    score += 1;
  }

  return score;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

// ── Semantic embedding (cached on disk) ──────────────────────────────────────

// What a skill is matched ON. A natural sentence embeds far better than a bag of
// keywords, which matters for paraphrased queries ("哪些功能先做" ≈ 优先级排序).
// Deliberately excludes the body — skill bodies share a generic template that
// would converge every framework's embedding and destroy discrimination.
function skillEmbedText(skill: LoadedSkill): string {
  return `${skill.name} 是一个产品方法。${skill.description}。它适合用来:${skill.triggers.join("、")}。`;
}

type EmbedCache = { version: number; items: Record<string, number[]> };

function embedCachePath(): string {
  return join(getPlugHomeDir(), "skills", ".embeddings.json");
}

async function loadEmbedCache(): Promise<EmbedCache> {
  try {
    const parsed = JSON.parse(await readFile(embedCachePath(), "utf8")) as EmbedCache;
    if (parsed?.version === EMBED_CACHE_VERSION && parsed.items) {
      return parsed;
    }
  } catch {
    // missing / corrupt — start fresh
  }
  return { version: EMBED_CACHE_VERSION, items: {} };
}

async function saveEmbedCache(items: Record<string, number[]>): Promise<void> {
  try {
    await mkdir(join(getPlugHomeDir(), "skills"), { recursive: true });
    await writeFile(embedCachePath(), JSON.stringify({ version: EMBED_CACHE_VERSION, items }), "utf8");
  } catch (error) {
    console.warn("[skill-service] failed to persist embedding cache:", error instanceof Error ? error.message : error);
  }
}

// Map skill.path -> embedding, computing (and caching) any that are missing.
// Keyed by a hash of the embed text so a regenerated skill re-embeds automatically.
async function ensureSkillEmbeddings(skills: LoadedSkill[]): Promise<Map<string, number[]>> {
  const cache = await loadEmbedCache();
  const result = new Map<string, number[]>();
  const nextItems: Record<string, number[]> = {};
  const missing: Array<{ path: string; hash: string; text: string }> = [];

  for (const skill of skills) {
    const text = skillEmbedText(skill);
    const hash = createHash("sha1").update(text).digest("hex");
    const cached = cache.items[hash];
    if (cached) {
      result.set(skill.path, cached);
      nextItems[hash] = cached;
    } else {
      missing.push({ path: skill.path, hash, text });
    }
  }

  if (missing.length > 0) {
    const embeddings = await generateEmbeddings(missing.map((entry) => entry.text));
    embeddings.forEach((embedding, index) => {
      if (embedding) {
        result.set(missing[index].path, embedding);
        nextItems[missing[index].hash] = embedding;
      }
    });
  }

  // Persist (also prunes stale entries) only when the set changed.
  if (missing.length > 0 || Object.keys(nextItems).length !== Object.keys(cache.items).length) {
    await saveEmbedCache(nextItems);
  }

  return result;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

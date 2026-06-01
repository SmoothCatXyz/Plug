import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { getPlugHomeDir } from "../utils/paths";

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
  const query = normalizeText(input.query);

  if (!query) {
    return [];
  }

  const skills = await loadAllLocalSkills(input.projectRoot);
  const scored = skills
    .map((skill): SkillCandidate => ({ ...skill, score: scoreSkill(skill, query, input.currentSectionId) }))
    .filter((skill) => skill.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

  return scored.slice(0, limit).map(({ score: _score, ...skill }) => skill);
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

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { streamText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateEmbedding } from "./embedding-service";
import { resolveToolProviderSecret } from "./config-service";
import { createProviderFetch } from "./network-service";

export type MemoryLayer = "core" | "episode" | "fact";

export type MemoryEntry = {
  id: string;
  projectId: string;
  content: string;
  embedding: number[] | null;
  importance: number;
  confidence: number;
  layer: MemoryLayer;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
};

const MAX_MEMORIES = 500;
const MEMORIES_FILE = ".plug/memories.json";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function loadMemories(projectRoot: string): Promise<MemoryEntry[]> {
  try {
    const raw = await readFile(join(projectRoot, MEMORIES_FILE), "utf8");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as MemoryEntry[];
  } catch {
    return [];
  }
}

export async function saveMemories(projectRoot: string, entries: MemoryEntry[]): Promise<void> {
  const plugDir = join(projectRoot, ".plug");
  await mkdir(plugDir, { recursive: true });
  await writeFile(join(projectRoot, MEMORIES_FILE), JSON.stringify(entries, null, 2), "utf8");
}

export async function addMemory(input: {
  projectRoot: string;
  projectId: string;
  content: string;
  layer: MemoryLayer;
  importance: number;
  confidence?: number;
  sessionId?: string;
}): Promise<MemoryEntry> {
  const now = new Date().toISOString();
  const embedding = await generateEmbedding(input.content);
  const entry: MemoryEntry = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId: input.projectId,
    content: input.content,
    embedding,
    importance: input.importance,
    confidence: input.confidence ?? 0.8,
    layer: input.layer,
    sessionId: input.sessionId ?? null,
    createdAt: now,
    updatedAt: now
  };

  let memories = await loadMemories(input.projectRoot);

  // Prune to cap when at limit, remove lowest importance entries
  if (memories.length >= MAX_MEMORIES) {
    memories = memories
      .sort((a, b) => b.importance - a.importance)
      .slice(0, MAX_MEMORIES - 1);
  }

  memories.push(entry);
  await saveMemories(input.projectRoot, memories);
  return entry;
}

export async function searchMemories(input: {
  projectRoot: string;
  query: string;
  topK?: number;
  minImportance?: number;
  minScore?: number;
}): Promise<Array<MemoryEntry & { score: number }>> {
  const topK = Math.max(1, Math.min(input.topK ?? 5, 12));
  const minImportance = input.minImportance ?? 0;
  const query = input.query.trim();

  if (!query) {
    return [];
  }

  // Short/casual greetings carry no semantic intent — skip memory injection entirely
  const isCasualGreeting = query.length <= 6 || /^(hi|hey|hello|yo|嗨|你好|哈喽|在吗)$/i.test(query);
  if (isCasualGreeting) {
    return [];
  }

  const memories = await loadMemories(input.projectRoot);
  const filtered = memories.filter((m) => m.importance >= minImportance);

  if (filtered.length === 0) {
    return [];
  }

  // Minimum cosine similarity required to consider a memory relevant.
  // Unrelated embeddings typically score 0.05–0.20; related ones 0.35+.
  const MIN_SEMANTIC_SCORE = input.minScore ?? 0.28;

  // Try semantic search first
  const queryEmbedding = await generateEmbedding(query);

  if (queryEmbedding !== null) {
    const scored = filtered
      .map((entry) => {
        let score = 0;

        if (entry.embedding !== null) {
          score = cosineSimilarity(queryEmbedding, entry.embedding);
        } else {
          // Fallback: substring match for entries without embeddings
          score = entry.content.toLowerCase().includes(query.toLowerCase()) ? 0.3 : 0;
        }

        return { ...entry, score };
      })
      .filter((entry) => entry.score >= MIN_SEMANTIC_SCORE)
      .sort((a, b) => b.score - a.score || b.importance - a.importance)
      .slice(0, topK);

    return scored;
  }

  // Full fallback: keyword/substring match
  const normalizedQuery = query.toLowerCase();
  const queryTerms = normalizedQuery.match(/[a-z0-9㐀-鿿_+-]{2,}/g) ?? [];

  return filtered
    .map((entry) => {
      const haystack = entry.content.toLowerCase();
      let score = 0;

      if (haystack.includes(normalizedQuery)) {
        score += 0.8;
      }

      for (const term of queryTerms) {
        if (haystack.includes(term)) {
          score += 0.1;
        }
      }

      return { ...entry, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.importance - a.importance)
    .slice(0, topK);
}

type ExtractedMemoryItem = {
  content: string;
  layer: MemoryLayer;
  importance: number;
  confidence: number;
};

export async function extractAndStoreMemories(input: {
  projectRoot: string;
  projectId: string;
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
  existingMemories: MemoryEntry[];
}): Promise<number> {
  const existingMemories = await loadMemories(input.projectRoot);

  if (input.messages.length === 0) {
    return 0;
  }

  try {
    const providerSecret = await resolveToolProviderSecret();

    if (!providerSecret.apiKey) {
      return 0;
    }

    const provider = createOpenAICompatible({
      name: providerSecret.provider.id,
      baseURL: providerSecret.provider.baseURL,
      apiKey: providerSecret.apiKey,
      fetch: createProviderFetch(providerSecret.network, {
        mode: providerSecret.provider.proxyMode,
        url: providerSecret.provider.proxyUrl
      })
    });

    const conversationText = input.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")
      .slice(0, 8000);

    const top10Existing = existingMemories
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10)
      .map((m) => `- [${m.layer}] ${m.content}`)
      .join("\n");

    // streamText (doStream), not generateText (doGenerate): the APIMart gateway
    // returns a streaming SSE body even for non-stream requests, which the
    // non-streaming JSON parser rejects ("Invalid JSON response") on every call.
    const result = streamText({
      model: provider(providerSecret.modelId),
      system:
        "You are a memory extraction assistant. Extract key facts from this conversation worth remembering long-term.",
      prompt: [
        `Conversation:\n${conversationText}`,
        "",
        `Existing memories summary:\n${top10Existing || "(none)"}`,
        "",
        "Extract 1-5 NEW facts not already in memory. For each fact:",
        "- content: the fact (1-2 sentences)",
        "- layer: core/episode/fact",
        "- importance: 0.0-1.0",
        "- confidence: 0.0-1.0",
        "",
        'Respond with JSON array: [{"content","layer","importance","confidence"}]',
        "Only output the JSON, nothing else."
      ].join("\n"),
      maxRetries: providerSecret.network.maxRetries
    });

    let responseText = "";
    for await (const delta of result.textStream) {
      responseText += delta;
    }

    let extracted: ExtractedMemoryItem[] = [];

    try {
      const jsonText = responseText.trim().replace(/^```json\s*|^```\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(jsonText);

      if (Array.isArray(parsed)) {
        extracted = parsed as ExtractedMemoryItem[];
      }
    } catch {
      // If JSON parsing fails, skip extraction
      return 0;
    }

    let added = 0;

    for (const item of extracted.slice(0, 5)) {
      if (!item.content || typeof item.content !== "string") {
        continue;
      }

      // Check for near-duplicate with existing memories
      const isDuplicate = await isDuplicateMemory(item.content, existingMemories);

      if (isDuplicate) {
        continue;
      }

      const layer: MemoryLayer =
        item.layer === "core" || item.layer === "episode" || item.layer === "fact" ? item.layer : "fact";
      const importance = typeof item.importance === "number" ? Math.max(0, Math.min(1, item.importance)) : 0.5;
      const confidence = typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : 0.7;

      await addMemory({
        projectRoot: input.projectRoot,
        projectId: input.projectId,
        content: item.content,
        layer,
        importance,
        confidence,
        sessionId: input.sessionId
      });

      added++;
    }

    if (added > 0) {
      await syncMemoryMarkdown(input.projectRoot);
    }

    return added;
  } catch (error) {
    console.error(
      "[vector-memory-service] extractAndStoreMemories failed:",
      error instanceof Error ? error.message : error
    );
    return 0;
  }
}

async function isDuplicateMemory(content: string, existing: MemoryEntry[]): Promise<boolean> {
  if (existing.length === 0) {
    return false;
  }

  const embedding = await generateEmbedding(content);

  if (embedding !== null) {
    for (const entry of existing) {
      if (entry.embedding !== null) {
        const similarity = cosineSimilarity(embedding, entry.embedding);

        if (similarity > 0.85) {
          return true;
        }
      }
    }

    return false;
  }

  // Fallback: simple substring check
  const normalizedContent = content.toLowerCase().trim();

  return existing.some((entry) => {
    const normalizedEntry = entry.content.toLowerCase().trim();
    return normalizedEntry.includes(normalizedContent) || normalizedContent.includes(normalizedEntry);
  });
}

export async function syncMemoryMarkdown(projectRoot: string): Promise<void> {
  try {
    const memories = await loadMemories(projectRoot);
    const plugDir = join(projectRoot, ".plug");
    await mkdir(plugDir, { recursive: true });

    const lines = [
      "# Memory",
      "",
      "Auto-synced from vector memory store. Do not edit manually.",
      ""
    ];

    const grouped: Record<MemoryLayer, MemoryEntry[]> = {
      core: [],
      episode: [],
      fact: []
    };

    for (const entry of memories) {
      grouped[entry.layer].push(entry);
    }

    for (const layer of ["core", "episode", "fact"] as MemoryLayer[]) {
      const layerEntries = grouped[layer].sort((a, b) => b.importance - a.importance);

      if (layerEntries.length === 0) {
        continue;
      }

      lines.push(`## ${layer.charAt(0).toUpperCase() + layer.slice(1)}`);
      lines.push("");

      for (const entry of layerEntries) {
        lines.push(`### ${entry.createdAt}`);
        lines.push(`Importance: ${entry.importance.toFixed(1)} | Confidence: ${entry.confidence.toFixed(1)}`);
        lines.push("");
        lines.push(entry.content);
        lines.push("");
      }
    }

    await writeFile(join(plugDir, "memory.md"), lines.join("\n"), "utf8");
  } catch (error) {
    console.error(
      "[vector-memory-service] syncMemoryMarkdown failed:",
      error instanceof Error ? error.message : error
    );
  }
}

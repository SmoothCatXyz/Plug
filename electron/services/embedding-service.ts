import { resolveToolProviderSecret } from "./config-service";
import { requestJsonWithRetry } from "./network-service";

type EmbeddingResult = {
  embedding: number[];
  model: string;
};

type EmbeddingApiResponse = {
  data?: Array<{
    embedding?: number[];
  }>;
  model?: string;
};

export async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const { provider, apiKey, network } = await resolveToolProviderSecret();

    if (!apiKey) {
      return null;
    }

    const response = await requestJsonWithRetry<EmbeddingApiResponse>({
      url: `${provider.baseURL.replace(/\/+$/, "")}/embeddings`,
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        input: text,
        model: "text-embedding-3-small"
      }),
      network,
      providerProxy: {
        mode: provider.proxyMode,
        url: provider.proxyUrl
      }
    });

    const embedding = response.body.data?.[0]?.embedding;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      return null;
    }

    return embedding as number[];
  } catch (error) {
    console.error("[embedding-service] generateEmbedding failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

// Batch variant — embeds many texts with as few requests as possible. Returns
// one entry per input (null where that item failed). Used to embed the whole
// skill library at once on first use, then cache.
export async function generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) {
    return [];
  }

  try {
    const { provider, apiKey, network } = await resolveToolProviderSecret();

    if (!apiKey) {
      return texts.map(() => null);
    }

    const out: (number[] | null)[] = [];
    const CHUNK = 64;

    for (let i = 0; i < texts.length; i += CHUNK) {
      const chunk = texts.slice(i, i + CHUNK);
      const response = await requestJsonWithRetry<EmbeddingApiResponse>({
        url: `${provider.baseURL.replace(/\/+$/, "")}/embeddings`,
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ input: chunk, model: "text-embedding-3-small" }),
        network,
        providerProxy: { mode: provider.proxyMode, url: provider.proxyUrl }
      });

      const data = response.body.data ?? [];
      for (let j = 0; j < chunk.length; j += 1) {
        const embedding = data[j]?.embedding;
        out.push(Array.isArray(embedding) && embedding.length > 0 ? (embedding as number[]) : null);
      }
    }

    return out;
  } catch (error) {
    console.error("[embedding-service] generateEmbeddings failed:", error instanceof Error ? error.message : error);
    return texts.map(() => null);
  }
}

export type { EmbeddingResult };

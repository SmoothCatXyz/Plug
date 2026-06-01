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

export type { EmbeddingResult };

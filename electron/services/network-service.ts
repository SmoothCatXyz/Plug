import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { RequestOptions } from "node:http";
import { ProxyAgent } from "proxy-agent";
import { Agent as UndiciAgent, ProxyAgent as UndiciProxyAgent, fetch as undiciFetch } from "undici";
import type { NetworkConfig, ProviderProxyMode, ProviderTestAttempt } from "../../shared/types";

type NetworkRequest = {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  network: NetworkConfig;
  providerProxy: {
    mode: ProviderProxyMode;
    url: string;
  };
  longTimeout?: boolean;
};

type NetworkResponse<TBody> = {
  statusCode: number;
  body: TBody;
  attempts: ProviderTestAttempt[];
};

type NetworkError = Error & {
  statusCode?: number;
  retryable?: boolean;
  attempts?: ProviderTestAttempt[];
};

type ProviderFetch = typeof fetch;

export async function requestJsonWithRetry<TBody>(request: NetworkRequest): Promise<NetworkResponse<TBody>> {
  const attempts: ProviderTestAttempt[] = [];
  const maxAttempts = request.network.maxRetries + 1;
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();

    try {
      const response = await requestJsonOnce<TBody>(request);
      const durationMs = Date.now() - attemptStartedAt;

      if (response.statusCode === 429 || response.statusCode >= 500) {
        throw markRetryable(
          new Error(`Provider returned retryable HTTP ${response.statusCode}`),
          response.statusCode
        );
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw markNonRetryable(new Error(`Provider returned HTTP ${response.statusCode}`), response.statusCode);
      }

      attempts.push({
        attempt,
        status: "success",
        durationMs,
        retryDelayMs: 0,
        message: `HTTP ${response.statusCode}`
      });

      return {
        ...response,
        attempts
      };
    } catch (error) {
      const networkError = toNetworkError(error);
      const durationMs = Date.now() - attemptStartedAt;
      const shouldRetry = Boolean(networkError.retryable) && attempt < maxAttempts;
      const retryDelayMs = shouldRetry ? getRetryDelayMs(request.network.retryBaseDelayMs, attempt) : 0;

      attempts.push({
        attempt,
        status: shouldRetry ? "retry" : "failed",
        durationMs,
        retryDelayMs,
        message: networkError.message
      });

      if (!shouldRetry) {
        networkError.attempts = attempts;
        throw networkError;
      }

      await delay(retryDelayMs);
    }
  }

  const exhausted = new Error(`Network retry loop exhausted after ${Date.now() - startedAt}ms`) as NetworkError;
  exhausted.attempts = attempts;
  throw exhausted;
}

async function requestJsonOnce<TBody>(request: NetworkRequest): Promise<{
  statusCode: number;
  body: TBody;
}> {
  const url = new URL(request.url);
  const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;
  const proxyUrl = resolveProxyUrl(request.network, request.providerProxy);
  const timeoutMs = request.longTimeout ? request.network.longTimeoutMs : request.network.timeoutMs;
  const options: RequestOptions = {
    method: request.method,
    headers: {
      ...request.headers,
      "content-length": request.body ? Buffer.byteLength(request.body).toString() : "0"
    },
    timeout: timeoutMs
  };

  if (proxyUrl) {
    options.agent = new ProxyAgent({
      getProxyForUrl: () => proxyUrl
    });
  }

  return new Promise((resolve, reject) => {
    const clientRequest = requestFn(url, options, (response) => {
      const chunks: Buffer[] = [];

      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        const statusCode = response.statusCode ?? 0;

        try {
          resolve({
            statusCode,
            body: rawBody ? (JSON.parse(rawBody) as TBody) : ({} as TBody)
          });
        } catch (error) {
          reject(markNonRetryable(error instanceof Error ? error : new Error("Invalid JSON response"), statusCode));
        }
      });
    });

    clientRequest.on("timeout", () => {
      clientRequest.destroy(markRetryable(new Error(`Request timed out after ${timeoutMs}ms`)));
    });
    clientRequest.on("error", (error) => reject(markRetryable(error)));

    if (request.body) {
      clientRequest.write(request.body);
    }

    clientRequest.end();
  });
}

export function createProviderFetch(
  network: NetworkConfig,
  providerProxy: {
    mode: ProviderProxyMode;
    url: string;
  }
): ProviderFetch {
  const proxyUrl = resolveProxyUrl(network, providerProxy);
  const dispatcher = proxyUrl
    ? new UndiciProxyAgent(proxyUrl)
    : new UndiciAgent({
        connect: {
          timeout: network.timeoutMs
        }
      });

  return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    return undiciFetch(input as never, {
      ...(init as Record<string, unknown> | undefined),
      dispatcher
    } as never) as Promise<Response>;
  }) as ProviderFetch;
}

export function resolveProxyUrl(
  network: NetworkConfig,
  providerProxy: {
    mode: ProviderProxyMode;
    url: string;
  }
): string {
  if (providerProxy.mode === "off") {
    return "";
  }

  if (providerProxy.mode === "custom") {
    return providerProxy.url;
  }

  return network.proxyMode === "off" ? "" : network.proxyUrl;
}

function getRetryDelayMs(baseDelayMs: number, attempt: number): number {
  return baseDelayMs * 2 ** (attempt - 1);
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markRetryable(error: Error, statusCode?: number): NetworkError {
  const networkError = error as NetworkError;
  networkError.retryable = true;
  networkError.statusCode = statusCode;
  return networkError;
}

function markNonRetryable(error: Error, statusCode?: number): NetworkError {
  const networkError = error as NetworkError;
  networkError.retryable = false;
  networkError.statusCode = statusCode;
  return networkError;
}

function toNetworkError(error: unknown): NetworkError {
  if (error instanceof Error) {
    return error as NetworkError;
  }

  return markRetryable(new Error("Unknown network error"));
}

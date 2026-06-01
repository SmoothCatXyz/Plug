import type { NetworkConfig, ProviderTestAttempt, ToolStreamEvent } from "../../shared/types";
import { createProviderFetch } from "./network-service";
import { getConfigSnapshot } from "./config-service";

export type WebRuntimeStrategy = {
  id: "electron-chromium-fetch";
  label: string;
  browser: "electron-chromium";
  engine: "undici-fetch-adapter";
  playwrightReady: boolean;
};

export type WebFetchResult = {
  url: string;
  finalUrl: string;
  statusCode: number;
  title: string;
  text: string;
  rawLength: number;
  attempts: ProviderTestAttempt[];
  strategy: WebRuntimeStrategy;
};

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

type WebRequestOptions = {
  url: string;
  emit?: (event: Omit<ToolStreamEvent, "invocationId" | "projectId" | "toolName" | "createdAt">) => void;
};

const USER_AGENT = "Plug/0.0 WebTool (+https://local.plug)";
const MAX_TEXT_CHARS = 24000;

export function getWebRuntimeStrategy(): WebRuntimeStrategy {
  return {
    id: "electron-chromium-fetch",
    label: "Electron Chromium fetch strategy",
    browser: "electron-chromium",
    engine: "undici-fetch-adapter",
    playwrightReady: false
  };
}

export async function fetchWebPage(options: WebRequestOptions): Promise<WebFetchResult> {
  const url = normalizeWebUrl(options.url);
  const config = await getConfigSnapshot();
  const response = await requestTextWithRetry({
    url,
    network: config.network,
    emit: options.emit
  });
  const title = extractTitle(response.body) || new URL(response.finalUrl).hostname;
  const text = extractReadableText(response.body).slice(0, MAX_TEXT_CHARS);

  return {
    url,
    finalUrl: response.finalUrl,
    statusCode: response.statusCode,
    title,
    text,
    rawLength: response.body.length,
    attempts: response.attempts,
    strategy: getWebRuntimeStrategy()
  };
}

export async function searchWeb(options: {
  query: string;
  maxResults: number;
  emit?: WebRequestOptions["emit"];
}): Promise<{
  query: string;
  searchUrl: string;
  results: WebSearchResult[];
  attempts: ProviderTestAttempt[];
  strategy: WebRuntimeStrategy;
}> {
  const query = options.query.trim();

  if (!query) {
    throw new Error("Search query cannot be empty.");
  }

  const searchUrl = buildSearchUrl(query);
  const config = await getConfigSnapshot();
  const response = await requestTextWithRetry({
    url: searchUrl,
    network: config.network,
    emit: options.emit
  });

  return {
    query,
    searchUrl,
    results: extractSearchResults(response.body, options.maxResults),
    attempts: response.attempts,
    strategy: getWebRuntimeStrategy()
  };
}

async function requestTextWithRetry(options: {
  url: string;
  network: NetworkConfig;
  emit?: WebRequestOptions["emit"];
}): Promise<{
  finalUrl: string;
  statusCode: number;
  body: string;
  attempts: ProviderTestAttempt[];
}> {
  const attempts: ProviderTestAttempt[] = [];
  const maxAttempts = options.network.maxRetries + 1;
  const providerFetch = createProviderFetch(options.network, { mode: "global", url: "" });

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    options.emit?.({
      phase: "running",
      message: `HTTP attempt ${attempt}/${maxAttempts}: ${options.url}`,
      details: { attempt, url: options.url }
    });

    try {
      const response = await fetchWithTimeout(providerFetch, options.url, options.network.timeoutMs);
      const body = await response.text();
      const durationMs = Date.now() - startedAt;

      if (response.status === 429 || response.status >= 500) {
        throw markRetryable(new Error(`HTTP ${response.status}`), response.status);
      }

      if (response.status < 200 || response.status >= 300) {
        throw markNonRetryable(new Error(`HTTP ${response.status}`), response.status);
      }

      attempts.push({
        attempt,
        status: "success",
        durationMs,
        retryDelayMs: 0,
        message: `HTTP ${response.status}`
      });

      return {
        finalUrl: response.url || options.url,
        statusCode: response.status,
        body,
        attempts
      };
    } catch (error) {
      const webError = toWebError(error);
      const durationMs = Date.now() - startedAt;
      const shouldRetry = Boolean(webError.retryable) && attempt < maxAttempts;
      const retryDelayMs = shouldRetry ? options.network.retryBaseDelayMs * 2 ** (attempt - 1) : 0;
      const attemptResult: ProviderTestAttempt = {
        attempt,
        status: shouldRetry ? "retry" : "failed",
        durationMs,
        retryDelayMs,
        message: webError.message
      };

      attempts.push(attemptResult);
      options.emit?.({
        phase: shouldRetry ? "retry" : "error",
        message: shouldRetry
          ? `Retrying after ${webError.message} in ${retryDelayMs}ms.`
          : `Request failed: ${webError.message}`,
        details: { attempt: attemptResult, attempts }
      });

      if (!shouldRetry) {
        webError.attempts = attempts;
        throw webError;
      }

      await delay(retryDelayMs);
    }
  }

  const exhausted = new Error("Web retry loop exhausted.") as WebRequestError;
  exhausted.attempts = attempts;
  throw exhausted;
}

async function fetchWithTimeout(
  providerFetch: typeof fetch,
  url: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await providerFetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5"
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildSearchUrl(query: string): string {
  const endpoint = process.env.PLUG_WEB_SEARCH_ENDPOINT?.trim();

  if (endpoint) {
    const url = new URL(endpoint);
    url.searchParams.set("q", query);
    return url.toString();
  }

  const url = new URL("https://duckduckgo.com/html/");
  url.searchParams.set("q", query);
  return url.toString();
}

function extractSearchResults(html: string, maxResults: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const resultPattern = /<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>|<div[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi;
  let match: RegExpExecArray | null;

  while ((match = resultPattern.exec(html)) && results.length < maxResults) {
    results.push({
      title: cleanupHtmlText(match[2]),
      url: normalizeSearchHref(match[1]),
      snippet: cleanupHtmlText(match[3])
    });
  }

  if (results.length) {
    return results;
  }

  const anchorPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  while ((match = anchorPattern.exec(html)) && results.length < maxResults) {
    const href = normalizeSearchHref(match[1]);
    const title = cleanupHtmlText(match[2]);

    if (!href.startsWith("http") || !title) {
      continue;
    }

    results.push({
      title,
      url: href,
      snippet: ""
    });
  }

  return results;
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanupHtmlText(match[1]) : "";
}

function extractReadableText(html: string): string {
  return cleanupHtmlText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function cleanupHtmlText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function normalizeSearchHref(href: string): string {
  try {
    const decodedHref = decodeHtmlEntities(href);
    const parsedUrl = new URL(decodedHref, "https://duckduckgo.com");
    const uddg = parsedUrl.searchParams.get("uddg");

    if (uddg) {
      return decodeURIComponent(uddg);
    }

    return parsedUrl.toString();
  } catch {
    return href;
  }
}

function normalizeWebUrl(rawUrl: string): string {
  const url = new URL(rawUrl.trim());

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Web tools only support HTTP(S): ${rawUrl}`);
  }

  return url.toString();
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}

type WebRequestError = Error & {
  retryable?: boolean;
  statusCode?: number;
  attempts?: ProviderTestAttempt[];
};

function markRetryable(error: Error, statusCode?: number): WebRequestError {
  const webError = error as WebRequestError;
  webError.retryable = true;
  webError.statusCode = statusCode;
  return webError;
}

function markNonRetryable(error: Error, statusCode?: number): WebRequestError {
  const webError = error as WebRequestError;
  webError.retryable = false;
  webError.statusCode = statusCode;
  return webError;
}

function toWebError(error: unknown): WebRequestError {
  if (error instanceof Error) {
    const webError = error as WebRequestError;
    webError.retryable ??= true;
    return webError;
  }

  return markRetryable(new Error("Unknown web request error"));
}

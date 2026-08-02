"use client";

function defaultApiBase() {
  if (typeof window === "undefined") return "http://localhost:4000";
  const { hostname, protocol } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:4000";
  if (hostname === "eaglesclub.in" || hostname === "www.eaglesclub.in") return `${protocol}//api.eaglesclub.in`;
  return `${protocol}//api.${hostname.replace(/^www\./, "")}`;
}

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || defaultApiBase();
export const API_UNAVAILABLE_MESSAGE = "Database connection failed. Please check backend database configuration.";

export type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { message: string; code?: string; retryAfterSeconds?: number } };

export class ApiError extends Error {
  constructor(message: string, public code?: string, public retryAfterSeconds?: number) {
    super(message);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function requestMethod(init?: RequestInit) {
  return (init?.method || "GET").toUpperCase();
}

function canRetryRequest(init?: RequestInit) {
  return ["GET", "HEAD", "OPTIONS"].includes(requestMethod(init));
}

type CacheEntry = { expiresAt: number; value: unknown };

const responseCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<unknown>>();
const publicGetCacheMs = 30_000;

function cacheKey(path: string, init?: RequestInit) {
  return `${requestMethod(init)}:${path}`;
}

export function clearApiCache(prefix?: string) {
  for (const key of responseCache.keys()) {
    if (!prefix || key.includes(prefix)) responseCache.delete(key);
  }
}

export async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
  const method = requestMethod(init);
  const shouldUseCache = method === "GET" && !init?.body;
  const key = shouldUseCache ? cacheKey(path, init) : "";
  if (shouldUseCache) {
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    const pending = inFlightRequests.get(key);
    if (pending) return pending as Promise<T>;
  }

  const requestPromise = requestApiNetwork<T>(path, init).then((value) => {
    if (shouldUseCache) responseCache.set(key, { value, expiresAt: Date.now() + publicGetCacheMs });
    else responseCache.clear();
    return value;
  }).finally(() => {
    if (shouldUseCache) inFlightRequests.delete(key);
  });
  if (shouldUseCache) inFlightRequests.set(key, requestPromise);
  return requestPromise;
}

async function requestApiNetwork<T>(path: string, init?: RequestInit): Promise<T> {
  let lastRateLimitError: ApiError | null = null;
  const attempts = canRetryRequest(init) ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...init,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        },
      });
    } catch {
      throw new Error(API_UNAVAILABLE_MESSAGE);
    }

    let body: ApiEnvelope<T> | null = null;
    try {
      body = (await response.json()) as ApiEnvelope<T>;
    } catch {
      throw new Error(`API ${response.status}: ${response.statusText || "Invalid response"}`);
    }

    if (response.ok && body.ok) return body.data;

    const error = body.ok ? new ApiError(`API ${response.status}: request failed`) : new ApiError(body.error.message, body.error.code, body.error.retryAfterSeconds);
    if (response.status === 429 && canRetryRequest(init) && attempt + 1 < attempts) {
      lastRateLimitError = error;
      const retryAfterSeconds = Math.max(1, Math.min(error.retryAfterSeconds || Number(response.headers.get("Retry-After")) || 1, 5));
      await delay(retryAfterSeconds * 1000);
      continue;
    }
    throw error;
  }

  if (lastRateLimitError) throw lastRateLimitError;
  throw new Error(API_UNAVAILABLE_MESSAGE);
}

export function isUnauthorized(error: unknown) {
  return error instanceof Error && /unauthorized|login|required|active|401/i.test(error.message);
}

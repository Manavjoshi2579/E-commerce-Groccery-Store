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

export async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
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

  if (!response.ok || !body.ok) {
    throw body.ok ? new ApiError(`API ${response.status}: request failed`) : new ApiError(body.error.message, body.error.code, body.error.retryAfterSeconds);
  }

  return body.data;
}

export function isUnauthorized(error: unknown) {
  return error instanceof Error && /unauthorized|login|required|active|401/i.test(error.message);
}

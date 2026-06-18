"use client";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
export const API_UNAVAILABLE_MESSAGE = "Database connection failed. Please check backend database configuration.";

export type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

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
    throw new Error(body.ok ? `API ${response.status}: request failed` : body.error.message);
  }

  return body.data;
}

export function isUnauthorized(error: unknown) {
  return error instanceof Error && /unauthorized|login|required|active|401/i.test(error.message);
}

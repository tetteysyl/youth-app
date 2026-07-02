"use client";
import { auth } from "./firebase";

/**
 * Drop-in replacement for `fetch` that automatically attaches the current
 * user's Firebase ID token as `Authorization: Bearer <token>`.
 * Falls back to a plain fetch when no user is signed in.
 */
export async function authFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  let token: string | undefined;
  try {
    token = await auth.currentUser?.getIdToken() ?? undefined;
  } catch {
    // ignore — will send unauthenticated
  }
  return fetch(input, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

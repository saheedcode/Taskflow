"use client";

// Shared HTTP client for every call to the real TaskFlow backend.
//
// - Base URL comes from NEXT_PUBLIC_API_URL (set in .env.local) — never
//   hardcode it at a call site.
// - Attaches `Authorization: Bearer <token>` automatically when a token
//   is stored, unless `skipAuth` is passed.
// - Parses the backend's standard error shape ({ "message": "..." }) and
//   throws an ApiError with that message (plus the HTTP status) attached.
// - Returns parsed JSON, or null for 204 No Content responses — per the
//   API doc, DELETE calls return no body and shouldn't be parsed as one.
// - Uses a 65s timeout, not shorter: the live backend runs on a free
//   Render instance that spins down when idle, and the first request
//   after a quiet period can take 30-60s to wake it up. A short timeout
//   here would produce false failures on cold start, not real ones.

const TOKEN_KEY = "tf_token";
const USER_KEY = "tf_user";
const SESSION_COOKIE = "tf_has_session";
const REQUEST_TIMEOUT_MS = 65_000;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Exported so lib/socket.js can point socket.io at the same backend
// apiFetch talks to, instead of duplicating/hardcoding it.
export function getBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
}

// ---- Token + user persistence (localStorage — the real credential) ----

export function getToken() {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage unavailable (private browsing, quota) — the session just
    // won't persist across reloads; nothing else to do here.
  }
}

export function clearToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

export function getStoredUser() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // See note in setToken above.
  }
}

export function clearStoredUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
}

// ---- Session-presence cookie, for middleware only ----
//
// middleware.js runs on the edge and can't read localStorage, so it can't
// see the real JWT to decide whether a route should be gated. Login/signup
// also set this lightweight, non-httpOnly cookie purely as a "some session
// exists" flag; the JWT itself never goes in a cookie and is only ever
// attached to API calls from apiFetch below.

export function setSessionCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

export function clearSessionCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
}

// ---- Global "your session is gone" handling ----
//
// A 401 means two different things depending on which call produced it:
//   - On a call that attached a bearer token (i.e. an authenticated call):
//     the token is missing/invalid/expired per the doc's 7-day expiry.
//     This is a session problem, not a per-form error — every call site
//     would otherwise have to remember to check for it and redirect.
//   - On a call made with `skipAuth` (login, signup, forgot/reset-password,
//     verify-email): a 401 there just means "wrong credentials" or
//     "invalid token", which the calling form already displays inline.
//     This must NOT trigger a global logout — there's no session yet to
//     lose, and redirecting mid-submit would stomp on the form's own error
//     state.
//
// So only calls that actually attached a token participate in this.
function handleSessionExpired() {
  clearToken();
  clearStoredUser();
  clearSessionCookie();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tf:session-expired"));
  }
}

/**
 * Fetch wrapper for every backend call.
 *
 * @param {string} path - e.g. "/api/boards/123"
 * @param {object} options - standard fetch options, plus:
 *   - body: a plain object (auto-JSON-encoded) or a string/FormData (sent as-is)
 *   - skipAuth: don't attach the Authorization header even if a token exists
 */
export async function apiFetch(path, options = {}) {
  const { headers, body, skipAuth, ...rest } = options;

  const finalHeaders = { ...(headers || {}) };
  const token = getToken();
  if (token && !skipAuth) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  let finalBody = body;
  if (body && typeof body !== "string" && !(body instanceof FormData)) {
    finalHeaders["Content-Type"] = "application/json";
    finalBody = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: finalBody,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ApiError(
        "The server is taking longer than expected to wake up. Please try again in a moment.",
        0
      );
    }
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 204) {
    return null;
  }

  let data = null;
  const raw = await response.text();
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      // Non-JSON body on an otherwise-ok response — leave data as null.
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token && !skipAuth) {
      // Authenticated call, rejected as unauthorized -> the token itself
      // is the problem (expired/invalid), not this one request. Clear the
      // stale session and let the global listener (see
      // components/SessionExpiryWatcher.js) redirect to /login, instead of
      // leaving whichever component made this call stuck on a generic
      // error state.
      handleSessionExpired();
    }
    throw new ApiError(data?.message || `Request failed (${response.status}).`, response.status);
  }

  return data;
}

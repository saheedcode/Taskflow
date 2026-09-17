"use client";

// Real auth layer, backed by the TaskFlow backend (see API doc).
//
// Call sites (login/signup/forgot/reset pages, AppShell) keep the same
// function names and shapes that the old mock layer used, so this is a
// drop-in replacement — signUp/logIn now hit the network instead of
// localStorage, but still resolve to a plain public-user object.

import {
  apiFetch,
  ApiError,
  getToken,
  setToken,
  clearToken,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  setSessionCookie,
  clearSessionCookie,
} from "./apiClient";

// Extends ApiError (not just Error) so it still carries a real `status`
// and still satisfies `err instanceof ApiError` — lib/errorMessages.js's
// describeApiError() keys off that check, and auth call sites should be
// able to use the same status-keyed error pattern used everywhere else
// in this app, not a special case just because the auth layer wraps its
// errors in a differently-named class.
export class AuthError extends ApiError {
  constructor(message, status) {
    super(message, status);
    this.name = "AuthError";
  }
}

function initials(name) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

// The backend's user object is { id, name, email, avatarUrl }, plus
// emailVerified on the signup response. Normalize to the shape the UI
// already expects (adds `initials`, defaults emailVerified to false
// rather than undefined so banner logic can check it directly).
function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    initials: initials(user.name),
    avatarUrl: user.avatarUrl || null,
    emailVerified: Boolean(user.emailVerified),
  };
}

function persistSession(user, token) {
  setToken(token);
  setStoredUser(user);
  setSessionCookie();
}

function broadcastSessionUpdate(user) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tf:session-updated", { detail: user }));
  }
}

// Auth endpoints that don't take a bearer token (signup/login/forgot/reset
// all say "No auth required" in the doc) and that report errors via
// AuthError specifically, since these are all form-submission flows.
async function publicAuthRequest(path, body) {
  try {
    return await apiFetch(path, { method: "POST", body, skipAuth: true });
  } catch (err) {
    if (err instanceof ApiError) throw new AuthError(err.message, err.status);
    throw err;
  }
}

export async function signUp({ name, email, password }) {
  const data = await publicAuthRequest("/api/auth/signup", { name, email, password });
  const user = toPublicUser(data.user);
  persistSession(user, data.token);
  return user;
}

export async function logIn({ email, password }) {
  // Note: the backend has no separate "remember me" concept — the token
  // is always valid for 7 days per the doc. `remember` used to control a
  // longer-lived mock cookie; there's nothing to differentiate anymore,
  // so it's accepted but ignored. Flag to backend if a shorter/longer
  // session option is actually wanted.
  const data = await publicAuthRequest("/api/auth/login", { email, password });
  const user = toPublicUser(data.user);
  persistSession(user, data.token);
  return user;
}

export function logOut() {
  // No backend logout/session-invalidation endpoint exists in the API
  // doc — the JWT is stateless and simply expires after 7 days. This
  // only clears local state. Flag to backend if server-side token
  // revocation is ever needed (e.g. "log out of all devices").
  clearToken();
  clearStoredUser();
  clearSessionCookie();
}

// Synchronous, for first paint — reads whatever was cached from the last
// successful login/signup/refresh so there's no flash of logged-out UI
// while refreshSession() below is in flight. Can be stale; call
// refreshSession() to confirm/update it.
export function getSession() {
  if (typeof window === "undefined") return null;
  if (!getToken()) return null;
  return getStoredUser();
}

// Revalidates against GET /api/auth/me. Use this on app-shell mount to
// confirm the stored token is still valid and to pick up server-side
// changes (e.g. emailVerified flipping to true after the user clicks the
// verification link in another tab).
export async function refreshSession() {
  if (!getToken()) return null;
  try {
    const data = await apiFetch("/api/auth/me");
    const user = toPublicUser(data.user);
    setStoredUser(user);
    broadcastSessionUpdate(user);
    return user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      // Token missing/invalid/expired — the doc's 401 case. Clear local
      // state so the UI doesn't keep treating the user as logged in.
      logOut();
    }
    return null;
  }
}

export async function resendVerificationEmail() {
  // Auth required (per doc) — goes through apiFetch directly (not
  // publicAuthRequest) so the bearer token gets attached.
  try {
    return await apiFetch("/api/auth/resend-verification", { method: "POST" });
  } catch (err) {
    if (err instanceof ApiError) throw new AuthError(err.message, err.status);
    throw err;
  }
}

export async function requestPasswordReset(email) {
  // Always resolves the same way whether or not the account exists —
  // that's the backend's behavior too (always 200), so there's nothing
  // to branch on here.
  await publicAuthRequest("/api/auth/forgot-password", { email });
  return true;
}

export async function resetPassword({ token, password }) {
  await publicAuthRequest("/api/auth/reset-password", { token, newPassword: password });
  return true;
}

// ---- Profile + avatar ----
//
// Backed by PATCH /api/user/profile and POST/DELETE /api/user/avatar.
// None of these responses include `emailVerified` (that field only comes
// back from signup/login/me), so merge into the current cached user
// rather than rebuilding it from scratch — otherwise a profile save would
// silently reset emailVerified to false.

function applyUserPatch(user) {
  const current = getStoredUser();
  const updated = {
    ...current,
    id: user.id,
    name: user.name,
    email: user.email,
    initials: initials(user.name),
    avatarUrl: user.avatarUrl || null,
  };
  setStoredUser(updated);
  broadcastSessionUpdate(updated);
  return updated;
}

export async function updateProfile({ name }) {
  if (!getStoredUser()) throw new AuthError("You've been signed out. Log in again.");
  try {
    const data = await apiFetch("/api/user/profile", { method: "PATCH", body: { name } });
    return applyUserPatch(data.user);
  } catch (err) {
    if (err instanceof ApiError) throw new AuthError(err.message, err.status);
    throw err;
  }
}

// `file` is a raw File from an <input type="file"> — sent as
// multipart/form-data with field name exactly "avatar" per the doc.
// Client-side we only validate type/size (see lib/imageUtils.js); the
// backend does the actual 400x400 crop, so there's nothing to resize
// here.
export async function uploadAvatar(file) {
  if (!getStoredUser()) throw new AuthError("You've been signed out. Log in again.");
  const formData = new FormData();
  formData.append("avatar", file);
  try {
    const data = await apiFetch("/api/user/avatar", { method: "POST", body: formData });
    return applyUserPatch(data.user);
  } catch (err) {
    if (err instanceof ApiError) throw new AuthError(err.message, err.status);
    throw err;
  }
}

// Idempotent per the doc — safe to call even with no avatar currently set.
export async function removeAvatar() {
  if (!getStoredUser()) throw new AuthError("You've been signed out. Log in again.");
  try {
    const data = await apiFetch("/api/user/avatar", { method: "DELETE" });
    return applyUserPatch(data.user);
  } catch (err) {
    if (err instanceof ApiError) throw new AuthError(err.message, err.status);
    throw err;
  }
}

// Shared helper for turning a caught error into copy a person should see.
//
// Every mutation in this app should key its error message off `err.status`
// (a real HTTP status code from lib/apiClient.js's ApiError), not off
// string-matching `err.message` — status codes are stable across backend
// wording changes, message text isn't. This is the one place that pattern
// lives, so call sites stay short:
//
//   import { describeApiError } from "@/lib/errorMessages";
//   ...
//   catch (err) {
//     setError(describeApiError(err, {
//       403: "You don't have permission to do that.",
//       404: "That card doesn't exist anymore — refresh the board.",
//       409: "That's already been taken. Refresh and try again.",
//     }));
//   }
//
// Only pass the statuses a given endpoint's doc section actually says can
// happen — don't pre-fill 403/409/etc "just in case" for an endpoint the
// doc doesn't document those for.

import { ApiError } from "./apiClient";

const DEFAULT_STATUS_MESSAGES = {
  400: "That request wasn't valid. Double-check the details and try again.",
  401: "You've been signed out. Log in again to continue.",
  403: "You don't have permission to do that.",
  404: "That couldn't be found — it may have been deleted or moved.",
  409: "That conflicts with something that already exists.",
  500: "Something went wrong on our end. Try again in a moment.",
};

// A network-level failure (timeout, offline, cold-start abort) surfaces as
// status 0 from apiClient.js, with a message already written for people
// (not a generic label) — always prefer that over any generic fallback.
const NETWORK_FAILURE_STATUS = 0;

/**
 * @param {unknown} err - whatever was caught
 * @param {Record<number, string>} statusMessages - per-status overrides
 *   specific to the call that failed; checked before the generic defaults
 *   above, since "couldn't be found" means something different for a
 *   workspace than it does for a comment.
 * @param {string} [fallback] - used only if nothing else matches (err
 *   isn't an ApiError at all, or its status isn't covered anywhere).
 */
export function describeApiError(err, statusMessages = {}, fallback = "Something went wrong. Try again.") {
  if (err instanceof ApiError) {
    if (err.status === NETWORK_FAILURE_STATUS) {
      return err.message || fallback;
    }
    if (statusMessages[err.status]) {
      return statusMessages[err.status];
    }
    if (DEFAULT_STATUS_MESSAGES[err.status]) {
      return DEFAULT_STATUS_MESSAGES[err.status];
    }
    // A real status the doc didn't specifically document a message for —
    // still better to show the backend's own message than a bare fallback.
    return err.message || fallback;
  }
  return err?.message || fallback;
}

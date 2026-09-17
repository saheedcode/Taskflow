// Client-side validation for a picked avatar file — type and size only.
// The backend does the actual work (crop to 400x400, store, host the
// result), so there's no canvas/resize/compression pipeline here anymore;
// this just fails fast with a friendly message before the file goes over
// the network.

const MAX_FILE_BYTES = 5 * 1024 * 1024; // matches the backend's 5MB limit
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export class AvatarImageError extends Error {}

/**
 * Throws AvatarImageError with a user-facing message if `file` isn't an
 * accepted image type or is over the size limit. Returns nothing on
 * success — callers upload the original File as-is.
 */
export function validateAvatarFile(file) {
  if (!file) throw new AvatarImageError("No file selected.");
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new AvatarImageError("Please choose an image file (PNG, JPG, GIF, or WebP).");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new AvatarImageError("That image is too large. Please choose one under 5MB.");
  }
}

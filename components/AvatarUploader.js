"use client";

import { useEffect, useRef, useState } from "react";
import AvatarCircle from "./AvatarCircle";
import { validateAvatarFile, AvatarImageError } from "@/lib/imageUtils";
import { describeApiError } from "@/lib/errorMessages";

/**
 * Self-contained "change your photo" control: pick a file, validate it
 * client-side (type + size only — the backend crops it to a 400x400
 * square), preview it immediately via an object URL, and hand the raw
 * File to `onSave` to upload. Also offers removing the photo back to
 * initials (`onSave(null)`).
 */
export default function AvatarUploader({ avatarUrl, initials, onSave }) {
  const [preview, setPreview] = useState(avatarUrl || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const objectUrlRef = useRef(null);

  // Once a save round-trips and the parent's `avatarUrl` prop updates
  // (the real, backend-hosted URL), drop any local object-URL preview in
  // favor of it, and clean up the object URL we created.
  useEffect(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreview(avatarUrl || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarUrl]);

  // Clean up on unmount too, in case a save is still in flight.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    // Let the same file be picked again later (e.g. after removing it).
    e.target.value = "";
    if (!file) return;

    setError("");
    try {
      validateAvatarFile(file);
    } catch (err) {
      setError(err instanceof AvatarImageError ? err.message : "Please choose a valid image.");
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setPreview(objectUrl);

    setSaving(true);
    try {
      await onSave(file);
    } catch (err) {
      setError(describeApiError(err, {}, "Couldn't update your photo."));
      // Revert to whatever's actually on the account.
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setPreview(avatarUrl || null);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setError("");
    setSaving(true);
    try {
      await onSave(null);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setPreview(null);
    } catch (err) {
      setError(describeApiError(err, {}, "Couldn't remove your photo. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        <AvatarCircle avatarUrl={preview} initials={initials} size="lg" />
        {saving ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink-900/40">
            <Spinner />
          </span>
        ) : null}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={saving}
            className="rounded-card border border-border bg-surface px-3 py-1.5 text-[14.5px] font-medium text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-60"
          >
            {preview ? "Change photo" : "Upload photo"}
          </button>
          {preview ? (
            <button
              type="button"
              onClick={handleRemove}
              disabled={saving}
              className="text-[14.5px] font-medium text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              Remove
            </button>
          ) : null}
        </div>
        <p className="mt-1.5 text-[13.5px] text-ink-faint">
          PNG, JPG, GIF, or WebP, up to 5MB. We&rsquo;ll crop it to a square.
        </p>
        {error ? <p className="mt-1 text-[13.5px] text-danger">{error}</p> : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="sr-only"
          aria-label="Upload profile photo"
        />
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-6 w-6 animate-spin text-white" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

"use client";

import { useState } from "react";

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
  minLength,
  hint,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1.5 block text-[14.5px] font-medium text-ink">
        {label}
      </span>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={minLength}
          required
          aria-invalid={Boolean(error)}
          className={`w-full rounded-card border bg-surface px-3 py-2.5 pr-10 text-[15px] text-ink placeholder:text-ink-faint focus:border-accent ${
            error ? "border-danger" : "border-border"
          }`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {error ? (
        <p className="mt-1.5 text-[13.5px] text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[13.5px] text-ink-faint">{hint}</p>
      ) : null}
    </label>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 3l18 18M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a15.6 15.6 0 0 1-3.4 4.3M6.6 6.6C4.2 8.1 2 12 2 12s3.5 7 10 7c1.4 0 2.6-.3 3.7-.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.9 9.9a3 3 0 0 0 4.2 4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

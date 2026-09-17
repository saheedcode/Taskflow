"use client";

// NOTE ON WHAT CHANGED HERE:
// This page previously drove a 6-digit OTP flow (request -> OtpVerifyModal
// -> NewPasswordForm), backed by a separate mock Next.js API + in-memory
// otpStore under app/api/auth/*. The real backend's forgot-password flow
// is link-based, not OTP: POST /api/auth/forgot-password always returns
// 200 and emails a link (if the account exists) straight to
// /reset-password?token=..., which app/reset-password/page.js already
// handles. There's no backend endpoint for issuing/checking a 6-digit
// code, so rather than inventing one, this page now just triggers that
// email and shows a "check your inbox" confirmation - the OTP modal step
// is gone. The now-unused OTP-only files (components/auth/OtpVerifyModal.js,
// OtpInput.js, hooks/useCountdown.js, lib/passwordResetApi.js, lib/otpStore.js,
// app/api/auth/{forgot-password,verify-otp,reset-password}/route.js) have
// been removed.

import { useState } from "react";
import AuthLayout from "@/components/AuthLayout";
import ErrorBanner from "@/components/ErrorBanner";
import { requestPasswordReset } from "@/lib/auth";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    setFieldError("");
    setSubmitting(true);
    try {
      await requestPasswordReset(trimmed);
      setSent(true);
    } catch (err) {
      setFormError(err.message || "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout
        eyebrow="Forgot password"
        title="Check your email"
        subtitle={`If an account exists for ${email.trim()}, a reset link is on its way. It's valid for 1 hour.`}
        footer={
          <>
            Didn't get it?{" "}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="font-medium text-accent-dark hover:underline"
            >
              Try again
            </button>
          </>
        }
      >
        <a
          href="/login"
          className="flex w-full items-center justify-center rounded-card bg-accent py-2.5 text-[15px] font-medium text-white hover:bg-accent-dark"
        >
          Back to login
        </a>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Forgot password"
      title="Reset your password"
      subtitle="Enter the email on your account and we'll send you a link to reset your password."
      footer={
        <>
          Remembered it?{" "}
          <a href="/login" className="font-medium text-accent-dark hover:underline">
            Log in
          </a>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <ErrorBanner message={formError} />

        <label className="block" htmlFor="email">
          <span className="mb-1.5 block text-[14.5px] font-medium text-ink">Email</span>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldError) setFieldError("");
            }}
            placeholder="you@company.com"
            autoComplete="email"
            aria-invalid={Boolean(fieldError)}
            className={`w-full rounded-card border bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-accent ${
              fieldError ? "border-danger" : "border-border"
            }`}
          />
          {fieldError ? <p className="mt-1.5 text-[13.5px] text-danger">{fieldError}</p> : null}
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-card bg-accent py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <Spinner /> : null}
          {submitting ? "Sending..." : "Send reset link"}
        </button>
      </form>
    </AuthLayout>
  );
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

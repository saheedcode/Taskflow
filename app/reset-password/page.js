"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import PasswordField from "@/components/PasswordField";
import ErrorBanner from "@/components/ErrorBanner";
import { resetPassword } from "@/lib/auth";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthLayout
        eyebrow="Reset password"
        title="This link isn't valid"
        subtitle="Reset links expire after 1 hour, or this one may already have been used."
      >
        <a
          href="/forgot-password"
          className="flex w-full items-center justify-center rounded-card bg-accent py-2.5 text-[15px] font-medium text-white hover:bg-accent-dark"
        >
          Request a new link
        </a>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout
        eyebrow="Password reset"
        title="You're all set"
        subtitle="Your password has been updated. Log in with your new password."
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

  function validate() {
    const errors = {};
    if (password.length < 8) {
      errors.password = "Use at least 8 characters.";
    }
    if (confirmPassword !== password) {
      errors.confirmPassword = "Passwords don't match.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      await resetPassword({ token, password });
      setDone(true);
    } catch (err) {
      setFormError(err.message || "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Reset password"
      title="Choose a new password"
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <ErrorBanner message={formError} />

        <PasswordField
          id="password"
          label="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          error={fieldErrors.password}
          hint={!fieldErrors.password ? "At least 8 characters." : undefined}
        />
        <PasswordField
          id="confirmPassword"
          label="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter your new password"
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
        />

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-card bg-accent py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <Spinner /> : null}
          {submitting ? "Saving..." : "Reset password"}
        </button>
      </form>
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
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

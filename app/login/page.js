"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import PasswordField from "@/components/PasswordField";
import ErrorBanner from "@/components/ErrorBanner";
import { logIn } from "@/lib/auth";
import { describeApiError } from "@/lib/errorMessages";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/workspace";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(
    searchParams.get("sessionExpired") ? "Your session expired. Log in again to continue." : ""
  );
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      errors.email = "Enter a valid email address.";
    }
    if (!password) {
      errors.password = "Enter your password.";
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
      await logIn({ email, password, remember });
      router.push(next);
    } catch (err) {
      // 401 covers both wrong email and wrong password — the backend may
      // word these differently, but showing the same message either way
      // avoids confirming whether an email is registered.
      setFormError(
        describeApiError(err, { 401: "Incorrect email or password." })
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Log in to TaskFlow"
      footer={
        <>
          New here?{" "}
          <a href="/signup" className="font-medium text-accent-dark hover:underline">
            Create an account
          </a>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <ErrorBanner message={formError} />

        <label className="block" htmlFor="email">
          <span className="mb-1.5 block text-[14.5px] font-medium text-ink">
            Email
          </span>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            aria-invalid={Boolean(fieldErrors.email)}
            className={`w-full rounded-card border bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-accent ${
              fieldErrors.email ? "border-danger" : "border-border"
            }`}
          />
          {fieldErrors.email ? (
            <p className="mt-1.5 text-[13.5px] text-danger">{fieldErrors.email}</p>
          ) : null}
        </label>

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          error={fieldErrors.password}
        />

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 text-[14.5px] text-ink-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
            />
            Remember me
          </label>
          <a
            href="/forgot-password"
            className="text-[14.5px] font-medium text-accent-dark hover:underline"
          >
            Forgot password?
          </a>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-card bg-accent py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <Spinner /> : null}
          {submitting ? "Logging in..." : "Log in"}
        </button>

        <p className="pt-1 text-center text-[13.5px] text-ink-faint">
          Demo account: demo@taskflow.dev / password123
        </p>
      </form>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-white"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

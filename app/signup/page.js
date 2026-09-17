"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import PasswordField from "@/components/PasswordField";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import ErrorBanner from "@/components/ErrorBanner";
import { signUp } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const errors = {};
    if (name.trim().length < 2) {
      errors.name = "Enter your full name.";
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      errors.email = "Enter a valid email address.";
    }
    if (password.length < 8) {
      errors.password = "Use at least 8 characters.";
    }
    if (confirmPassword !== password) {
      errors.confirmPassword = "Passwords don't match.";
    }
    if (!agreed) {
      errors.agreed = "You need to agree to continue.";
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
      await signUp({ name: name.trim(), email, password });
      router.push("/workspace");
    } catch (err) {
      setFormError(err.message || "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Get started"
      title="Create your account"
      subtitle="Free for teams up to 5 people, no card required."
      footer={
        <>
          Already have an account?{" "}
          <a href="/login" className="font-medium text-accent-dark hover:underline">
            Log in
          </a>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <ErrorBanner message={formError} />

        <Field
          id="name"
          label="Full name"
          type="text"
          placeholder="Maya Odukoya"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />
        <Field
          id="email"
          label="Work email"
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <div>
          <PasswordField
            id="password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            error={fieldErrors.password}
            hint={!fieldErrors.password ? "At least 8 characters." : undefined}
          />
          {/* Display-only — doesn't block submission. The API doc only
              specifies an 8-character minimum, so these extra checklist
              items (uppercase/lowercase/number/symbol) are guidance, not
              enforced requirements. Flagged for confirmation. */}
          <PasswordStrengthMeter password={password} />
        </div>
        <PasswordField
          id="confirmPassword"
          label="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter your password"
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
        />

        <div>
          <label className="flex items-start gap-2 text-[14px] leading-relaxed text-ink-muted">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
            />
            I agree to TaskFlow's Terms of Service and Privacy Policy.
          </label>
          {fieldErrors.agreed ? (
            <p className="mt-1 text-[13.5px] text-danger">{fieldErrors.agreed}</p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-card bg-accent py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <Spinner /> : null}
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}

function Field({ id, label, error, ...props }) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1.5 block text-[14.5px] font-medium text-ink">{label}</span>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        className={`w-full rounded-card border bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-accent ${
          error ? "border-danger" : "border-border"
        }`}
        {...props}
      />
      {error ? <p className="mt-1.5 text-[13.5px] text-danger">{error}</p> : null}
    </label>
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

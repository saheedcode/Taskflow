"use client";

// Destination for the link in the verification email. FRONTEND_URL on the
// backend needs to be configured to point at this route (e.g.
// https://yourapp.com/verify-email) so the emailed link lands here with
// ?token=... in the query string.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import { apiFetch, ApiError } from "@/lib/apiClient";

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState(token ? "verifying" : "missing");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch("/api/auth/verify-email", { method: "POST", body: { token }, skipAuth: true })
      .then(() => {
        if (!cancelled) setStatus("success");
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(
          err instanceof ApiError
            ? err.message
            : "This link is invalid or has expired."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === "missing") {
    return (
      <AuthLayout
        eyebrow="Verify email"
        title="Missing verification link"
        subtitle="This page needs a token in the URL — open the link from your verification email again, or request a new one from inside the app."
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

  if (status === "verifying") {
    return (
      <AuthLayout eyebrow="Verify email" title="Verifying your email..." subtitle="Just a moment.">
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      </AuthLayout>
    );
  }

  if (status === "success") {
    return (
      <AuthLayout
        eyebrow="Verify email"
        title="Email verified"
        subtitle="Your email address is confirmed. You're all set."
      >
        <a
          href="/workspace"
          className="flex w-full items-center justify-center rounded-card bg-accent py-2.5 text-[15px] font-medium text-white hover:bg-accent-dark"
        >
          Continue to TaskFlow
        </a>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Verify email"
      title="This link isn't valid"
      subtitle={message || "It may have expired (links last 24 hours) or already been used."}
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

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}

function Spinner() {
  return (
    <svg className="h-8 w-8 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

"use client";

import { useEffect } from "react";
import LogoMark from "@/components/Logo";

export default function ErrorBoundary({ error, reset }) {
  useEffect(() => {
    // Non-fatal: surface it in dev tools console so it's not silently
    // swallowed. A real backend would report this to an error tracker.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
      <LogoMark size={30} />
      <div>
        <p className="font-display text-[14.5px] font-bold uppercase tracking-wide text-danger">
          Something went wrong
        </p>
        <h1 className="mt-1 font-display text-xl font-semibold text-ink">
          This page hit an unexpected error
        </h1>
        <p className="mx-auto mt-1.5 max-w-sm text-[15px] text-ink-muted">
          Your data is safe — this is just a display error. Try again, or
          head back to your workspace.
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-card bg-accent px-4 py-2 text-[14.5px] font-semibold text-white transition-colors hover:bg-accent-dark"
        >
          Try again
        </button>
        <a
          href="/workspace"
          className="rounded-card border border-border bg-surface px-4 py-2 text-[14.5px] font-semibold text-ink transition-colors hover:bg-canvas"
        >
          Back to workspace
        </a>
      </div>
    </div>
  );
}

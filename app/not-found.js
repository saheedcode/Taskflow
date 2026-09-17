import Link from "next/link";
import LogoMark from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
      <LogoMark size={30} />
      <div>
        <p className="font-display text-[14.5px] font-bold uppercase tracking-wide text-ink-faint">
          404
        </p>
        <h1 className="mt-1 font-display text-xl font-semibold text-ink">
          We couldn&apos;t find that page
        </h1>
        <p className="mx-auto mt-1.5 max-w-sm text-[15px] text-ink-muted">
          It may have been moved, or the link might be out of date. Check the
          URL, or head back to your boards.
        </p>
      </div>
      <Link
        href="/workspace"
        className="rounded-card bg-accent px-4 py-2 text-[14.5px] font-semibold text-white transition-colors hover:bg-accent-dark"
      >
        Back to your workspace
      </Link>
    </div>
  );
}

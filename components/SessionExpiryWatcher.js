"use client";

// Mounted once, in the root layout, so it's alive on every route — not
// just the ones wrapped in AppShell. lib/apiClient.js dispatches
// "tf:session-expired" the moment any authenticated call comes back 401
// (see handleSessionExpired() there) and has already cleared the stale
// token/user/session-cookie by the time this fires; this component's only
// job is the navigation.
//
// Renders nothing — it's a listener, not UI.

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const AUTH_PAGES = ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"];

export default function SessionExpiryWatcher() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function onSessionExpired() {
      // Already on an auth page (e.g. a stray call fired right as someone
      // landed on /login) — nothing to redirect away from.
      if (AUTH_PAGES.some((p) => pathname?.startsWith(p))) return;
      const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login?sessionExpired=1${next ? `&${next.slice(1)}` : ""}`);
    }

    window.addEventListener("tf:session-expired", onSessionExpired);
    return () => window.removeEventListener("tf:session-expired", onSessionExpired);
  }, [router, pathname]);

  return null;
}

import { NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/workspace", "/board", "/search", "/notifications", "/members", "/settings"];
const AUTH_PAGES = ["/login", "/signup", "/forgot-password", "/reset-password"];

export function middleware(request) {
  const { pathname } = request.nextUrl;
  // The real JWT lives in localStorage (edge middleware can't read that),
  // so login/signup also set this lightweight, non-httpOnly presence
  // cookie purely so middleware can gate routes. See lib/apiClient.js.
  const hasSession = Boolean(request.cookies.get("tf_has_session")?.value);

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isAuthPage = AUTH_PAGES.some((prefix) => pathname.startsWith(prefix));

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/workspace";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/workspace/:path*",
    "/board/:path*",
    "/search/:path*",
    "/notifications/:path*",
    "/members/:path*",
    "/settings/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ],
};

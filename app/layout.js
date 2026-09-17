import { Sora, Inter } from "next/font/google";
import "./globals.css";
import SessionExpiryWatcher from "@/components/SessionExpiryWatcher";
import { NO_FLASH_SCRIPT } from "@/lib/themeConstants";

const sora = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-sora",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: {
    default: "TaskFlow — Real-time collaborative project management",
    template: "%s · TaskFlow",
  },
  description: "Organize work into boards, lists, and cards with real-time updates for small teams.",
  applicationName: "TaskFlow",
  // Swap this for the real deployed origin once one exists — needed for
  // absolute URLs in generated metadata (OpenGraph, sitemaps, etc).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  icons: {
    icon: "/icon.svg",
  },
  robots: {
    // Nothing to index yet — this is a signed-in app, not a marketing
    // site. Flip this once there's public-facing content worth indexing.
    index: false,
    follow: false,
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#3457D5" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0C16" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable}`}>
      <head>
        {/* Sets the .dark class on <html> before first paint, based on
            an explicit stored choice or the OS preference — see
            lib/themeConstants.js. Must run here (blocking, in <head>),
            not from a mounted component, or a dark-mode visitor would
            see a flash of the light theme before React hydrates. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        {/* Listens app-wide for an expired/invalid token and redirects to
            /login; see lib/apiClient.js's handleSessionExpired(). Renders
            nothing itself. */}
        <SessionExpiryWatcher />
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Hanken Grotesk — the Akaya app's own typeface (akaya_ai/assets/fonts),
// self-hosted by next/font so it respects the /Admin basePath and never
// depends on a third-party font CDN.
const hanken = localFont({
  src: [
    { path: "../design/fonts/HankenGrotesk-Regular.ttf", weight: "400", style: "normal" },
    { path: "../design/fonts/HankenGrotesk-Medium.ttf", weight: "500", style: "normal" },
    { path: "../design/fonts/HankenGrotesk-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../design/fonts/HankenGrotesk-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Akaya Console",
  description: "Akaya AI — enterprise administration console",
  icons: {
    icon: { url: "/Admin/akaya-favicon.png", type: "image/png", sizes: "192x192" },
    apple: { url: "/Admin/akaya-favicon.png", sizes: "192x192" },
  },
  robots: { index: false, follow: false },
};

// Runs before first paint so the page never flashes the wrong theme.
// Preference is per-operator (localStorage) — a convenience, not state.
const THEME_BOOT = `(function(){try{var p=localStorage.getItem('akaya-console-theme')||'light';var t=p==='rose'?'rose':(p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches))?'dark':'light';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={hanken.variable} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

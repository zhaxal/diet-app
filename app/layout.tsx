import type { Metadata, Viewport } from "next";
import PageTransition from "@/components/PageTransition";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "rationd",
  description: "Track calories and macros. API-first, MCP & AI-ready.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // Not "black-translucent". That style paints the status bar transparent over
    // the content *and* forces white glyphs — unreadable on the light theme's
    // #eceef1 — and it is what pushed the web view under the Dynamic Island in
    // the first place. "default" lets iOS inset the view below the status bar
    // and pick legible glyphs for the theme-color underneath it. Nothing in this
    // app bleeds to the top edge, so there is nothing to gain from going under.
    statusBarStyle: "default",
    title: "rationd",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    // A PNG, not the SVG. iOS ignores an SVG apple-touch-icon outright and
    // falls back to a screenshot of the page, which is what the home-screen
    // icon had been all along.
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom stays available. The annotation layer is 11px, and blocking pinch-zoom
  // removes the only compensation a presbyopic user has in a bright kitchen.
  // Kept: the home indicator and the landscape notch still need real insets,
  // which body pads for. It is safe now that the top inset is honoured too.
  viewportFit: "cover",
};

// The status bar strip takes its colour from theme-color. A media query on
// prefers-color-scheme would be wrong here: the theme is a class this app sets
// from localStorage, so forcing light on a dark phone painted the strip black
// above a light page. One meta, kept in step with the class that actually won.
const THEME_COLOR = { light: "#eceef1", dark: "#090c11" } as const;

// Apply the saved/system theme before first paint to avoid a flash, and point
// theme-color at the same answer so the iOS status bar strip matches the page.
const themeScript = `
(function () {
  try {
    var t = localStorage.getItem('theme');
    var dark = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '${THEME_COLOR.dark}' : '${THEME_COLOR.light}');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Corrected by themeScript before first paint; the served value is the
            dark default, matching the manifest and the app's home ground. */}
        <meta name="theme-color" content={THEME_COLOR.dark} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <PageTransition>{children}</PageTransition>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

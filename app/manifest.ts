import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Diet Tracker",
    short_name: "Diet",
    description: "Track calories and macros. API-first, Claude-friendly.",
    start_url: "/",
    display: "standalone",
    background_color: "#090c11",
    theme_color: "#090c11",
    orientation: "portrait",
    // SVG first for anything that will take it, then PNGs — Android's installer
    // and the iOS home screen both want raster.
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

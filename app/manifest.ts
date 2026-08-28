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
    ],
  };
}

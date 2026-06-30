import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Diet Tracker",
  description: "Track calories and macros. API-first, Claude-friendly.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

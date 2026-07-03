import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SyncStage — AI Music Video Studio",
  description:
    "Turn a song and a photo into a lip-synced music video, with a full timeline editor.",
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

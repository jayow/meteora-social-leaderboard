import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pool Party — Meteora Social Leaderboard",
  description: "Thesis, X profile, and PnL calendar for Meteora pool traders",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-black text-white antialiased">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProviders } from "@/components/WalletProviders";
import { AppShell } from "@/components/AppShell";
import { THEME } from "@/lib/theme";

// The one UI typeface (THEME.md): screen-tuned, with true tabular numerals for every figure.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://lppool.party"),
  title: "Pool Party",
  description: "Party starts here. The social leaderboard for Meteora LPs.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" }
    ],
    apple: "/apple-touch-icon.png"
  },
  openGraph: {
    title: "Pool Party",
    description: "Party starts here. The social leaderboard for Meteora LPs.",
    siteName: "Pool Party",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Pool Party: Party starts here" }]
  },
  twitter: {
    card: "summary_large_image",
    site: "@LPPoolParty",
    title: "Pool Party",
    description: "Party starts here. The social leaderboard for Meteora LPs.",
    images: ["/og-image.png"]
  }
};

export const viewport: Viewport = {
  themeColor: THEME.bg,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="min-h-screen font-sans text-fg antialiased">
        <WalletProviders>
          <AppShell>{children}</AppShell>
        </WalletProviders>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletProviders } from "@/components/WalletProviders";
import { AppShell } from "@/components/AppShell";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: "Pool Party — FOMO for LPs",
  description: "The Meteora LP leaderboard. Real PnL, theses, and PnL calendars from Meteora liquidity providers.",
};

export const viewport: Viewport = {
  themeColor: "#110d14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${jakarta.variable}`}>
      <body className="min-h-screen font-sans text-white antialiased">
        <WalletProviders>
          <AppShell>{children}</AppShell>
        </WalletProviders>
      </body>
    </html>
  );
}

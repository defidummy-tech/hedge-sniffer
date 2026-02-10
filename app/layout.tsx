import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DefiDummy's Hedge Deal Sniffer",
  description: "Multi-hedge simulator for Hyperliquid perps × Polymarket bets",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

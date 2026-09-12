import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Second Opinion Pro — the risk desk that acts",
  description:
    "An autonomous risk desk for on-chain and tokenized-asset portfolios. It grades your risk, hires specialist agents to fix it, pays them on-chain, and settles on X Layer. You hold the kill switch.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Ducat2Plat",
    template: "%s | Ducat2Plat",
  },
  description: "Prime junk arbitrage dashboard for Warframe",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistMono.variable} dark`}>
      <body className="min-h-screen bg-[#0a0a0a] text-[#ededed] font-mono flex flex-col">
        <nav className="border-b border-zinc-800 bg-[#0a0a0a]/80 sticky top-0 z-50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 flex items-center gap-6 h-12 text-sm">
            <Link href="/" className="font-bold text-base tracking-tight text-zinc-100">
              Ducat2Plat
            </Link>
            <Link href="/" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              Ranking
            </Link>
            <Link href="/bundles" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              Bundles
            </Link>
            <Link href="/baro" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              Baro
            </Link>
            <Link href="/positions" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              Positions
            </Link>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-zinc-800 py-4 text-center text-xs text-zinc-600">
          Data: <a href="https://warframe.market" className="hover:text-zinc-400 transition-colors" target="_blank" rel="noopener noreferrer">warframe.market</a> · Not affiliated with Digital Extremes
        </footer>
      </body>
    </html>
  );
}

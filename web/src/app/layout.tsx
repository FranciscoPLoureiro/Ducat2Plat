import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ducat2Plat",
  description: "Prime junk arbitrage dashboard for Warframe",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistMono.variable} dark`}>
      <body className="min-h-screen bg-[#0a0a0a] text-[#ededed] font-mono">
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
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}

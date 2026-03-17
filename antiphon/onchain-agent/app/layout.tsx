import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rachax402 · Agent",
  icons: {
    icon: "/Rachax402-logo.png",
  },
  description:
    "Decentralized agent-to-agent service discovery and payment-gated execution: ERC-8004, x402, Storacha.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen flex flex-col bg-[#0a0b0f] text-[#e2e8f0] antialiased">
        <header className="sticky top-0 z-50 glass border-b border-white/5">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <a
              href="https://github.com/Nkovaturient/Rachax402"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 group"
            >
              <span className="text-xl font-semibold text-gradient-rachax">
                Rachax402
              </span>
            </a>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-purple-500 text-xs text-muted-foreground">
                <a
                  href="https://github.com/polus-dev/erc-8004"
                  target="_blank"
                  rel="noopener noreferrer"
                ><span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  ERC-8004
                </a>
              </div>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-green-500 text-xs text-muted-foreground">
                <a
                  href="https://github.com/coinbase/x402"
                  target="_blank"
                  rel="noopener noreferrer"
                ><span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  x402
                </a>
              </div>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-red-500 text-xs text-muted-foreground">
                <a
                  href="https://github.com/storacha/storacha"
                  target="_blank"
                  rel="noopener noreferrer"
                ><span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  Storacha
                </a>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-grow flex items-center justify-center px-3 sm:px-4 py-6">
          {children}
        </main>

        <footer className="flex-none py-5 border-t border-white/5">
          <div className="max-w-6xl mx-auto px-4 text-center">
            <p className="text-xs text-[#64748b]">
              <a
                href="https://github.com/Nkovaturient/Rachax402"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#94a3b8] hover:text-[#00d4aa] transition"
              >
                Rachax402
              </a>
              {" · "}
              Discover, Pay, Verify — on-chain.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

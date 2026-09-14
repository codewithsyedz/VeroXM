import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import Providers from "./providers";
import "./globals.css";

// "Obsidian Atelier" design language's actual typography (its own written
// spec docs describe a different Cinzel/Plus Jakarta Sans direction, but
// the reference project's real, working CSS uses Manrope + JetBrains
// Mono — that's what's ported here, since the shipped code is the ground
// truth for "this design", not an earlier/alternate spec document).
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "myCMS",
  description: "myCMS admin",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

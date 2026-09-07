import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import "./globals.css";

/** Pixel display face — headings and title bars only. Body text stays
 *  Verdana, which is a system font and needs no download. */
const silkscreen = Silkscreen({
  variable: "--font-silkscreen",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "My Closet",
  description: "A digital version of my wardrobe.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${silkscreen.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="bevel btn sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="relative z-10 mx-auto w-full max-w-5xl grow px-4 py-6">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

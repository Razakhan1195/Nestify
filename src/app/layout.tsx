import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { siteDescription, siteUrl } from "@/lib/site";
import "./globals.css";
const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "Rezlee | Your place, under control",
    template: "%s | Rezlee",
  },
  description: siteDescription,
  applicationName: "Rezlee",
  openGraph: {
    title: "Rezlee | Your place, under control",
    description: siteDescription,
    siteName: "Rezlee",
    type: "website",
    locale: "en_CA",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rezlee | Your place, under control",
    description: siteDescription,
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-background antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}

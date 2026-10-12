import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/** Numbers and labels: tabular, so readings line up and scan at a glance. */
const mono = JetBrains_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

/** Headlines: heavy and condensed, so the call reads from arm's length in sun. */
const display = Barlow_Condensed({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: ["700", "800"],
});

export const metadata: Metadata = {
  title: "CoveCheck — Know when the water is right",
  description:
    "Forecast conditions for calm family snorkelling and swimming at a specific beach. Decision support, not a safety assessment.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The screen is read on a phone in bright sun; let people zoom.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${mono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

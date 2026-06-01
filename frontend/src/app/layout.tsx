import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vancine — One API, Infinite Creativity",
  description:
    "Generate videos, images, music, and text with the best AI models — at a fraction of the cost. Chinese AI models aggregated for global developers.",
  keywords: ["AI API", "video generation", "image generation", "LLM", "DeepSeek", "Qwen"],
  openGraph: {
    title: "Vancine — One API, Infinite Creativity",
    description: "Generate videos, images, music, and text with the best AI models.",
    url: "https://vancine.com",
    siteName: "Vancine",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

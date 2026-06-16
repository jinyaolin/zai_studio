import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "zai",
  description: "個人小說創作、發表與朗讀平台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}

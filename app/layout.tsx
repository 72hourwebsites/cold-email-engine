import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cold Email Engine",
  description: "Hyper-personalized cold email generator powered by local LLM",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

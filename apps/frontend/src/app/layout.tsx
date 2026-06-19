import type { Metadata } from "next";
import { Chivo, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppProviders } from "@/providers/app-providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const chivo = Chivo({
  variable: "--font-chivo",
  subsets: ["latin"],
  weight: ["600", "700", "900"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Privacy Trash",
  description: "Private GOR transfers on Gorbagana.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        "font-sans",
        inter.variable,
        chivo.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

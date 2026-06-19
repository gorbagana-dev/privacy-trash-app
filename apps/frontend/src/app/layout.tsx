import type { Metadata } from "next";
import { Chivo, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppProviders } from "@/providers/app-providers";

const siteName = "Privacy Trash";
const siteDescription = "Private GOR transfers on Gorbagana.";
const siteUrl = process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";

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
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", sizes: "1254x1254", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "1254x1254", type: "image/png" }],
  },
  openGraph: {
    title: siteName,
    description: siteDescription,
    url: "/",
    siteName,
    images: [
      {
        url: "/logo.png",
        width: 1254,
        height: 1254,
        alt: "Privacy Trash logo",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: siteName,
    description: siteDescription,
    images: ["/logo.png"],
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

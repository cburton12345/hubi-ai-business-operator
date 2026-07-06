import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ferocity.live"),
  title: {
    default: "Ferocity | AI Workforce for Modern Businesses",
    template: "%s | Ferocity"
  },
  description:
    "Ferocity gives modern businesses an AI workforce for leads, follow-up, marketing, jobs, payments, reviews, tasks, and approved repeat work.",
  applicationName: "Ferocity",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Ferocity",
    statusBarStyle: "black-translucent"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  },
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    url: "https://ferocity.live",
    siteName: "Ferocity",
    title: "Ferocity | AI Workforce for Modern Businesses",
    description:
      "Digital employees for lead response, follow-up, office work, marketing, payments, reviews, tasks, and approved repeat work."
  },
  twitter: {
    card: "summary_large_image",
    title: "Ferocity | AI Workforce for Modern Businesses",
    description:
      "Run follow-up, reviews, jobs, payments, team work, and owner alerts with one AI operating system."
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

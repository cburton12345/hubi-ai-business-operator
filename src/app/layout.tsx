import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ferocity.live"),
  title: {
    default: "Ferocity | AI Operating System for Service Businesses",
    template: "%s | Ferocity"
  },
  description:
    "Ferocity helps service businesses win more work, run jobs, get paid, grow customer trust, and take routine office work off the owner.",
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
    title: "Ferocity | AI Operating System for Service Businesses",
    description:
      "Win more work, lose less money, and get your time back with one AI operating system for service businesses."
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

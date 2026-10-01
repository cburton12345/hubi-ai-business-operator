import type { Metadata } from "next";
import { PublicVisitTracker } from "@/components/public/PublicVisitTracker";
import { PublicFerocityChatWidget } from "@/components/public/PublicFerocityChatWidget";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ferocity.live"),
  title: {
    default: "Ferocity | The AI Operating System for Running a Business",
    template: "%s | Ferocity"
  },
  description:
    "Ferocity connects customers, work, people, money, communications, and growth—then keeps authorized next steps moving.",
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
    title: "Ferocity | The AI Operating System for Running a Business",
    description:
      "Connect customers, work, people, money, communications, and growth through one AI business operating system."
  },
  twitter: {
    card: "summary_large_image",
    title: "Ferocity | AI Operating System for Business",
    description:
      "Run follow-up, reviews, jobs, payments, team work, and owner alerts with one AI operating system."
  },
  robots: {
    index: true,
    follow: true
  }
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://ferocity.live/#organization",
      name: "Ferocity",
      alternateName: "Ferocity AI",
      url: "https://ferocity.live/",
      logo: "https://ferocity.live/icon.svg",
      description: "Ferocity is an AI business operating system that coordinates people, specialized AI departments, customer work, operations, money, and growth through one Business Brain."
    },
    {
      "@type": "WebSite",
      "@id": "https://ferocity.live/#website",
      url: "https://ferocity.live/",
      name: "Ferocity",
      alternateName: "Ferocity AI",
      publisher: { "@id": "https://ferocity.live/#organization" },
      inLanguage: "en-US"
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://ferocity.live/#software",
      name: "Ferocity",
      alternateName: "Ferocity AI",
      url: "https://ferocity.live/",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "AI business operating system",
      operatingSystem: "Web",
      description: "An AI business operating system that helps coordinate customer work, teams, communication, money, growth, and authorized next actions.",
      publisher: { "@id": "https://ferocity.live/#organization" },
      audience: {
        "@type": "BusinessAudience",
        audienceType: "Businesses and operating teams"
      }
    }
  ]
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
        />
        <PublicVisitTracker />
        {children}
        <PublicFerocityChatWidget />
      </body>
    </html>
  );
}

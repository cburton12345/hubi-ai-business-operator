import type { Metadata } from "next";
import { PublicVisitTracker } from "@/components/public/PublicVisitTracker";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ferocity.live"),
  title: {
    default: "Ferocity AI | AI Operating System for Service Businesses",
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
    title: "Ferocity AI | AI Operating System for Service Businesses",
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
      description: "Ferocity is an AI business operating system that coordinates people, AI employees, customer work, operations, money, and growth for service businesses."
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
      description: "An AI operating system for service businesses that helps capture and follow up with leads, coordinate jobs and teams, manage customer communication, collect payments, and keep authorized work moving.",
      publisher: { "@id": "https://ferocity.live/#organization" },
      audience: {
        "@type": "BusinessAudience",
        audienceType: "Service businesses"
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
      </body>
    </html>
  );
}

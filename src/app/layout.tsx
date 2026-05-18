import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hubi AI Business Operator",
  description: "Multi-tenant SaaS foundation for AI-assisted business operations."
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

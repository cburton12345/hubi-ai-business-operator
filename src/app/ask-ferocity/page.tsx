import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatExperience } from "@/app/chat/[publicKey]/ChatExperience";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicNav } from "@/components/public/PublicNav";
import { getFerocityPublicSalesProfile } from "@/lib/forms/get-public-form-profile";
import { getPublicPlatform } from "@/lib/public-site/platform-catalog";

export const metadata: Metadata = {
  title: "Ask Ferocity | Find the Right Starting Path",
  description: "Ask Ferocity about products, pricing, setup, capabilities, provider costs, and which starting path fits your business.",
  alternates: { canonical: "/ask-ferocity" }
};

export default async function AskFerocityPage({
  searchParams
}: {
  searchParams: Promise<{ platform?: string; embed?: string; businessType?: string; bottleneck?: string }>;
}) {
  const [{ platform: platformKey, embed, businessType, bottleneck }, profile] = await Promise.all([
    searchParams,
    getFerocityPublicSalesProfile()
  ]);
  if (!profile) notFound();
  const platform = getPublicPlatform(platformKey);

  if (embed === "1") {
    return (
      <main className="public-chat-page public-chat-embed">
        <ChatExperience
          brandName={profile.brandName}
          experience="ferocity_sales"
          platform={platform}
          publicKey={profile.publicKey}
          initialContext={{ businessType, bottleneck }}
        />
      </main>
    );
  }

  return (
    <main className="public-page public-chat-page">
      <section className="public-shell">
        <PublicNav />
        <section className="public-hero">
          <p className="eyebrow">Your business. Ferocity’s attention.</p>
          <h1>{platform ? `Ask about ${platform.name}.` : "What kind of business do you run—and what needs to work better?"}</h1>
          <p className="muted">
            Describe what feels slow, gets missed, depends too much on you, or what you want to grow. Ferocity can ask a few useful questions, explain what it would address first, and recommend a practical starting point with transparent pricing and setup.
          </p>
          <div className="button-row">
            <Link className="button secondary-button" href="/platforms">View ways to start</Link>
            <Link className="button secondary-button" href="/pricing">Compare plans</Link>
          </div>
        </section>

        <ChatExperience
          brandName={profile.brandName}
          experience="ferocity_sales"
          platform={platform}
          publicKey={profile.publicKey}
          initialContext={{ businessType, bottleneck }}
        />

        <PublicFooter />
      </section>
    </main>
  );
}

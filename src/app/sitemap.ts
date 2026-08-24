import type { MetadataRoute } from "next";
import { getIndexableHostedGrowthPages } from "@/lib/sites/hosted-growth-pages";

const baseUrl = "https://ferocity.live";

const publicRoutes = [
  { path: "/", priority: 1 },
  { path: "/growth-system", priority: 0.98 },
  { path: "/business-health-score", priority: 0.95 },
  { path: "/features", priority: 0.9 },
  { path: "/demo", priority: 0.85 },
  { path: "/demo/tour", priority: 0.8 },
  { path: "/demo/acme-roofing", priority: 0.75 },
  { path: "/connect-website", priority: 0.85 },
  { path: "/automations", priority: 0.8 },
  { path: "/pricing", priority: 0.8 },
  { path: "/integrations", priority: 0.7 },
  { path: "/about", priority: 0.65 },
  { path: "/start", priority: 0.6 },
  { path: "/support", priority: 0.4 },
  { path: "/privacy", priority: 0.3 },
  { path: "/terms", priority: 0.3 },
  { path: "/sms-terms", priority: 0.3 },
  { path: "/sms-consent", priority: 0.3 },
  { path: "/sms-opt-in", priority: 0.3 },
  { path: "/acceptable-use", priority: 0.3 },
  { path: "/data-processing-addendum", priority: 0.3 },
  { path: "/subprocessors", priority: 0.3 },
  { path: "/contact-compliance", priority: 0.3 }
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const hostedPages = await getIndexableHostedGrowthPages();
  return [...publicRoutes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.path === "/" ? "weekly" : "monthly",
    priority: route.priority
  } as const)), ...hostedPages.map((page) => ({
    url: `${baseUrl}${page.publicUrl}`,
    lastModified: new Date(page.updatedAt),
    changeFrequency: "monthly" as const,
    priority: 0.6
  }))];
}

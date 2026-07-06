import type { MetadataRoute } from "next";

const baseUrl = "https://ferocity.live";

const publicRoutes = [
  { path: "/", priority: 1 },
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
  { path: "/privacy", priority: 0.3 },
  { path: "/terms", priority: 0.3 }
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return publicRoutes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.path === "/" ? "weekly" : "monthly",
    priority: route.priority
  }));
}

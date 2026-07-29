import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/about", "/features", "/demo", "/pricing", "/growth-system", "/free-business-audit", "/business-health-score", "/connect-website", "/automations", "/integrations", "/start"],
      disallow: ["/app", "/api", "/login", "/portal", "/invite", "/reset-password/update"]
    },
    sitemap: "https://ferocity.live/sitemap.xml"
  };
}

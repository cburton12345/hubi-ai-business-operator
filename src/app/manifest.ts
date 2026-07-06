import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ferocity",
    short_name: "Ferocity",
    description: "AI business autopilot for follow-up, jobs, crew work, reviews, payments, marketing, and owner alerts.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f7f4ed",
    theme_color: "#111827",
    orientation: "portrait-primary",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ],
    shortcuts: [
      {
        name: "Attention Command",
        short_name: "Attention",
        description: "Open owner decisions, blockers, and money follow-up.",
        url: "/app/attention-command"
      },
      {
        name: "Crew Day",
        short_name: "Crew Day",
        description: "Open today's crew itinerary, schedule, receipts, proof, and customer updates.",
        url: "/app/crew-itinerary"
      },
      {
        name: "Cash Collection",
        short_name: "Money",
        description: "Open invoices, payment reminders, collections, and ledger visibility.",
        url: "/app/cash-collection"
      },
      {
        name: "Business Grader",
        short_name: "Grader",
        description: "Run or review Business Grader reports.",
        url: "/business-health-score"
      },
      {
        name: "Autopilot Setup",
        short_name: "Setup",
        description: "Use AI-guided setup for a business.",
        url: "/app/build-system"
      }
    ]
  };
}

import fs from "node:fs";

const files = {
  home: fs.readFileSync("src/app/page.tsx", "utf8"),
  demo: fs.readFileSync("src/app/demo/page.tsx", "utf8"),
  pricing: fs.readFileSync("src/app/pricing/page.tsx", "utf8"),
  commandStory: fs.readFileSync("src/components/public/PublicCommandStory.tsx", "utf8"),
  featuredDemo: fs.readFileSync("src/components/public/FeaturedDemoMedia.tsx", "utf8"),
  integrations: fs.readFileSync("src/app/integrations/page.tsx", "utf8")
};

const required = [
  ["home", "Authorized routine work moves automatically within your rules"],
  ["demo", "authorized work"],
  ["pricing", "Routine work is prepared or executed only when the required provider, consent, and authority are in place"],
  ["pricing", "other third-party costs stay separate"],
  ["commandStory", "approved follow-ups prepared"],
  ["commandStory", "decisions routed to the owner"],
  ["featuredDemo", "ferocity-demo-walkthrough.svg"],
  ["integrations", "keeps unsupported paths honest"],
  ["integrations", "can revoke access"],
  ["integrations", "Assisted when direct access is limited"]
];

const forbidden = [
  /works with every provider/i,
  /unlimited (?:ai|voice|text|video)/i,
  /guaranteed (?:revenue|results|growth|leads)/i,
  /fully autonomous with no approval/i,
  /posts? everywhere automatically/i,
  /sends? unlimited (?:texts?|emails?)/i
];

const failures = [];
for (const [file, phrase] of required) {
  if (!files[file].includes(phrase)) failures.push(`${file} is missing required launch qualifier: ${phrase}`);
}

for (const [file, source] of Object.entries(files)) {
  for (const pattern of forbidden) {
    if (pattern.test(source)) failures.push(`${file} contains prohibited absolute claim: ${pattern}`);
  }
}

if (failures.length) throw new Error(failures.join("\n"));
console.log("Public claim readiness passed: provider connection, authorization, fallback, and prepared-work qualifiers are present.");

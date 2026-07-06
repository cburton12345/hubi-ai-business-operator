import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = [
  "src/app/page.tsx",
  "src/app/about",
  "src/app/automations",
  "src/app/business-health-score",
  "src/app/connect-website",
  "src/app/demo",
  "src/app/features",
  "src/app/install",
  "src/app/integrations",
  "src/app/pricing",
  "src/app/signup",
  "src/app/start",
  "src/app/website-grader"
];

const blocked = [
  /TZ'?s?\s+Construction/i,
  /\b4Bid\b/i,
  /\b4\s+Bid\b/i,
  /Guardian\s*Signal/i,
  /GuardianSignal/i,
  /Homes4Rent/i,
  /Diamond\s+Homes/i,
  /Preferred\s+Trailer/i,
  /MarketplacePro/i,
  /\bGovFlow\b/i,
  /\bBidOps\b/i,
  /\bChris\b/i,
  /\bBrad\b/i,
  /\bMelinda\b/i,
  /\bTracy\b/i
];

function filesUnder(path) {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  const files = [];
  for (const entry of readdirSync(path)) {
    const child = join(path, entry);
    const childStat = statSync(child);
    if (childStat.isDirectory()) {
      files.push(...filesUnder(child));
    } else if (/\.(tsx|ts|mdx|md)$/.test(entry)) {
      files.push(child);
    }
  }
  return files;
}

const findings = [];
for (const root of roots) {
  for (const file of filesUnder(root)) {
    const body = readFileSync(file, "utf8");
    const lines = body.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of blocked) {
        if (pattern.test(line)) {
          findings.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      }
    });
  }
}

if (findings.length > 0) {
  console.error("Public company/name leak guard failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Public company/name leak guard passed.");

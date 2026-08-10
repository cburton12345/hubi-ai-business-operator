export type SearchVisibilityCheckStatus = "good" | "warning" | "blocked";

export type SearchVisibilityCheck = {
  key: "robots" | "sitemap" | "indexing" | "canonical";
  label: string;
  status: SearchVisibilityCheckStatus;
  detail: string;
};

export type SearchVisibilityHealth = {
  score: number;
  status: "indexable" | "needs_attention" | "blocked";
  robotsUrl: string;
  robotsStatus: number | null;
  sitemapUrl: string;
  sitemapStatus: number | null;
  sitemapUrlCount: number;
  canonicalUrl: string | null;
  metaRobots: string | null;
  xRobotsTag: string | null;
  googlebotAllowed: boolean;
  bingbotAllowed: boolean;
  checks: SearchVisibilityCheck[];
  scannedAt: string;
};

type SearchVisibilityInput = {
  pageUrl: string;
  html: string;
  xRobotsTag?: string | null;
  robotsUrl: string;
  robotsStatus: number | null;
  robotsText?: string | null;
  sitemapUrl: string;
  sitemapStatus: number | null;
  sitemapText?: string | null;
  scannedAt?: string;
};

function attributes(tag: string) {
  const output: Record<string, string> = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:["']([^"']*)["']|([^\s>]+))/g)) {
    output[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  }
  return output;
}

function findMetaRobots(html: string) {
  const directives: string[] = [];
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (["robots", "googlebot", "bingbot"].includes((attrs.name ?? "").toLowerCase()) && attrs.content) {
      directives.push(`${attrs.name.toLowerCase()}: ${attrs.content}`);
    }
  }
  return directives.length ? directives.join("; ") : null;
}

function findCanonical(html: string, pageUrl: string) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
    if (!rel.includes("canonical") || !attrs.href) continue;
    try {
      return new URL(attrs.href, pageUrl).toString();
    } catch {
      return attrs.href;
    }
  }
  return null;
}

function normalizedComparableUrl(input: string) {
  try {
    const url = new URL(input);
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return input;
  }
}

type RobotsGroup = { agents: string[]; rules: Array<{ directive: "allow" | "disallow"; path: string }> };

function robotsGroups(text: string) {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let sawRule = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!current || sawRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
        sawRule = false;
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current) {
      current.rules.push({ directive: field, path: value });
      sawRule = true;
    }
  }
  return groups;
}

export function robotsAllowsPath(text: string | null | undefined, userAgent: string, pathname = "/") {
  if (!text) return true;
  const agent = userAgent.toLowerCase();
  const groups = robotsGroups(text);
  const exact = groups.filter((group) => group.agents.some((item) => item !== "*" && agent.includes(item)));
  const applicable = exact.length ? exact : groups.filter((group) => group.agents.includes("*"));
  const rules = applicable.flatMap((group) => group.rules).filter((rule) => rule.path && pathname.startsWith(rule.path));
  if (!rules.length) return true;
  rules.sort((left, right) => right.path.length - left.path.length || (left.directive === "allow" ? -1 : 1));
  return rules[0].directive === "allow";
}

function containsNoindex(value: string | null | undefined) {
  return Boolean(value && /(?:^|[,;:\s])noindex(?:$|[,;\s])/i.test(value));
}

function sitemapCount(text: string | null | undefined) {
  if (!text) return 0;
  return (text.match(/<loc>\s*[^<]+\s*<\/loc>/gi) ?? []).length;
}

export function evaluateSearchVisibility(input: SearchVisibilityInput): SearchVisibilityHealth {
  const canonicalUrl = findCanonical(input.html, input.pageUrl);
  const metaRobots = findMetaRobots(input.html);
  const googlebotAllowed = robotsAllowsPath(input.robotsText, "googlebot");
  const bingbotAllowed = robotsAllowsPath(input.robotsText, "bingbot");
  const headerNoindex = containsNoindex(input.xRobotsTag);
  const metaNoindex = containsNoindex(metaRobots);
  const discoveredUrls = sitemapCount(input.sitemapText);
  const robotsHealthy = input.robotsStatus !== null && input.robotsStatus >= 200 && input.robotsStatus < 400;
  const sitemapHealthy = input.sitemapStatus !== null && input.sitemapStatus >= 200 && input.sitemapStatus < 400 && discoveredUrls > 0;
  const canonicalMatches = canonicalUrl !== null && normalizedComparableUrl(canonicalUrl) === normalizedComparableUrl(input.pageUrl);

  const checks: SearchVisibilityCheck[] = [
    {
      key: "robots",
      label: "Search crawler access",
      status: googlebotAllowed && bingbotAllowed ? (robotsHealthy ? "good" : "warning") : "blocked",
      detail: !googlebotAllowed || !bingbotAllowed
        ? "The site blocks Googlebot or Bingbot at the root."
        : robotsHealthy
          ? "Googlebot and Bingbot are allowed by robots.txt."
          : "Crawler access is not blocked, but robots.txt could not be confirmed."
    },
    {
      key: "sitemap",
      label: "Public sitemap",
      status: sitemapHealthy ? "good" : "warning",
      detail: sitemapHealthy
        ? `The sitemap is reachable and lists ${discoveredUrls} public URL${discoveredUrls === 1 ? "" : "s"}.`
        : "A working XML sitemap with public pages was not confirmed."
    },
    {
      key: "indexing",
      label: "Indexing permission",
      status: headerNoindex || metaNoindex ? "blocked" : "good",
      detail: headerNoindex || metaNoindex
        ? "The homepage sends a noindex instruction."
        : "No homepage noindex instruction was detected."
    },
    {
      key: "canonical",
      label: "Canonical address",
      status: canonicalMatches ? "good" : "warning",
      detail: canonicalMatches
        ? "The homepage canonical matches the public website address."
        : canonicalUrl
          ? `The homepage canonical points to ${canonicalUrl}.`
          : "The homepage does not declare a canonical address."
    }
  ];

  const blocked = checks.some((check) => check.status === "blocked");
  const warning = checks.some((check) => check.status === "warning");
  const deduction = checks.reduce((total, check) => total + (check.status === "blocked" ? 35 : check.status === "warning" ? 15 : 0), 0);

  return {
    score: Math.max(0, 100 - deduction),
    status: blocked ? "blocked" : warning ? "needs_attention" : "indexable",
    robotsUrl: input.robotsUrl,
    robotsStatus: input.robotsStatus,
    sitemapUrl: input.sitemapUrl,
    sitemapStatus: input.sitemapStatus,
    sitemapUrlCount: discoveredUrls,
    canonicalUrl,
    metaRobots,
    xRobotsTag: input.xRobotsTag ?? null,
    googlebotAllowed,
    bingbotAllowed,
    checks,
    scannedAt: input.scannedAt ?? new Date().toISOString()
  };
}

export function sitemapCandidates(robotsText: string | null | undefined, origin: string) {
  const candidates: string[] = [];
  for (const line of (robotsText ?? "").split(/\r?\n/)) {
    const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
    if (!match) continue;
    try {
      candidates.push(new URL(match[1], origin).toString());
    } catch {
      continue;
    }
  }
  candidates.push(new URL("/sitemap.xml", origin).toString());
  return [...new Set(candidates)];
}

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "src");
const appRoot = path.join(sourceRoot, "app");
const publicRoot = path.join(root, "public");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function routePattern(file) {
  const relativeDirectory = path.relative(appRoot, path.dirname(file));
  const segments = relativeDirectory
    .split(path.sep)
    .filter(Boolean)
    .filter((segment) => !/^\(.*\)$/.test(segment));

  if (segments.length === 0) return /^\/$/;

  const pattern = segments.map((segment) => {
    if (segment.startsWith("[[...")) return "(?:/.*)?";
    if (segment.startsWith("[...")) return "/.*";
    if (segment.startsWith("[")) return "/[^/]+";
    return `/${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
  }).join("");

  return new RegExp(`^${pattern}/?$`);
}

const routePatterns = walk(appRoot)
  .filter((file) => /(?:page|route)\.(?:tsx?|jsx?)$/.test(file))
  .map(routePattern);

const componentFiles = walk(sourceRoot).filter((file) => /\.(?:tsx|jsx)$/.test(file));
const brokenLinks = [];

function isPublicAsset(pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  const target = path.resolve(publicRoot, relative);
  return target.startsWith(`${path.resolve(publicRoot)}${path.sep}`) && fs.existsSync(target) && fs.statSync(target).isFile();
}

for (const file of componentFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/href\s*=\s*["'](\/(?!\/)[^"']*)["']/g)) {
    const href = match[1];
    const pathname = href.split(/[?#]/)[0] || "/";
    if (!routePatterns.some((pattern) => pattern.test(pathname)) && !isPublicAsset(pathname)) {
      brokenLinks.push(`${path.relative(root, file)} -> ${href}`);
    }
  }
}

const shellPath = path.join(sourceRoot, "components", "admin", "AppShell.tsx");
const shell = fs.readFileSync(shellPath, "utf8");
const menuStart = shell.indexOf('<div className="nav-menu-panel">');
const menuEnd = shell.indexOf("</details>", menuStart);
if (menuStart < 0 || menuEnd < 0) {
  throw new Error("Could not locate the All Tools menu in AppShell.");
}

const menuSource = shell.slice(menuStart, menuEnd);
const menuTargets = [...menuSource.matchAll(/<Link\b[^>]*href="([^"]+)"/g)].map((match) => match[1]);
const repeatedMenuTargets = [...new Set(menuTargets.filter((target, index) => menuTargets.indexOf(target) !== index))];

const failures = [];
const demoFallbackPath = path.join(publicRoot, "ferocity-demo-walkthrough.svg");
const featuredDemoComponent = fs.readFileSync(
  path.join(sourceRoot, "components", "public", "FeaturedDemoMedia.tsx"),
  "utf8"
);

if (!fs.existsSync(demoFallbackPath) || fs.statSync(demoFallbackPath).size < 1_000) {
  failures.push("The safe built-in Ferocity demo fallback is missing or unexpectedly small.");
}
if (!featuredDemoComponent.includes("/ferocity-demo-walkthrough.svg")) {
  failures.push("FeaturedDemoMedia does not reference the safe built-in demo fallback.");
}
if (brokenLinks.length > 0) {
  failures.push(`Invalid literal internal links:\n- ${brokenLinks.join("\n- ")}`);
}
if (repeatedMenuTargets.length > 0) {
  failures.push(`Repeated All Tools destinations: ${repeatedMenuTargets.join(", ")}`);
}
if (menuTargets.length > 60) {
  failures.push(`All Tools contains ${menuTargets.length} destinations; keep it at 60 or fewer.`);
}

if (failures.length > 0) {
  throw new Error(failures.join("\n\n"));
}

console.log(
  `UI quality check passed: ${routePatterns.length} routes, ${componentFiles.length} component files, ` +
  `${menuTargets.length} unique All Tools destinations, and the public demo fallback gate.`
);

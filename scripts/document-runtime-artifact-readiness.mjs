import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const serverRoot = path.join(root, ".next", "server");

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const tracePaths = walk(serverRoot).filter((filePath) => filePath.endsWith(".nft.json"));
if (!tracePaths.length) {
  throw new Error("No Next.js server file traces were found. Run `npm run build` before checking document runtime packaging.");
}

const requiredPackages = ["unpdf", "pdfjs-dist"];
const relevantTraces = [];
for (const tracePath of tracePaths) {
  const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
  const files = Array.isArray(trace.files) ? trace.files.filter((value) => typeof value === "string") : [];
  const packages = requiredPackages.filter((packageName) => files.some((file) => file.includes(`/node_modules/${packageName}/`) || file.includes(`\\node_modules\\${packageName}\\`)));
  if (packages.length !== requiredPackages.length) continue;

  const missingFiles = files
    .filter((file) => requiredPackages.some((packageName) => file.includes(`/node_modules/${packageName}/`) || file.includes(`\\node_modules\\${packageName}\\`)))
    .filter((file) => !fs.existsSync(path.resolve(path.dirname(tracePath), file)));
  if (missingFiles.length) {
    throw new Error(`Document runtime trace ${path.relative(root, tracePath)} references missing files: ${missingFiles.slice(0, 5).join(", ")}`);
  }
  relevantTraces.push(path.relative(root, tracePath));
}

if (!relevantTraces.some((trace) => trace.replaceAll("\\", "/").endsWith("server/app/app/expenses/page.js.nft.json"))) {
  throw new Error("The built Receipts & Expenses route does not trace both unpdf and pdfjs-dist. PDF imports would be unsafe to release.");
}

console.log(`Document runtime artifact ready: ${relevantTraces.length} server trace(s) include resolvable unpdf and pdfjs-dist files.`);

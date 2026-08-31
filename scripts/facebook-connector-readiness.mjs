import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const root = join(process.cwd(), "ferocity-facebook-connector");
const forbidden = [/homes4rent/i, /postToH4R/i, /h4r_/i, /destination\s*[:=]\s*["']h4r/i];
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}

await walk(root);
const failures = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(content)) failures.push(`${relative(root, file)} contains ${pattern}`);
  }
}

const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
if (manifest.name !== "Ferocity Facebook Connector") failures.push("manifest name is not Ferocity-branded");
if (!manifest.host_permissions?.includes("https://ferocity.live/*")) failures.push("ferocity.live host permission is missing");
if (manifest.host_permissions?.some((value) => /homes4rent/i.test(value))) failures.push("H4R host permission is present");

if (failures.length) {
  console.error("Facebook connector readiness FAILED\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Facebook connector readiness passed (${files.length} files, destination=ferocity, no H4R production references).`);

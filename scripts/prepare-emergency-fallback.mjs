import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourcePath = resolve(repositoryRoot, "public", "emergency.html");
const nextOutputPath = resolve(repositoryRoot, ".next", "emergency.html");
const requiredMarkers = [
  "<title>Ferocity Emergency Status</title>",
  "This page is intentionally independent of Ferocity’s database",
];

async function readValidatedFallback(filePath) {
  let contents;

  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Required emergency fallback is unavailable at ${filePath}`, {
      cause: error,
    });
  }

  for (const marker of requiredMarkers) {
    if (!contents.includes(marker)) {
      throw new Error(
        `Emergency fallback at ${filePath} is missing required marker: ${marker}`,
      );
    }
  }

  return contents;
}

const sourceContents = await readValidatedFallback(sourcePath);

await mkdir(resolve(repositoryRoot, ".next"), { recursive: true });
await copyFile(sourcePath, nextOutputPath);

const copiedContents = await readValidatedFallback(nextOutputPath);
if (copiedContents !== sourceContents) {
  throw new Error("The emergency fallback changed while being copied into .next.");
}

console.log("Emergency fallback copied into the direct Netlify publish output.");

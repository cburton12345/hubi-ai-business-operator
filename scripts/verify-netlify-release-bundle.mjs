import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourcePath = resolve(repositoryRoot, "public", "emergency.html");
const nextOutputPath = resolve(repositoryRoot, ".next", "emergency.html");
const netlifyOutputPath = resolve(
  repositoryRoot,
  ".netlify",
  "static",
  "emergency.html",
);
const serverHandlerPath = resolve(
  repositoryRoot,
  ".netlify",
  "functions-internal",
  "___netlify-server-handler",
  "___netlify-server-handler.mjs",
);

async function readRequiredFile(filePath) {
  try {
    return await readFile(filePath);
  } catch (error) {
    throw new Error(`Required release artifact is unavailable at ${filePath}`, {
      cause: error,
    });
  }
}

const [source, nextOutput, netlifyOutput] = await Promise.all([
  readRequiredFile(sourcePath),
  readRequiredFile(nextOutputPath),
  readRequiredFile(netlifyOutputPath),
]);

if (!source.equals(nextOutput)) {
  throw new Error("The .next emergency fallback does not match public/emergency.html.");
}

if (!source.equals(netlifyOutput)) {
  throw new Error(
    "The Netlify release bundle emergency fallback does not match public/emergency.html.",
  );
}

try {
  const serverHandler = await stat(serverHandlerPath);
  if (!serverHandler.isFile() || serverHandler.size === 0) {
    throw new Error("The Netlify server handler is empty or is not a file.");
  }
} catch (error) {
  throw new Error(
    `The Netlify release bundle is missing its Next.js server handler at ${serverHandlerPath}`,
    { cause: error },
  );
}

console.log(
  "Netlify release bundle contains the verified emergency fallback and Next.js server handler.",
);

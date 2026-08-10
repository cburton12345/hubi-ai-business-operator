import { spawn } from "node:child_process";

const port = Number(process.env.LOCAL_RELEASE_PORT ?? 3010);
const baseUrl = `http://127.0.0.1:${port}`;

function runNode(script, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} exited with code ${code}`)));
  });
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Local release server did not become ready at ${baseUrl}.`);
}

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: "inherit"
});

try {
  await waitUntilReady();
  await runNode("scripts/render-smoke.mjs", { RENDER_SMOKE_URL: baseUrl });
  await runNode("scripts/launch-load-smoke.mjs", {
    LOAD_TEST_BASE_URL: baseUrl,
    LOAD_TEST_CONCURRENCY: process.env.LOAD_TEST_CONCURRENCY ?? "12",
    LOAD_TEST_REQUESTS_PER_PATH: process.env.LOAD_TEST_REQUESTS_PER_PATH ?? "30"
  });
} finally {
  server.kill("SIGTERM");
}

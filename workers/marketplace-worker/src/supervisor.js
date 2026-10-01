import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkerConfig, resolveConfigPath } from "./config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolveConfigPath();
const config = loadWorkerConfig(configPath);
const logDir = path.join(root, "logs");
const stateFile = path.join(logDir, "supervisor-state.json");
fs.mkdirSync(logDir, { recursive: true });

function writeState(value) {
  const temp = `${stateFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ ...value, updatedAt: new Date().toISOString() }, null, 2));
  fs.renameSync(temp, stateFile);
}

function append(message) {
  fs.appendFileSync(path.join(logDir, "supervisor.log"), `[${new Date().toISOString()}] ${message}\n`);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let stopping = false;
let child = null;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    child?.kill("SIGTERM");
  });
}

let delay = config.scheduling.restartDelayMs;
while (!stopping) {
  const out = fs.openSync(path.join(logDir, "worker-stdout.log"), "a");
  const err = fs.openSync(path.join(logDir, "worker-stderr.log"), "a");
  child = spawn(process.execPath, [path.join(root, "src", "index.js"), "--config", configPath], {
    cwd: root,
    stdio: ["ignore", out, err],
    windowsHide: true
  });
  const startedAt = Date.now();
  append(`Worker ${child.pid} started.`);
  writeState({ status: "running", pid: child.pid, startedAt: new Date(startedAt).toISOString() });
  const exit = await new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  fs.closeSync(out);
  fs.closeSync(err);
  child = null;
  append(`Worker exited code=${exit.code ?? ""} signal=${exit.signal ?? ""}.`);
  if (stopping) break;
  if (Date.now() - startedAt > 10 * 60 * 1000) delay = config.scheduling.restartDelayMs;
  writeState({ status: "restarting", lastExit: exit, restartAt: new Date(Date.now() + delay).toISOString() });
  await wait(delay);
  delay = Math.min(config.scheduling.maxRestartDelayMs, Math.round(delay * 1.7));
}
writeState({ status: "stopped" });

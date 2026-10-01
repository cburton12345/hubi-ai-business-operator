import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logDir = path.join(root, "logs");
for (const name of ["supervisor-state.json", "supervisor.log", "worker.log", "worker-stderr.log"]) {
  const file = path.join(logDir, name);
  console.log(`\n=== ${name} ===`);
  if (!fs.existsSync(file)) {
    console.log("Not created yet.");
    continue;
  }
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  console.log(lines.slice(-80).join("\n"));
}

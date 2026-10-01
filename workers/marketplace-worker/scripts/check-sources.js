import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
for (const name of fs.readdirSync(path.join(root, "src")).filter((value) => value.endsWith(".js"))) {
  execFileSync(process.execPath, ["--check", path.join(root, "src", name)], { stdio: "inherit" });
}

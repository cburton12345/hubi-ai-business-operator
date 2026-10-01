import fs from "node:fs";
import path from "node:path";

export function createLogger(root, output = console) {
  const logDir = path.join(root, "logs");
  const logFile = path.join(logDir, "worker.log");
  fs.mkdirSync(logDir, { recursive: true });

  function write(level, message, details) {
    const suffix = details === undefined ? "" : ` ${JSON.stringify(details)}`;
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${suffix}`;
    fs.appendFileSync(logFile, `${line}\n`);
    output[level === "error" ? "error" : "log"](line);
  }

  return {
    info: (message, details) => write("info", message, details),
    warn: (message, details) => write("warn", message, details),
    error: (message, details) => write("error", message, details)
  };
}

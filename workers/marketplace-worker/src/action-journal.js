import fs from "node:fs";
import path from "node:path";

export class ActionJournal {
  constructor(root) {
    this.file = path.join(root, "logs", "action-journal.json");
  }

  read() {
    if (!fs.existsSync(this.file)) return [];
    try {
      const value = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  write(entries) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(entries, null, 2));
    fs.renameSync(temp, this.file);
  }

  begin(action) {
    const entries = this.read().filter((entry) => entry.action?.id !== action.id);
    entries.push({ phase: "executing", action, updatedAt: new Date().toISOString() });
    this.write(entries);
  }

  complete(action, confirmation) {
    const entries = this.read().filter((entry) => entry.action?.id !== action.id);
    entries.push({ phase: "pending_confirmation", action, confirmation, updatedAt: new Date().toISOString() });
    this.write(entries);
  }

  remove(actionId) {
    this.write(this.read().filter((entry) => entry.action?.id !== actionId));
  }
}

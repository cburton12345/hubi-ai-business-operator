import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("Ask Ferocity read-only integrity", () => {
  it("forces explicit read-only instructions ahead of inferred model intent", () => {
    const actions = read("src/app/app/ai-workforce/actions.ts");
    expect(actions).toContain("const intent = actionPolicy.readOnlyRequested");
    expect(actions).toContain('const primaryHref = financialDocumentScope\n        ? "/app/expenses"');
  });

  it("clears the in-progress message after a completed response", () => {
    const chat = read("src/app/app/ferocity/FerocityOwnerChat.tsx");
    expect(chat).toContain('voiceMode !== "conversation"');
    expect(chat).toContain('setVoiceStatus("")');
  });
});

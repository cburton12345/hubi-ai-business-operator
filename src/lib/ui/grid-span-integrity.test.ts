import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("shared twelve-column grid", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const expenseDropzone = fs.readFileSync(path.join(process.cwd(), "src/app/app/expenses/DocumentDropzone.tsx"), "utf8");

  it("defines every span class used by application views", () => {
    for (const span of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(css).toContain(`.span-${span} {`);
    }
  });

  it("uses shrink-safe grid tracks", () => {
    expect(css).toContain("grid-template-columns: repeat(12, minmax(0, 1fr));");
  });

  it("collapses asymmetric spans on narrow screens", () => {
    const responsiveStart = css.indexOf("  .span-1,");
    const responsiveBlock = css.slice(responsiveStart, responsiveStart + 260);
    for (const span of [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(responsiveBlock).toContain(`.span-${span}`);
    }
    expect(responsiveBlock).toContain("grid-column: span 12");
  });

  it("gives expense upload project controls usable component-specific columns", () => {
    expect(expenseDropzone).toContain('className="document-project-fields"');
    expect(css).toContain(".document-project-fields {");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.document-project-fields\s*\{[\s\S]*?grid-template-columns: 1fr/);
  });
});

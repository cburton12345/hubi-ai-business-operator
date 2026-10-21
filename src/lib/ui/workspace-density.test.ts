import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("workspace information density", () => {
  it("keeps Today focused on owner decisions instead of the internal system briefing", () => {
    const page = source("src/app/app/page.tsx");
    const overview = source("src/lib/dashboard/get-today-overview.ts");
    expect(overview).toContain("doFirst: chatOverview.attentionItems.slice(0, 3)");
    expect(overview).toContain("moneyMoves: moneyMoves.slice(0, 2)");
    expect(page).toContain("const ownerSummary = attention.criticalIssues");
    expect(page).not.toContain("{attention.briefing}");
    expect(page).toContain('<details className="panel progressive-disclosure">');
  });

  it("keeps the desktop Ask Ferocity transcript inside its own scroll region", () => {
    const css = source("src/app/globals.css");
    const chat = source("src/app/app/ferocity/FerocityOwnerChat.tsx");
    const page = source("src/app/app/ferocity/page.tsx");
    expect(css).toContain("height: clamp(620px, calc(100dvh - 150px), 920px)");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).toContain("scrollbar-gutter: stable");
    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain(".auth-panel .ferocity-chat-header");
    expect(chat).toContain("formatWorkspaceTime");
    expect(chat).toContain("workspaceTimeZone");
    expect(page).toContain("getWorkspaceSettings");
  });

  it("keeps contextual suggestions below the composer and labels result links truthfully", () => {
    const chat = source("src/app/app/ferocity/FerocityOwnerChat.tsx");
    const actions = source("src/app/app/ai-workforce/actions.ts");
    const composerIndex = chat.indexOf('className="ferocity-chat-composer"');
    const suggestionIndex = chat.indexOf('aria-label={latestRecommendations.length ? "Relevant next actions"');

    expect(composerIndex).toBeGreaterThan(-1);
    expect(suggestionIndex).toBeGreaterThan(composerIndex);
    expect(chat).not.toContain("Continue where needed");
    expect(chat).not.toContain("Worth using next");
    expect(chat).toContain("turn.actionLabel");
    expect(chat).toContain("Open command details");
    expect(chat).not.toContain(">Open finished work<");
    expect(chat).toContain("/app/ai-workforce/results/${turn.runId}");
    expect(actions).toContain("actionLabel: resultActionLabel");
    expect(actions).toContain("const resultRoute = routesForCommand");
  });

  it("moves a submitted owner message out of the composer immediately", () => {
    const chat = source("src/app/app/ferocity/FerocityOwnerChat.tsx");
    const captureIndex = chat.indexOf("const payload = new FormData(event.currentTarget)");
    const clearIndex = chat.indexOf('setCommand("")', captureIndex);
    const dispatchIndex = chat.indexOf("startDispatch(() => action(payload))", clearIndex);
    expect(captureIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeGreaterThan(captureIndex);
    expect(dispatchIndex).toBeGreaterThan(clearIndex);
    expect(chat).toContain('aria-label="Your message was sent"');
    expect(chat).toContain("{submittedCommand}");
    expect(chat).toContain("Tell Ferocity what to do or ask a question");
  });

  it("keeps secondary controls collapsed until the owner asks for them", () => {
    const expenses = source("src/app/app/expenses/page.tsx");
    const work = source("src/app/app/job-tracker/page.tsx");
    const growth = source("src/app/app/growth/page.tsx");
    const customers = source("src/app/app/lead-command/page.tsx");
    const schedule = source("src/app/app/schedule/page.tsx");
    const money = source("src/app/app/cash-collection/page.tsx");
    const reports = source("src/app/app/reports/page.tsx");
    expect(expenses).toContain("Automatic processing");
    expect(expenses).toContain("progressive-disclosure");
    expect(work.match(/progressive-disclosure/g)?.length).toBeGreaterThanOrEqual(2);
    expect(growth).toContain("Campaigns, channels, publishing, attribution, and history");
    expect(growth).toContain("progressive-disclosure-body");
    expect(customers.match(/progressive-disclosure/g)?.length).toBeGreaterThanOrEqual(2);
    expect(schedule.match(/progressive-disclosure/g)?.length).toBeGreaterThanOrEqual(2);
    expect(money.match(/progressive-disclosure/g)?.length).toBeGreaterThanOrEqual(2);
    expect(reports).toContain("More reports and diagnostics");
  });

  it("closes the persistent workspace menu and keeps its mobile panel below navigation", () => {
    const shell = source("src/components/admin/AppShell.tsx");
    const menu = source("src/components/admin/WorkspaceNavMenu.tsx");
    const css = source("src/app/globals.css");

    expect(shell).toContain("<WorkspaceNavMenu");
    expect(menu).toContain("usePathname()");
    expect(menu).toContain("previousPathnameRef.current !== pathname");
    expect(menu).toContain('closest("a[href]")');
    expect(menu).toContain('event.key !== "Escape"');
    expect(menu).toContain('document.addEventListener("pointerdown"');
    expect(css).toContain("inset: calc(100% + 8px) 0 auto 0");
    expect(css).not.toContain("inset: 74px 10px auto 10px");
  });

  it("keeps the primary tax print actions visible beside document work", () => {
    const expenses = source("src/app/app/expenses/page.tsx");
    expect(expenses).toContain("Tax packets by year");
    expect(expenses).toContain(">Expenses</Link>");
    expect(expenses).toContain(">Deposits</Link>");
    expect(expenses).toContain(">Download CSV</Link>");
    expect(expenses).toContain("...detectedYears, currentYear, currentYear - 1, currentYear - 2");
    expect(expenses).toContain("/app/reports/expense-tax-print?year=${year}");
    expect(expenses).toContain("/app/reports/income-tax-print?year=${year}");
  });

  it("lets long tax packets span pages without splitting transaction rows", () => {
    for (const path of [
      "src/app/app/reports/expense-tax-print/page.tsx",
      "src/app/app/reports/income-tax-print/page.tsx",
    ]) {
      const printPage = source(path);
      expect(printPage).toContain(".tax-print-group{break-inside:auto}");
      expect(printPage).toContain(".tax-print-table thead{display:table-header-group}");
      expect(printPage).toContain(".tax-print-table tr{break-inside:avoid");
      expect(printPage).toContain("@page{margin:.55in}");
    }
  });
});

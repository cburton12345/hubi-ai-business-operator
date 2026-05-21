import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";

const runbooks = [
  {
    title: "Customer onboarding",
    href: "https://github.com/cburton12345/hubi-ai-business-operator/blob/main/docs/customer-onboarding-runbook.md",
    summary: "Create organizations, brands, forms, users, and weekly operating routines."
  },
  {
    title: "Production safety",
    href: "https://github.com/cburton12345/hubi-ai-business-operator/blob/main/docs/production-safety-runbook.md",
    summary: "Secrets, backups, migration rollback, error handling, and verification."
  },
  {
    title: "Production readiness",
    href: "https://github.com/cburton12345/hubi-ai-business-operator/blob/main/docs/phase45-production-readiness.md",
    summary: "Environment policy, RLS, API validation, deploy smoke checks, monitoring, and security review."
  },
  {
    title: "Beta launch",
    href: "https://github.com/cburton12345/hubi-ai-business-operator/blob/main/docs/phase15-16-beta-and-launch-readiness.md",
    summary: "Beta QA sequence and manual-only launch rules."
  }
];

export default function RunbooksPage() {
  return (
    <QueuePageShell
      eyebrow="Runbooks"
      title="Operator Runbooks"
      description="Launch and operating documentation for external customer workspaces."
    >
      <div className="grid">
        {runbooks.map((runbook) => (
          <section className="panel span-4" key={runbook.title}>
            <h2>{runbook.title}</h2>
            <p className="muted">{runbook.summary}</p>
            <Link className="button secondary-button" href={runbook.href}>Open doc</Link>
          </section>
        ))}
      </div>
    </QueuePageShell>
  );
}

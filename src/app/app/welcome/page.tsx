import Link from "next/link";
import { CheckCircle2, CircleDollarSign, LockKeyhole, WandSparkles } from "lucide-react";
import { getCurrentWorkspace, getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { queryPostgres } from "@/lib/db/postgres";

type WelcomeStats = {
  brands: string;
  forms: string;
  subscription_status: string | null;
  plan_key: string | null;
};

async function getWelcomeStats() {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<WelcomeStats>(
    `
    select
      (select count(*) from public.brands where tenant_id = $1)::text as brands,
      (select count(*) from public.forms where tenant_id = $1 and active = true)::text as forms,
      (select status from public.billing_subscriptions where tenant_id = $1 limit 1) as subscription_status,
      (select plan_key from public.billing_subscriptions where tenant_id = $1 limit 1) as plan_key
    `,
    [workspaceId]
  );

  return result?.rows[0] ?? {
    brands: "0",
    forms: "0",
    subscription_status: null,
    plan_key: null
  };
}

export default async function WelcomePage() {
  const [workspace, stats] = await Promise.all([getCurrentWorkspace(), getWelcomeStats()]);

  return (
    <section className="page-section">
      <div className="topbar">
        <div>
          <p className="eyebrow">Welcome</p>
          <h1>Set up {workspace.name} without turning on risky stuff.</h1>
          <p className="muted">
            Your workspace is real. It starts in setup mode so your business info, lead capture, reviews, SEO, automations, and billing can be
            checked before anything sends, publishes, syncs, or spends.
          </p>
        </div>
        <Link className="button" href="/app/build-system">
          Build My System
        </Link>
      </div>

      <section className="grid section-actions">
        <Metric label="Plan" value={stats.plan_key ?? workspace.accountType} />
        <Metric label="Billing" value={stats.subscription_status ?? "not connected"} />
        <Metric label="Brands" value={stats.brands} />
        <Metric label="Lead forms" value={stats.forms} />
      </section>

      <section className="grid section-actions">
        <article className="panel span-6">
          <WandSparkles size={20} />
          <h2>1. Tell Ferocity what to build</h2>
          <p className="muted">
            Use plain words. Ferocity will preview setup changes for services, lead routing, SEO, reviews, follow-up, and automations before
            applying anything.
          </p>
          <Link className="mini-button" href="/app/build-system">
            Start setup
          </Link>
        </article>

        <article className="panel span-6">
          <CheckCircle2 size={20} />
          <h2>2. Check the basics</h2>
          <p className="muted">
            Confirm company name, services, service area, lead form, templates, and the first safe growth loop.
          </p>
          <Link className="mini-button" href="/app/go-live">
            Go live checklist
          </Link>
        </article>

        <article className="panel span-6">
          <LockKeyhole size={20} />
          <h2>3. Keep live actions locked</h2>
          <p className="muted">
            SMS, email, publishing, provider sync, review requests, and ad spend stay gated until keys, consent rules, limits, and approvals are
            ready.
          </p>
          <Link className="mini-button" href="/app/controls">
            Open controls
          </Link>
        </article>

        <article className="panel span-6">
          <CircleDollarSign size={20} />
          <h2>4. Upgrade when ready</h2>
          <p className="muted">
            Trial/setup data stays on this tenant. When billing and tier limits are ready, the workspace upgrades in place instead of moving
            data somewhere else.
          </p>
          <Link className="mini-button" href="/app/billing">
            Billing readiness
          </Link>
        </article>
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

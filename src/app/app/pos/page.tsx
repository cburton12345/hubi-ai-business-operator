import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { PosTerminal } from "./PosTerminal";

export default async function PosPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requirePermission("tenant:view");
  const [customers, inventory, jobs, sales] = await Promise.all([
    queryPostgres<{ id: string; name: string }>(`select id,name from public.customers where tenant_id=$1 and status='active' order by name limit 500`, [actor.workspace.id]),
    queryPostgres<{ id: string; name: string; quantity: string; unit: string | null }>(`select id,name,quantity::text,unit from public.service_inventory_items where tenant_id=$1 and status not in ('retired','maintenance') order by name limit 1000`, [actor.workspace.id]),
    queryPostgres<{ id: string; name: string; customer_id: string }>(`select id,title as name,customer_id from public.service_jobs where tenant_id=$1 and status not in ('canceled','lost') order by updated_at desc limit 500`, [actor.workspace.id]),
    queryPostgres<{ id: string; status: string; tender_type: string; total_cents: number; customer_name: string; created_at: string }>(`select s.id,s.status,s.tender_type,s.total_cents,c.name as customer_name,s.created_at from public.pos_sales s join public.customers c on c.id=s.customer_id where s.tenant_id=$1 order by s.created_at desc limit 50`, [actor.workspace.id])
  ]);
  const error = (await searchParams).error;
  return <QueuePageShell eyebrow="Money & Operations" title="Point of Sale" description="Create one atomic sale across the invoice, payment, ledger, and inventory systems. No external payment is initiated from this screen.">
    {error ? <div className="notice danger">{error}</div> : null}
    <div className="button-row section-actions"><Link className="mini-button" href="/app/cash-collection">Payments & ledger</Link><Link className="mini-button" href="/app/service/inventory">Inventory</Link><Link className="mini-button" href="/app/expenses">Receipts & imports</Link></div>
    <PosTerminal customers={customers?.rows ?? []} inventory={(inventory?.rows ?? []).map((item) => ({ ...item, quantity: Number(item.quantity) }))} jobs={(jobs?.rows ?? []).map((job) => ({ id: job.id, name: job.name, customerId: job.customer_id }))} />
    <section className="panel section-actions"><h2>Recent sales and tender reconciliation</h2><p className="muted">These totals record tenders already received or invoices left open; they do not represent external processor settlement.</p>
      <div className="button-row">{Object.entries((sales?.rows ?? []).reduce<Record<string, number>>((totals, sale) => ({ ...totals, [sale.tender_type]: (totals[sale.tender_type] ?? 0) + sale.total_cents }), {})).map(([tender, total]) => <span className="pill" key={tender}>{tender.replaceAll("_", " ")}: ${(total / 100).toFixed(2)}</span>)}</div>
      <ul className="list section-actions">{(sales?.rows ?? []).map((sale) => <li className="list-row" key={sale.id}><div><Link href={`/app/pos/sales/${sale.id}`}><strong>{sale.customer_name}</strong></Link><p className="muted">{new Date(sale.created_at).toLocaleString("en-US")} · {sale.tender_type.replaceAll("_", " ")}</p></div><span className="pill">${(sale.total_cents / 100).toFixed(2)} · {sale.status.replaceAll("_", " ")}</span></li>)}</ul>
    </section>
  </QueuePageShell>;
}

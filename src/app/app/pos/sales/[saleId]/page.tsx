import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { ReturnForm } from "./ReturnForm";
import { PrintButton } from "./PrintButton";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default async function PosReceiptPage({ params, searchParams }: { params: Promise<{ saleId: string }>; searchParams: Promise<{ error?: string; created?: string; returned?: string }> }) {
  const actor = await requirePermission("tenant:view");
  const { saleId } = await params;
  const [saleResult, itemsResult, returnsResult] = await Promise.all([
    queryPostgres<{ id: string; status: string; tender_type: string; subtotal_cents: number; discount_cents: number; tax_cents: number; total_cents: number; external_reference: string | null; created_at: string; customer_name: string; invoice_id: string; job_title: string | null }>(`select s.id,s.status,s.tender_type,s.subtotal_cents,s.discount_cents,s.tax_cents,s.total_cents,s.external_reference,s.created_at,c.name as customer_name,s.invoice_id,j.title as job_title from public.pos_sales s join public.customers c on c.id=s.customer_id left join public.service_jobs j on j.id=s.job_id where s.tenant_id=$1 and s.id=$2`, [actor.workspace.id, saleId]),
    queryPostgres<{ id: string; name: string; quantity: string; unit_price_cents: number; total_cents: number; returned: string }>(`select i.id,i.name,i.quantity::text,i.unit_price_cents,i.total_cents,coalesce((select sum(ri.quantity) from public.pos_return_items ri where ri.pos_sale_item_id=i.id),0)::text as returned from public.pos_sale_items i where i.tenant_id=$1 and i.pos_sale_id=$2 order by i.created_at`, [actor.workspace.id, saleId]),
    queryPostgres<{ id: string; amount_cents: number; reason: string; created_at: string }>(`select id,amount_cents,reason,created_at from public.pos_returns where tenant_id=$1 and pos_sale_id=$2 order by created_at`, [actor.workspace.id, saleId])
  ]);
  const sale = saleResult?.rows[0]; if (!sale) notFound();
  const items = (itemsResult?.rows ?? []).map((item) => ({ ...item, quantity: Number(item.quantity), returned: Number(item.returned), remaining: Math.max(0, Number(item.quantity) - Number(item.returned)) }));
  const query = await searchParams;
  return <main className="tax-print-page">
    <style>{`@media print {.tax-print-hide{display:none!important}.tax-print-page{padding:0!important}} .tax-print-page{max-width:850px;margin:0 auto;padding:32px}.receipt-table{width:100%;border-collapse:collapse}.receipt-table th,.receipt-table td{padding:8px;border-bottom:1px solid #ccc;text-align:left}.receipt-table .number{text-align:right}`}</style>
    <div className="button-row tax-print-hide"><Link className="mini-button" href="/app/pos">Back to POS</Link><PrintButton /></div>
    {query.error ? <div className="notice danger tax-print-hide">{query.error}</div> : null}{query.created ? <div className="notice success tax-print-hide">Sale completed atomically.</div> : null}{query.returned ? <div className="notice success tax-print-hide">Return recorded and linked stock restored where selected.</div> : null}
    <header><p>Ferocity point of sale</p><h1>Receipt {sale.id.slice(0, 8).toUpperCase()}</h1><p>{new Date(sale.created_at).toLocaleString("en-US")} · {sale.customer_name} · {sale.status.replaceAll("_", " ")}</p>{sale.job_title ? <p>Job/property: {sale.job_title}</p> : null}</header>
    <table className="receipt-table"><thead><tr><th>Item</th><th className="number">Qty</th><th className="number">Price</th><th className="number">Total</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.name}{item.returned ? <small><br />Returned: {item.returned}</small> : null}</td><td className="number">{item.quantity}</td><td className="number">{money(item.unit_price_cents)}</td><td className="number">{money(item.total_cents)}</td></tr>)}</tbody></table>
    <dl><div><dt>Subtotal</dt><dd>{money(sale.subtotal_cents)}</dd></div><div><dt>Discount</dt><dd>{money(sale.discount_cents)}</dd></div><div><dt>Tax</dt><dd>{money(sale.tax_cents)}</dd></div><div><dt>Total</dt><dd><strong>{money(sale.total_cents)}</strong></dd></div><div><dt>Tender</dt><dd>{sale.tender_type.replaceAll("_", " ")}</dd></div></dl>
    {(returnsResult?.rows ?? []).length ? <section><h2>Returns</h2>{returnsResult?.rows.map((row) => <p key={row.id}>{new Date(row.created_at).toLocaleDateString("en-US")} · {money(row.amount_cents)} · {row.reason}</p>)}</section> : null}
    {items.some((item) => item.remaining > 0) && sale.status !== "refunded" ? <ReturnForm saleId={saleId} items={items.filter((item) => item.remaining > 0).map((item) => ({ id: item.id, name: item.name, remaining: item.remaining }))} /> : null}
  </main>;
}

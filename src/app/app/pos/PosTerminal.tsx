"use client";

import { useActionState, useMemo, useState } from "react";
import { createPosSaleAction } from "./actions";

type Option = { id: string; name: string };
type InventoryOption = Option & { quantity: number; unit: string | null };
type JobOption = Option & { customerId: string };
type Line = { key: string; inventoryItemId: string; name: string; quantity: string; unitPrice: string };

const newLine = (): Line => ({ key: crypto.randomUUID(), inventoryItemId: "", name: "", quantity: "1", unitPrice: "" });

export function PosTerminal({ customers, inventory, jobs }: { customers: Option[]; inventory: InventoryOption[]; jobs: JobOption[] }) {
  const [state, action, pending] = useActionState(createPosSaleAction, { ok: false });
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [discount, setDiscount] = useState("0");
  const [taxRate, setTaxRate] = useState("0");
  const [customerId, setCustomerId] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const items = lines.filter((line) => line.name.trim()).map((line) => ({
    inventoryItemId: line.inventoryItemId || null,
    name: line.name.trim(), quantity: Number(line.quantity), unitPriceCents: Math.round(Number(line.unitPrice || 0) * 100)
  }));
  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0);
    const discounted = Math.max(0, subtotal - (Number(discount) || 0));
    const tax = discounted * (Number(taxRate) || 0) / 100;
    return { subtotal, tax, total: discounted + tax };
  }, [lines, discount, taxRate]);
  const update = (key: string, patch: Partial<Line>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  return <form action={action} className="panel form-stack" aria-busy={pending}>
    <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
    <input name="items" type="hidden" value={JSON.stringify(items)} />
    <div className="grid">
      <label className="span-4">Customer<select name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Walk-in customer</option>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></label>
      <label className="span-4">Sale title<input name="title" defaultValue="Point-of-sale purchase" required /></label>
      <label className="span-4">Tender<select name="tenderType" defaultValue="unpaid"><option value="unpaid">Unpaid / invoice</option><option value="cash">Cash received</option><option value="cash_app">Cash App received</option><option value="check">Check received</option><option value="card_external">Card processed externally</option><option value="external">Other external payment</option></select></label>
      <label className="span-4">Job or property<select name="jobId" defaultValue=""><option value="">No job/property assignment</option>{jobs.filter((job) => job.customerId === customerId).map((job) => <option value={job.id} key={job.id}>{job.name}</option>)}</select></label>
    </div>
    <h2>Items</h2>
    {lines.map((line, index) => <div className="grid compact-grid" key={line.key}>
      <label className="span-4">Inventory link<select value={line.inventoryItemId} onChange={(event) => {
        const selected = inventory.find((item) => item.id === event.target.value);
        update(line.key, { inventoryItemId: event.target.value, name: selected?.name ?? line.name });
      }}><option value="">No inventory deduction</option>{inventory.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.quantity} {item.unit ?? "available"}</option>)}</select></label>
      <label className="span-3">Item<input value={line.name} onChange={(event) => update(line.key, { name: event.target.value })} required /></label>
      <label className="span-2">Quantity<input inputMode="decimal" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => update(line.key, { quantity: event.target.value })} required /></label>
      <label className="span-2">Unit price<input inputMode="decimal" min="0" step="0.01" value={line.unitPrice} onChange={(event) => update(line.key, { unitPrice: event.target.value })} required /></label>
      <button className="mini-button span-1" type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} aria-label={`Remove item ${index + 1}`}>Remove</button>
    </div>)}
    <button className="mini-button" type="button" onClick={() => setLines((current) => [...current, newLine()])}>Add another item</button>
    <div className="grid">
      <label className="span-3">Discount<input name="discount" inputMode="decimal" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label>
      <label className="span-3">Tax rate %<input name="taxRate" inputMode="decimal" min="0" max="200" step="0.001" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></label>
      <label className="span-6">Payment/reference note<input name="externalReference" placeholder="Check number or external transaction reference" /></label>
    </div>
    <div className="notice"><span>Subtotal ${totals.subtotal.toFixed(2)} · Tax ${totals.tax.toFixed(2)} · <strong>Total ${totals.total.toFixed(2)}</strong></span></div>
    <p className="muted">Selecting cash, Cash App, check, or external tender records a payment already received. Ferocity does not charge a card from this screen.</p>
    {state.error ? <div className="notice danger" role="alert">{state.error}</div> : null}
    <button className="button" type="submit" disabled={pending || !items.length}>{pending ? "Completing sale…" : "Complete sale"}</button>
  </form>;
}

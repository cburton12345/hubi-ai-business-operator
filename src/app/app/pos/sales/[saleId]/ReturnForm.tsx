"use client";

import { useActionState, useState } from "react";
import { recordPosReturnAction } from "../../actions";

export function ReturnForm({ saleId, items }: { saleId: string; items: { id: string; name: string; remaining: number }[] }) {
  const [state, action, pending] = useActionState(recordPosReturnAction, { ok: false });
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const selected = items.flatMap((item) => {
    const quantity = Number(quantities[item.id] ?? 0);
    return quantity > 0 ? [{ itemId: item.id, quantity }] : [];
  });
  return <form action={action} className="panel form-stack tax-print-hide" aria-busy={pending}>
    <h2>Record return or refund</h2>
    <input name="saleId" type="hidden" value={saleId} /><input name="idempotencyKey" type="hidden" value={idempotencyKey} /><input name="items" type="hidden" value={JSON.stringify(selected)} />
    {items.map((item) => <label key={item.id}>{item.name} · up to {item.remaining}<input inputMode="decimal" min="0" max={item.remaining} step="0.0001" value={quantities[item.id] ?? "0"} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} /></label>)}
    <label>Reason<input name="reason" required maxLength={500} placeholder="Returned merchandise, correction, or customer refund" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <label className="checkbox-row"><input name="restock" type="checkbox" defaultChecked /><span>Return linked inventory to available stock</span></label>
    <p className="muted">This records a refund already issued through the original tender. It does not contact or charge an external payment provider.</p>
    {state.error ? <div className="notice danger" role="alert">{state.error}</div> : null}
    <button className="button" type="submit" disabled={pending || !selected.length}>{pending ? "Recording return…" : "Record return"}</button>
  </form>;
}

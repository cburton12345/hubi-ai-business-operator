import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { adjustInventoryQuantityAction, createInventoryItemAction, createInventoryLocationAction } from "@/app/app/service/actions";
import { getServiceInventory } from "@/lib/service-ops/get-service-inventory";

export default async function ServiceInventoryPage() {
  const inventory = await getServiceInventory();

  return (
    <QueuePageShell
      eyebrow="Service Operations"
      title="Inventory And Equipment"
      description="Track parts, materials, tools, equipment, and vehicles for the selected organization."
    >
      <div className="section-actions button-row">
        <Link className="button secondary-button" href="/app/service">Service command center</Link>
        <Link className="button secondary-button" href="/app/service/routes">Route planning</Link>
        <Link className="button secondary-button" href="/app/estimator">Purchasing & takeoffs</Link>
      </div>

      <div className="grid section-actions">
        <Metric label="Items" value={inventory.metrics.total} />
        <Metric label="Low stock" value={inventory.metrics.lowStock} />
        <Metric label="In use" value={inventory.metrics.inUse} />
        <Metric label="Maintenance" value={inventory.metrics.maintenance} />
      </div>

      <div className="grid">
        <section className="panel span-4">
          <h2>Add item</h2>
          <form action={createInventoryItemAction} className="form-stack">
            <input name="name" placeholder="Item name" required />
            <select name="category" defaultValue="part">
              <option value="part">Part</option>
              <option value="material">Material</option>
              <option value="equipment">Equipment</option>
              <option value="tool">Tool</option>
              <option value="vehicle">Vehicle</option>
              <option value="other">Other</option>
            </select>
            <select name="status" defaultValue="available">
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="in_use">In use</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </select>
            <div className="two-col">
              <input name="quantity" inputMode="decimal" placeholder="Quantity" />
              <input name="reorderThreshold" inputMode="decimal" placeholder="Reorder threshold" />
            </div>
            <div className="two-col">
              <input name="unit" placeholder="Unit" />
              <input name="location" placeholder="Location" />
            </div>
            <textarea name="notes" rows={3} placeholder="Internal notes" />
            <button className="button" type="submit">Add item</button>
          </form>
        </section>

        <section className="panel span-8">
          <h2>Tracked items</h2>
          <ul className="list">
            {inventory.items.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.name}</h3>
                  <p className="muted">{item.category} / {item.quantity} / reorder {item.threshold}</p>
                  <p className="muted">{item.location} / {item.assignedJob}</p>
                  {item.notes ? <p>{item.notes}</p> : null}
                  <form action={adjustInventoryQuantityAction} className="compact-form section-actions">
                    <input name="itemId" type="hidden" value={item.id} />
                    <input name="quantityDelta" inputMode="decimal" placeholder="+ received / - used" required />
                    <input name="reason" placeholder="Why stock changed" required />
                    <button className="mini-button" type="submit">Record movement</button>
                  </form>
                </div>
                <span className="pill">{item.status}</span>
              </li>
            ))}
            {inventory.items.length === 0 ? <li className="list-row"><span className="muted">No inventory or equipment items yet.</span></li> : null}
          </ul>
        </section>
        <section className="panel span-5">
          <h2>Stock locations</h2>
          <form action={createInventoryLocationAction} className="form-stack">
            <input name="name" placeholder="Main warehouse or Truck 2" required />
            <select name="locationType" defaultValue="warehouse">
              <option value="warehouse">Warehouse</option>
              <option value="vehicle">Vehicle</option>
              <option value="office">Office</option>
              <option value="job_site">Job site</option>
              <option value="virtual">Virtual</option>
            </select>
            <input name="address" placeholder="Optional address" />
            <button className="mini-button" type="submit">Add location</button>
          </form>
          <ul className="list section-actions">
            {inventory.locations.map((location) => (
              <li className="list-row" key={location.id}>
                <div><strong>{location.name}</strong><p className="muted">{location.type}{location.address ? ` / ${location.address}` : ""}</p></div>
                <span className="pill">{location.itemCount} items</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel span-7">
          <h2>Stock movement ledger</h2>
          <p className="muted">Every receipt, use, transfer, return, reservation, and correction should land here instead of silently replacing a quantity.</p>
          <ul className="list">
            {inventory.movements.map((movement) => (
              <li className="list-row" key={movement.id}>
                <div><strong>{movement.itemName}</strong><p className="muted">{movement.reason || movement.type} / {movement.createdAt}</p></div>
                <span className="pill">{Number(movement.delta) > 0 ? "+" : ""}{movement.delta}</span>
              </li>
            ))}
            {inventory.movements.length === 0 ? <li className="list-row"><span className="muted">No stock movements recorded yet.</span></li> : null}
          </ul>
        </section>
      </div>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

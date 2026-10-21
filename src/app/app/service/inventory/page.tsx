import { randomUUID } from "node:crypto";
import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { createInventoryItemAction, createInventoryLocationAction } from "@/app/app/service/actions";
import { getServiceInventory } from "@/lib/service-ops/get-service-inventory";
import {
  allocateConsumedMaterialAction,
  cancelMaterialAllocationAction,
  consumeInventoryReservationAction,
  recordInventoryCountAction,
  releaseInventoryReservationAction,
  reserveInventoryAction,
  transferInventoryAction
} from "./actions";

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
              <select name="locationId" defaultValue="">
                <option value="">No opening-stock location</option>
                {inventory.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
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
        <section className="panel span-12">
          <h2>Location balances</h2>
          <p className="muted">On hand is physical stock. Reserved stock remains on hand but is unavailable to other work.</p>
          <ul className="list section-actions">
            {inventory.balances.map((balance) => (
              <li className="list-row" key={`${balance.itemId}:${balance.locationId}`}>
                <div><strong>{balance.itemName}</strong><p className="muted">{balance.locationName}</p></div>
                <div className="inline-actions"><span className="pill">{balance.onHand} on hand</span><span className="pill">{balance.reserved} reserved</span><span className="pill">{balance.available} available</span></div>
              </li>
            ))}
            {inventory.balances.length === 0 ? <li className="list-row"><span className="muted">No location balances yet. Existing stock is backfilled when migration 260 is applied.</span></li> : null}
          </ul>
        </section>
        <section className="panel span-4">
          <h2>Transfer stock</h2>
          <form action={transferInventoryAction} className="form-stack">
            <select name="itemId" required defaultValue=""><option value="" disabled>Item</option>{inventory.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select name="fromLocationId" required defaultValue=""><option value="" disabled>From location</option>{inventory.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
            <select name="toLocationId" required defaultValue=""><option value="" disabled>To location</option>{inventory.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
            <input name="quantity" inputMode="decimal" placeholder="Quantity" required />
            <input name="reason" placeholder="Reason" required />
            <input name="idempotencyKey" type="hidden" value={randomUUID()} />
            <button className="mini-button" type="submit">Transfer</button>
          </form>
        </section>
        <section className="panel span-4">
          <h2>Reserve for work</h2>
          <form action={reserveInventoryAction} className="form-stack">
            <select name="itemId" required defaultValue=""><option value="" disabled>Item</option>{inventory.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select name="locationId" required defaultValue=""><option value="" disabled>Stock location</option>{inventory.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
            <select name="workOrderId" required defaultValue=""><option value="" disabled>Work order</option>{inventory.workOrders.map((workOrder) => <option key={workOrder.id} value={workOrder.id}>{workOrder.label}</option>)}</select>
            <input name="quantity" inputMode="decimal" placeholder="Quantity" required />
            <input name="idempotencyKey" type="hidden" value={randomUUID()} />
            <button className="mini-button" type="submit">Reserve</button>
          </form>
        </section>
        <section className="panel span-4">
          <h2>Physical count</h2>
          <form action={recordInventoryCountAction} className="form-stack">
            <select name="itemId" required defaultValue=""><option value="" disabled>Item</option>{inventory.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select name="locationId" required defaultValue=""><option value="" disabled>Location</option>{inventory.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
            <input name="observedQuantity" inputMode="decimal" placeholder="Observed quantity" required />
            <input name="reason" placeholder="Count note" required />
            <input name="idempotencyKey" type="hidden" value={randomUUID()} />
            <button className="mini-button" type="submit">Apply count</button>
          </form>
        </section>
        <section className="panel span-12">
          <h2>Open reservations</h2>
          <ul className="list section-actions">
            {inventory.reservations.map((reservation) => (
              <li className="list-row" key={reservation.id}>
                <div><strong>{reservation.itemName}</strong><p className="muted">{reservation.locationName} / {reservation.workOrder} / {reservation.remaining} remaining</p></div>
                <div className="inline-actions">
                  <form action={consumeInventoryReservationAction} className="compact-form">
                    <input name="reservationId" type="hidden" value={reservation.id} />
                    <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                    <input name="quantity" inputMode="decimal" placeholder="Used" required />
                    <button className="mini-button" type="submit">Consume</button>
                  </form>
                  <form action={releaseInventoryReservationAction}>
                    <input name="reservationId" type="hidden" value={reservation.id} />
                    <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                    <button className="mini-button secondary-button" type="submit">Release remainder</button>
                  </form>
                </div>
              </li>
            ))}
            {inventory.reservations.length === 0 ? <li className="list-row"><span className="muted">No open reservations.</span></li> : null}
          </ul>
        </section>
        <section className="panel span-7">
          <h2>Split consumed materials across work</h2>
          <p className="muted">Allocate the real consumed quantity unequally across jobs or properties. Ferocity preserves any unassigned remainder instead of guessing.</p>
          <ul className="list section-actions">
            {inventory.consumptions.map((consumption) => (
              <li className="list-row" key={consumption.id}>
                <div>
                  <strong>{consumption.itemName}</strong>
                  <p className="muted">Consumed {consumption.consumed} · assigned {consumption.allocated} · {consumption.remaining} remaining · {consumption.cost} source cost · {consumption.createdAt}</p>
                  <form action={allocateConsumedMaterialAction} className="compact-form section-actions">
                    <input name="sourceTransactionId" type="hidden" value={consumption.id} />
                    <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                    <input name="quantity" type="number" min="0.0001" max={consumption.remaining} step="0.0001" placeholder="Quantity" required />
                    <select name="serviceJobId" defaultValue=""><option value="">No job selected</option>{inventory.jobs.map((job) => <option key={job.id} value={job.id}>{job.label}</option>)}</select>
                    <select name="customerLocationId" defaultValue=""><option value="">No property selected</option>{inventory.customerLocations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}</select>
                    <input name="note" placeholder="Optional allocation note" />
                    <button className="mini-button" type="submit">Assign this portion</button>
                  </form>
                </div>
              </li>
            ))}
            {inventory.consumptions.length === 0 ? <li className="list-row"><span className="muted">No consumed inventory has an unassigned remainder.</span></li> : null}
          </ul>
        </section>
        <section className="panel span-5">
          <h2>Material cost assignments</h2>
          <ul className="list section-actions">
            {inventory.materialAllocations.map((allocation) => (
              <li className="list-row" key={allocation.id}>
                <div><strong>{allocation.itemName} · {allocation.quantity}</strong><p className="muted">{allocation.target} · {allocation.cost}{allocation.note ? ` · ${allocation.note}` : ""}</p></div>
                <form action={cancelMaterialAllocationAction}>
                  <input name="allocationId" type="hidden" value={allocation.id} />
                  <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                  <button className="mini-button secondary-button" type="submit">Remove assignment</button>
                </form>
              </li>
            ))}
            {inventory.materialAllocations.length === 0 ? <li className="list-row"><span className="muted">No material costs assigned yet.</span></li> : null}
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

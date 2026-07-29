import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getPricebookDashboard } from "@/lib/service-ops/get-pricebook";
import {
  createPricebookCategoryAction,
  saveMembershipProgramAction,
  savePricebookItemAction
} from "./actions";

const itemTypes = ["service", "material", "labor", "equipment", "fee", "discount"];

export default async function PricebookPage() {
  const dashboard = await getPricebookDashboard();
  return (
    <QueuePageShell
      eyebrow="Money"
      title="Pricebook & memberships"
      description="Create consistent, profitable estimates without retyping scope and pricing on every job."
    >
      <div className="metric-grid">
        <Metric label="Active items" value={dashboard.metrics.activeItems} />
        <Metric label="Missing price" value={dashboard.metrics.unpricedItems} />
        <Metric label="Margin below 20%" value={dashboard.metrics.lowMarginItems} />
        <Metric label="Membership offers" value={dashboard.metrics.activeMemberships} />
      </div>

      <div className="grid section-actions">
        <section className="panel span-4 form-stack">
          <h2>Add category</h2>
          <p className="muted">Keep the field catalog easy to scan: repairs, replacements, maintenance, materials, and fees.</p>
          <form action={createPricebookCategoryAction} className="form-stack">
            <label>Name<input name="name" required /></label>
            <label>Description<textarea name="description" rows={3} /></label>
            <button className="button" type="submit">Save category</button>
          </form>
          <ul className="list">
            {dashboard.categories.map((category) => (
              <li className="list-row" key={category.id}>
                <div><strong>{category.name}</strong><p className="muted">{category.description || "No description"}</p></div>
                <span className="pill">{category.itemCount} items</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-8 form-stack">
          <h2>Add a priced item</h2>
          <form action={savePricebookItemAction} className="form-stack">
            <div className="form-grid three">
              <label>Category<select name="categoryId" defaultValue=""><option value="">Uncategorized</option>{dashboard.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label>Type<select name="itemType" defaultValue="service">{itemTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label>SKU<input name="sku" /></label>
            </div>
            <label>Name<input name="name" required /></label>
            <label>Customer description<textarea name="description" rows={3} /></label>
            <div className="form-grid three">
              <label>Unit<input name="unit" defaultValue="each" required /></label>
              <label>Internal cost<input name="cost" inputMode="decimal" defaultValue="0.00" /></label>
              <label>Customer price<input name="price" inputMode="decimal" defaultValue="0.00" /></label>
            </div>
            <label className="inline-checkbox"><input name="taxable" type="checkbox" defaultChecked /> Taxable</label>
            <button className="button" type="submit">Add to pricebook</button>
          </form>
        </section>

        <section className="panel span-12">
          <h2>Catalog</h2>
          <p className="muted">Margin is based on saved internal cost and customer price. Ferocity flags risk but does not silently change pricing.</p>
          <div className="card-grid">
            {dashboard.items.map((item) => (
              <details className="notice-card" key={item.id}>
                <summary>
                  <strong>{item.name}</strong> <span className="pill">{item.price}</span>
                  <span className="muted"> {item.categoryName} / {item.marginPercent === null ? "no price" : `${item.marginPercent}% margin`}</span>
                </summary>
                <form action={savePricebookItemAction} className="form-stack section-actions">
                  <input name="itemId" type="hidden" value={item.id} />
                  <div className="form-grid three">
                    <label>Category<select name="categoryId" defaultValue={item.categoryId}><option value="">Uncategorized</option>{dashboard.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                    <label>Type<select name="itemType" defaultValue={item.type}>{itemTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                    <label>SKU<input name="sku" defaultValue={item.sku} /></label>
                  </div>
                  <label>Name<input name="name" defaultValue={item.name} required /></label>
                  <label>Description<textarea name="description" rows={2} defaultValue={item.description} /></label>
                  <div className="form-grid three">
                    <label>Unit<input name="unit" defaultValue={item.unit} required /></label>
                    <label>Cost<input name="cost" inputMode="decimal" defaultValue={item.costValue} /></label>
                    <label>Price<input name="price" inputMode="decimal" defaultValue={item.priceValue} /></label>
                  </div>
                  <div className="toggle-grid">
                    <label><input name="taxable" type="checkbox" defaultChecked /> Taxable</label>
                    <label><input name="active" type="checkbox" defaultChecked={item.active} /> Active</label>
                  </div>
                  <button className="mini-button" type="submit">Save item</button>
                </form>
              </details>
            ))}
            {dashboard.items.length === 0 ? <p className="muted">Add the services and materials your team sells most often.</p> : null}
          </div>
        </section>

        <section className="panel span-12">
          <h2>Membership offers</h2>
          <p className="muted">Sell recurring value—planned visits, preferred service, and transparent discounts—not a vague subscription.</p>
          <form action={saveMembershipProgramAction} className="form-stack section-actions">
            <div className="form-grid three">
              <label>Name<input name="name" placeholder="Comfort Care Plan" required /></label>
              <label>Billing<select name="frequency" defaultValue="monthly"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>
              <label>Price<input name="price" inputMode="decimal" defaultValue="0.00" /></label>
            </div>
            <label>Customer benefit summary<textarea name="description" rows={2} /></label>
            <div className="form-grid three">
              <label>Visits per year<input name="visitsPerYear" type="number" min="0" max="52" defaultValue="1" /></label>
              <label>Service discount %<input name="discountPercent" inputMode="decimal" defaultValue="0" /></label>
              <label className="inline-checkbox"><input name="priorityService" type="checkbox" /> Priority service</label>
            </div>
            <button className="button" type="submit">Add membership offer</button>
          </form>
          <div className="card-grid section-actions">
            {dashboard.memberships.map((membership) => (
              <details className="notice-card" key={membership.id}>
                <summary><strong>{membership.name}</strong> <span className="pill">{membership.price}/{membership.frequency}</span></summary>
                <form action={saveMembershipProgramAction} className="form-stack section-actions">
                  <input name="membershipId" type="hidden" value={membership.id} />
                  <label>Name<input name="name" defaultValue={membership.name} required /></label>
                  <label>Description<textarea name="description" rows={2} defaultValue={membership.description} /></label>
                  <div className="form-grid three">
                    <label>Billing<select name="frequency" defaultValue={membership.frequency}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>
                    <label>Price<input name="price" defaultValue={membership.priceValue} /></label>
                    <label>Visits/year<input name="visitsPerYear" type="number" defaultValue={membership.visitsPerYear} /></label>
                  </div>
                  <label>Discount %<input name="discountPercent" defaultValue={membership.discountPercent} /></label>
                  <div className="toggle-grid">
                    <label><input name="priorityService" type="checkbox" defaultChecked={membership.priorityService} /> Priority service</label>
                    <label><input name="active" type="checkbox" defaultChecked={membership.active} /> Active</label>
                  </div>
                  <button className="mini-button" type="submit">Save membership</button>
                </form>
              </details>
            ))}
          </div>
        </section>
      </div>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong></div>;
}

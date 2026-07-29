import Link from "next/link";
import { Calculator, ClipboardCheck, PackageSearch, ShieldAlert, ShoppingCart } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getEstimatorDashboard } from "@/lib/estimator/get-estimator-dashboard";
import {
  createBidFromTakeoffAction,
  createChangeOrderAction,
  createEstimatorReviewRecordAction,
  createEstimatorTakeoffAction,
  createOrderListFromTakeoffAction,
  markQuoteReceivedAction,
  markQuoteRequestedAction,
  importSupplierPriceListAction,
  recordManualPriceAction,
  selectPackageOptionAction,
  createSubstitutionReviewAction,
  updateEstimatorApprovalAction,
  updateInventoryMatchAction
} from "./actions";

const tradeOptions = [
  ["shingle_roofing", "Shingle roofing"],
  ["metal_roofing", "Metal roofing"],
  ["metal_siding", "Metal siding"],
  ["vinyl_siding", "Vinyl siding"],
  ["gutters", "Gutters"],
  ["framing", "Framing"],
  ["drywall", "Drywall"],
  ["flooring", "Flooring"],
  ["concrete", "Concrete"],
  ["insulation", "Insulation"],
  ["painting", "Painting"],
  ["ductwork", "Basic ductwork"],
  ["plumbing", "Basic plumbing materials"],
  ["electrical", "Basic electrical materials"]
];

function tone(status: string) {
  if (["needs_measurements", "blocking", "high"].includes(status)) return "high";
  if (["needs_review", "medium"].includes(status)) return "medium";
  return "";
}

export default async function EstimatorPage() {
  const dashboard = await getEstimatorDashboard();

  return (
    <QueuePageShell
      eyebrow="AI Estimator"
      title="Build Reviewed Takeoffs, Bids, And Material Lists"
      description="Turn field notes, measurements, photos, or plan notes into structured takeoffs. Ferocity shows formulas, assumptions, warnings, and order-list drafts before any bid is sent or material is ordered."
    >
      <section className="grid section-actions">
        <Metric label="Takeoffs" value={dashboard.metrics.takeoffs} icon={<Calculator size={18} />} />
        <Metric label="Need review" value={dashboard.metrics.reviewRequired} icon={<ShieldAlert size={18} />} />
        <Metric label="Warnings" value={dashboard.metrics.warnings} icon={<ClipboardCheck size={18} />} />
        <Metric label="Ready for bid" value={dashboard.metrics.readyForBid} icon={<ShoppingCart size={18} />} />
      </section>

      <section className="grid section-actions">
        <Metric label="Need quotes" value={dashboard.metrics.quoteRequests} icon={<PackageSearch size={18} />} />
        <Metric label="Stock matches" value={dashboard.metrics.inventoryMatches} icon={<ClipboardCheck size={18} />} />
        <Metric label="Package checks" value={dashboard.metrics.packageReviews} icon={<ShoppingCart size={18} />} />
        <Metric label="Approval items" value={dashboard.metrics.approvalRequirements} icon={<ShieldAlert size={18} />} />
      </section>

      <section className="grid section-actions">
        <Metric label="Stale prices" value={dashboard.metrics.priceRefreshes} icon={<ShieldAlert size={18} />} />
        <Metric label="Change orders" value={dashboard.metrics.changeOrders} icon={<ClipboardCheck size={18} />} />
        <Metric label="Plan/code reviews" value={dashboard.metrics.validationReviews} icon={<PackageSearch size={18} />} />
        <Metric label="Versions saved" value={dashboard.metrics.estimateVersions} icon={<Calculator size={18} />} />
      </section>

      <section className="grid section-actions">
        <Metric label="Stock reserved" value={dashboard.metrics.inventoryReservations} icon={<ClipboardCheck size={18} />} />
        <Metric label="Manual prices" value={dashboard.metrics.manualPrices} icon={<ShoppingCart size={18} />} />
        <Metric label="Substitution reviews" value={dashboard.metrics.substitutionReviews} icon={<ShieldAlert size={18} />} />
        <Metric label="Delivery reviews" value={dashboard.metrics.deliveryReviews} icon={<PackageSearch size={18} />} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Built into bids</p>
            <h2>Estimate work without guessing what the AI assumed.</h2>
            <p className="muted">
              The estimator keeps the original field note, extracts measurements, calculates material quantities, records assumptions, and flags missing or risky details. Supplier pricing is ready for authorized APIs, uploaded price lists, account pricing, or manual verified entries.
            </p>
          </div>
          <div className="inline-actions">
            <Link className="button secondary-button" href="/app/job-tracker">Jobs & Money</Link>
            <Link className="button secondary-button" href="/app/ai-walkthrough">AI Walkthrough</Link>
          </div>
        </div>
      </section>

      <section className="grid section-actions">
        <section className="panel span-7">
          <h2>Create Takeoff</h2>
          <p className="muted">
            Start with normal field notes or manual measurements. Spanish or English notes from the walkthrough/audio flow can be pasted here now; direct audio handoff uses the same structured measurement layer.
          </p>
          <form action={createEstimatorTakeoffAction} className="stacked-form">
            <div className="form-grid two">
              <label>
                Existing estimate
                <select name="estimateId" defaultValue="">
                  <option value="">Create or link later</option>
                  {dashboard.estimates.map((estimate) => (
                    <option key={estimate.id} value={estimate.id}>{estimate.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Existing customer
                <select name="customerId" defaultValue="">
                  <option value="">Create or type below</option>
                  {dashboard.customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid two">
              <label>
                New customer name
                <input name="newCustomerName" placeholder="Only needed if no existing customer" />
              </label>
              <label>
                Job / bid title
                <input name="jobTitle" placeholder="Roof replacement on Oak Street" />
              </label>
            </div>
            <div className="form-grid four">
              <label>
                Trade
                <select name="tradeKey" defaultValue="shingle_roofing">
                  {tradeOptions.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Quality
                <select name="qualityLevel" defaultValue="standard">
                  <option value="budget">Budget</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label>
                Source
                <select name="sourceType" defaultValue="typed_note">
                  <option value="typed_note">Typed note</option>
                  <option value="spoken_note">Spoken note</option>
                  <option value="audio_translation">Audio translation</option>
                  <option value="photo_note">Photo note</option>
                  <option value="uploaded_plan">Uploaded plan</option>
                  <option value="manual_field">Manual fields</option>
                  <option value="job_record">Existing job</option>
                </select>
              </label>
              <label>
                Waste %
                <input name="wastePercent" inputMode="decimal" placeholder="10" />
              </label>
            </div>
            <label>
              Field note
              <textarea
                name="fieldNote"
                rows={5}
                placeholder="Example: Roof is 42 by 28, two sides, 6/12 pitch, 2 ft overhang, about 60 ft ridge. Use standard shingles."
              />
            </label>
            <div className="form-grid two">
              <label>
                Job address
                <input name="jobAddress" placeholder="123 Main St" />
              </label>
              <label>
                ZIP code
                <input name="jobPostalCode" placeholder="54701" />
              </label>
            </div>
            <details className="panel subtle-panel">
              <summary>Measurements</summary>
              <div className="form-grid four section-actions">
                <label>Length ft<input name="lengthFt" inputMode="decimal" /></label>
                <label>Width ft<input name="widthFt" inputMode="decimal" /></label>
                <label>Height ft<input name="heightFt" inputMode="decimal" /></label>
                <label>Area sq ft<input name="areaSqFt" inputMode="decimal" /></label>
                <label>Perimeter ft<input name="perimeterFt" inputMode="decimal" /></label>
                <label>Pitch rise / 12<input name="pitchRise" inputMode="decimal" /></label>
                <label>Roof sections<input name="roofSections" inputMode="decimal" /></label>
                <label>Overhang ft<input name="overhangFt" inputMode="decimal" /></label>
                <label>Ridge ft<input name="ridgeFt" inputMode="decimal" /></label>
                <label>Valley ft<input name="valleyFt" inputMode="decimal" /></label>
                <label>Eave ft<input name="eaveFt" inputMode="decimal" /></label>
                <label>Rake ft<input name="rakeFt" inputMode="decimal" /></label>
                <label>Openings sq ft<input name="openingsSqFt" inputMode="decimal" /></label>
                <label>Corners<input name="corners" inputMode="decimal" /></label>
                <label>Package coverage<input name="coveragePerPackage" inputMode="decimal" /></label>
                <label>Depth inches<input name="depthIn" inputMode="decimal" /></label>
                <label>Panel width inches<input name="panelCoverageWidthIn" inputMode="decimal" /></label>
                <label>Panel length ft<input name="panelLengthFt" inputMode="decimal" /></label>
              </div>
            </details>
            <details className="panel subtle-panel" open>
              <summary>Labor, time, overhead, and margin</summary>
              <div className="form-grid four section-actions">
                <label>Crew size<input name="crewSize" inputMode="decimal" placeholder="2" /></label>
                <label>
                  Crew experience
                  <select name="crewExperience" defaultValue="unknown">
                    <option value="unknown">Unknown</option>
                    <option value="new">New crew</option>
                    <option value="average">Average</option>
                    <option value="experienced">Experienced</option>
                  </select>
                </label>
                <label>Stories<input name="stories" inputMode="decimal" placeholder="1" /></label>
                <label>
                  Access
                  <select name="accessDifficulty" defaultValue="normal">
                    <option value="normal">Normal</option>
                    <option value="tight">Tight</option>
                    <option value="difficult">Difficult</option>
                    <option value="high_risk">High risk</option>
                  </select>
                </label>
                <label>Tear-off layers<input name="tearoffLayers" inputMode="decimal" placeholder="1" /></label>
                <label>Tear-out hours<input name="tearoutHours" inputMode="decimal" placeholder="4" /></label>
                <label>Install hours<input name="installHours" inputMode="decimal" placeholder="12" /></label>
                <label>Travel hours<input name="travelHours" inputMode="decimal" placeholder="1" /></label>
                <label>Setup hours<input name="setupHours" inputMode="decimal" placeholder="1" /></label>
                <label>Material handling hours<input name="materialHandlingHours" inputMode="decimal" placeholder="2" /></label>
                <label>Labor rate / hour<input name="laborRate" inputMode="decimal" placeholder="75.00" /></label>
                <label>Labor cost override<input name="laborCost" inputMode="decimal" placeholder="0.00" /></label>
                <label>Mobilization<input name="mobilizationCost" inputMode="decimal" placeholder="0.00" /></label>
                <label>Equipment<input name="equipmentCost" inputMode="decimal" placeholder="0.00" /></label>
                <label>
                  Weather
                  <select name="weatherRisk" defaultValue="normal">
                    <option value="normal">Normal</option>
                    <option value="watch">Watch</option>
                    <option value="high">High risk</option>
                  </select>
                </label>
                <label>Delivery<input name="deliveryCost" inputMode="decimal" placeholder="0.00" /></label>
                <label>Disposal<input name="disposalCost" inputMode="decimal" placeholder="0.00" /></label>
                <label>Permits<input name="permitCost" inputMode="decimal" placeholder="0.00" /></label>
                <label>Overhead<input name="overheadCost" inputMode="decimal" placeholder="0.00" /></label>
                <label>Contingency<input name="contingencyCost" inputMode="decimal" placeholder="0.00" /></label>
                <label>Markup %<input name="markupPercent" inputMode="decimal" placeholder="25" /></label>
              </div>
              <label className="section-actions">
                Labor notes
                <textarea name="laborNotes" rows={3} placeholder="Crew assumptions, access concerns, tear-out difficulty, cleanup, staging, or anything the estimator should remember." />
              </label>
              <label>
                Equipment notes
                <textarea name="equipmentNotes" rows={3} placeholder="Lift, trailer, dump trailer, boom truck, staging, compressor, or specialty tools." />
              </label>
            </details>
            <details className="panel subtle-panel">
              <summary>Market price check</summary>
              <p className="muted section-actions">
                Use this for manual Google/search/provider price references. Ferocity records the source and range, but does not claim live market pricing until a real pricing provider is connected.
              </p>
              <div className="form-grid two">
                <label>Low reference<input name="marketPriceLow" inputMode="decimal" placeholder="8500.00" /></label>
                <label>High reference<input name="marketPriceHigh" inputMode="decimal" placeholder="14500.00" /></label>
              </div>
              <label>
                Source
                <input name="marketPriceSource" placeholder="Google search, supplier quote, Homewyse, local price sheet, etc." />
              </label>
              <label>
                Notes
                <textarea name="marketPriceNotes" rows={3} placeholder="Why this range applies or does not apply to this job." />
              </label>
            </details>
            <details className="panel subtle-panel" open>
              <summary>Customer estimate view</summary>
              <p className="muted section-actions">
                Keep the customer version simple. Internal labor, overhead, markup, supplier notes, and assumptions stay private unless you choose to show them.
              </p>
              <div className="form-grid two">
                <label>
                  Customer detail level
                  <select name="customerDisplayMode" defaultValue="grouped">
                    <option value="simple">Simple total</option>
                    <option value="grouped">Grouped scope</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </label>
                <label>
                  Payment terms
                  <input name="customerTerms" placeholder="50% deposit, balance due on completion" />
                </label>
              </div>
              <label>
                Opening note
                <textarea name="customerIntro" rows={3} placeholder="Thanks for the opportunity. Here is the reviewed scope and estimated investment." />
              </label>
              <label>
                Customer scope
                <textarea name="customerScopeSummary" rows={4} placeholder="What the customer should understand: included work, product level, cleanup, and schedule assumptions." />
              </label>
              <label>
                Exclusions
                <textarea name="customerExclusions" rows={3} placeholder="Decking repair, hidden damage, permit changes, electrical work, etc." />
              </label>
              <label>
                Next steps
                <textarea name="customerNextSteps" rows={3} placeholder="Approve the estimate, choose product color, pay deposit if required, then we confirm schedule." />
              </label>
              <div className="toggle-grid section-actions">
                <label><input type="checkbox" name="showLineItemPrices" defaultChecked /> Show prices</label>
                <label><input type="checkbox" name="showQuantities" defaultChecked /> Show quantities</label>
                <label><input type="checkbox" name="showMaterialDetails" /> Show material detail</label>
                <label><input type="checkbox" name="showLaborDetails" /> Show labor detail</label>
                <label><input type="checkbox" name="showOverheadDetails" /> Show overhead detail</label>
                <label><input type="checkbox" name="showProfitDetails" /> Show profit detail</label>
              </div>
            </details>
            <button className="button" type="submit">Calculate materials</button>
          </form>
        </section>

        <section className="panel span-5">
          <h2>Safety Rules</h2>
          <ul className="list">
            <li className="list-row">No cheapest-product-only recommendations.</li>
            <li className="list-row">No final bid without approval.</li>
            <li className="list-row">No material order without approval.</li>
            <li className="list-row">Photo and plan measurements stay unverified until confirmed.</li>
            <li className="list-row">Supplier prices must show source and checked time.</li>
            <li className="list-row">Internal markup stays private unless you choose otherwise.</li>
          </ul>
        </section>
      </section>

      <section className="grid section-actions">
        <EstimatorReviewList
          title="Quote-Only Items"
          empty="No quote-only estimator items yet."
          items={dashboard.quoteRequests}
        />
        <EstimatorReviewList
          title="Possible Inventory"
          empty="No inventory matches yet. Add stock in Service Ops inventory to reuse leftovers before buying."
          items={dashboard.inventoryMatches}
        />
        <EstimatorReviewList
          title="Package And Delivery Checks"
          empty="No package checks yet."
          items={dashboard.packageOptions}
        />
        <EstimatorReviewList
          title="Approval Requirements"
          empty="No estimator approval requirements are open."
          items={dashboard.approvalRequirements}
        />
        <EstimatorReviewList
          title="Price Refresh Needed"
          empty="No stale or expiring material prices."
          items={dashboard.priceRefreshes}
        />
        <EstimatorReviewList
          title="Change Orders"
          empty="No draft change orders."
          items={dashboard.changeOrders}
        />
        <EstimatorReviewList
          title="Plan Validation"
          empty="No plan validation records need review."
          items={dashboard.planValidations}
        />
        <EstimatorReviewList
          title="Code And Warranty Checks"
          empty="No compliance records need review."
          items={dashboard.complianceChecks}
        />
        <EstimatorReviewList
          title="Insurance Scopes"
          empty="No insurance scopes need review."
          items={dashboard.insuranceScopes}
        />
        <EstimatorReviewList
          title="Estimate Versions"
          empty="No estimator versions saved yet."
          items={dashboard.estimateVersions}
        />
        <EstimatorReviewList
          title="Inventory Reservations"
          empty="No inventory reservations yet."
          items={dashboard.inventoryReservations}
        />
        <EstimatorReviewList
          title="Manual Price Entries"
          empty="No manual price entries yet."
          items={dashboard.manualPriceEntries}
        />
        <EstimatorReviewList
          title="Substitution Reviews"
          empty="No substitution reviews yet."
          items={dashboard.substitutionReviews}
        />
        <EstimatorReviewList
          title="Delivery Reviews"
          empty="No delivery review records yet."
          items={dashboard.deliveryReviews}
        />
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2>Add Change Order</h2>
          <form action={createChangeOrderAction} className="stacked-form">
            <label>
              Estimate
              <select name="estimateId" required defaultValue="">
                <option value="" disabled>Select estimate</option>
                {dashboard.estimates.map((estimate) => <option key={estimate.id} value={estimate.id}>{estimate.label}</option>)}
              </select>
            </label>
            <div className="form-grid two">
              <label>
                Type
                <select name="changeType" defaultValue="scope_change">
                  <option value="scope_change">Scope change</option>
                  <option value="hidden_damage">Hidden damage</option>
                  <option value="customer_upgrade">Customer upgrade</option>
                  <option value="additional_labor">Additional labor</option>
                  <option value="additional_materials">Additional materials</option>
                  <option value="deductible_or_insurance">Insurance/deductible</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>Amount<input name="amount" inputMode="decimal" placeholder="0.00" /></label>
            </div>
            <label>Title<input name="title" placeholder="Decking repair after tear-off" required /></label>
            <label>Description<textarea name="description" rows={3} placeholder="What changed, why it changed, and what needs approval." /></label>
            <button className="button" type="submit">Create change order</button>
          </form>
        </section>
        <section className="panel span-6">
          <h2>Add Manual Price</h2>
          <form action={recordManualPriceAction} className="stacked-form">
            <label>
              Takeoff item
              <select name="takeoffItemId" required defaultValue="">
                <option value="" disabled>Select item</option>
                {dashboard.takeoffItems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <div className="form-grid two">
              <label>Supplier<input name="supplierName" placeholder="ABC Supply, Menards, local yard..." /></label>
              <label>Unit price<input name="unitPrice" inputMode="decimal" placeholder="0.00" required /></label>
              <label>
                Price type
                <select name="priceType" defaultValue="manual">
                  <option value="manual">Manual</option>
                  <option value="public">Public</option>
                  <option value="contractor">Contractor</option>
                  <option value="volume">Volume</option>
                  <option value="rebate">Rebate</option>
                  <option value="quote">Quote</option>
                  <option value="tax_exempt">Tax exempt</option>
                  <option value="negotiated">Negotiated</option>
                  <option value="cached">Cached</option>
                </select>
              </label>
              <label>
                Confidence
                <select name="confidence" defaultValue="unverified">
                  <option value="unverified">Unverified</option>
                  <option value="website_stock">Website stock</option>
                  <option value="api_stock">API stock</option>
                  <option value="phone_confirmed">Phone confirmed</option>
                  <option value="reserved">Reserved</option>
                  <option value="ordered">Ordered</option>
                  <option value="backordered">Backordered</option>
                </select>
              </label>
              <label>Package quantity<input name="packageQuantity" inputMode="decimal" placeholder="1" /></label>
              <label>Package unit<input name="packageUnit" placeholder="bundle, roll, box..." /></label>
              <label>Expires in days<input name="expiresInDays" inputMode="numeric" placeholder="14" /></label>
              <label>Source<input name="source" placeholder="Quote number, URL, phone call, price sheet" /></label>
            </div>
            <label>Notes<textarea name="notes" rows={3} placeholder="Account pricing, rebate, tax exempt, delivery, or availability notes." /></label>
            <button className="button" type="submit">Record price</button>
          </form>
        </section>
        <section className="panel span-6">
          <h2>Import Supplier Price Sheet</h2>
          <p className="muted">
            Paste CSV rows from a supplier export. Ferocity saves the supplier, product records, prices, source, and import log for review. Live supplier APIs stay separate until provider accounts are connected.
          </p>
          <form action={importSupplierPriceListAction} className="stacked-form">
            <div className="form-grid two">
              <label>
                Supplier
                <input name="supplierName" placeholder="ABC Supply, Menards, local yard..." required />
              </label>
              <label>
                Import name
                <input name="importName" placeholder="July roofing price sheet" />
              </label>
            </div>
            <label>
              CSV file
              <input name="csvFile" type="file" accept=".csv,text/csv" />
            </label>
            <label>
              Or paste CSV
              <textarea
                name="csvText"
                rows={7}
                placeholder="product_name,category_key,sku,brand,unit_price,unit,availability&#10;Architectural shingles,shingles,SKU-123,Example,42.50,bundle,in_stock"
              />
            </label>
            <button className="button" type="submit">Import prices</button>
          </form>
        </section>
        <section className="panel span-6">
          <h2>Add Review Record</h2>
          <form action={createEstimatorReviewRecordAction} className="stacked-form">
            <div className="form-grid two">
              <label>
                Estimate
                <select name="estimateId" defaultValue="">
                  <option value="">Optional</option>
                  {dashboard.estimates.map((estimate) => <option key={estimate.id} value={estimate.id}>{estimate.label}</option>)}
                </select>
              </label>
              <label>
                Kind
                <select name="kind" defaultValue="plan">
                  <option value="plan">Plan validation</option>
                  <option value="compliance">Code/warranty check</option>
                  <option value="insurance">Insurance scope</option>
                </select>
              </label>
            </div>
            <label>
              Type
              <input name="type" placeholder="scale_check, local_code, warranty_requirement..." />
            </label>
            <label>Notes<textarea name="notes" rows={4} placeholder="What needs checking, what source was used, and what is still unverified." /></label>
            <button className="button" type="submit">Add review record</button>
          </form>
        </section>
        <section className="panel span-6">
          <h2>Add Substitution Review</h2>
          <form action={createSubstitutionReviewAction} className="stacked-form">
            <label>
              Takeoff item
              <select name="takeoffItemId" required defaultValue="">
                <option value="" disabled>Select item</option>
                {dashboard.takeoffItems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>Substitute product<input name="substituteName" placeholder="Brand/model/spec being considered" required /></label>
            <label>Notes<textarea name="notes" rows={4} placeholder="Why substitute, what must match, warranty/appearance/insurance concerns." /></label>
            <button className="button" type="submit">Create substitution review</button>
          </form>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-7">
          <div className="list-row flush-row">
            <div>
              <h2>Recent Takeoffs</h2>
              <p className="muted">Review missing measurements, formulas, warnings, and bid readiness.</p>
            </div>
            <Link className="mini-button" href="/app/integrations">Supplier setup</Link>
          </div>
          <ul className="list">
            {dashboard.takeoffs.map((takeoff) => (
              <li className="list-row" key={takeoff.id}>
                <div>
                  <h3>{takeoff.estimateTitle}</h3>
                  <p className="muted">{takeoff.customerName} / {takeoff.tradeKey.replaceAll("_", " ")} / {takeoff.qualityLevel} / {takeoff.createdAt}</p>
                  {takeoff.missingInformation.length ? <p>Missing: {takeoff.missingInformation.join(", ")}</p> : null}
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(takeoff.status)}`}>{takeoff.status}</span>
                  <span className="pill">{takeoff.confidence}</span>
                  <Link className="mini-button secondary-button" href={`/app/estimator/takeoffs/${takeoff.id}`}>Review</Link>
                  <form action={createBidFromTakeoffAction}>
                    <input type="hidden" name="takeoffId" value={takeoff.id} />
                    <button className="mini-button" type="submit">Create bid draft</button>
                  </form>
                  <form action={createOrderListFromTakeoffAction}>
                    <input type="hidden" name="takeoffId" value={takeoff.id} />
                    <button className="mini-button secondary-button" type="submit">Generate order list</button>
                  </form>
                </div>
              </li>
            ))}
            {dashboard.takeoffs.length === 0 ? (
              <li className="list-row">
                <span className="muted">No takeoffs yet. Add field notes and measurements above to create the first one.</span>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-5">
          <h2>Open Warnings</h2>
          <ul className="list">
            {dashboard.warnings.map((warning) => (
              <li className="list-row" key={warning.id}>
                <div>
                  <h3>{warning.severity}</h3>
                  <p className="muted">{warning.message}</p>
                </div>
                <span className={`pill ${tone(warning.severity)}`}>{warning.status}</span>
              </li>
            ))}
            {dashboard.warnings.length === 0 ? <li className="list-row"><span className="muted">No open estimator warnings.</span></li> : null}
          </ul>
        </section>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Estimating Profiles</h2>
            <p className="muted">Company preferences live here over time: budget, standard, premium, preferred suppliers, markup, waste, warranty level, and allowed substitutions.</p>
          </div>
          <PackageSearch size={22} />
        </div>
        <ul className="list">
          {dashboard.profiles.map((profile) => (
            <li className="list-row" key={profile.id}>
              <div>
                <h3>{profile.name}</h3>
                <p className="muted">{profile.tradeKey.replaceAll("_", " ")} / {profile.qualityLevel}</p>
              </div>
              <div className="inline-actions">
                <span className="pill">waste {profile.waste}</span>
                <span className="pill">markup {profile.markup}</span>
              </div>
            </li>
          ))}
          {dashboard.profiles.length === 0 ? (
            <li className="list-row">
              <span className="muted">Profiles will appear after the first takeoff. Standard is the default starting point.</span>
            </li>
          ) : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <section className="metric-card span-3">
      <small className="pill">estimator</small>
      {icon}
      <strong>{value}</strong>
      <span>{label}</span>
    </section>
  );
}

function EstimatorReviewList({
  title,
  empty,
  items
}: {
  title: string;
  empty: string;
  items: { id: string; label: string; detail: string; status: string; tone: string; actionKind?: "quote" | "inventory" | "package" | "approval" }[];
}) {
  return (
    <section className="panel span-6">
      <h2>{title}</h2>
      <ul className="list">
        {items.map((item) => (
          <li className="list-row" key={item.id}>
            <div>
              <h3>{item.label}</h3>
              <p className="muted">{item.detail}</p>
            </div>
            <div className="inline-actions">
              <span className={`pill ${tone(item.tone || item.status)}`}>{item.status}</span>
              {item.actionKind === "quote" ? (
                <>
                  <InlineAction id={item.id} label="Requested" action={markQuoteRequestedAction} />
                  <InlineAction id={item.id} label="Received" action={markQuoteReceivedAction} />
                </>
              ) : null}
              {item.actionKind === "inventory" ? (
                <>
                  <InlineAction id={item.id} label="Use stock" action={updateInventoryMatchAction} status="reserved" />
                  <InlineAction id={item.id} label="Reject" action={updateInventoryMatchAction} status="rejected" />
                </>
              ) : null}
              {item.actionKind === "package" ? <InlineAction id={item.id} label="Select" action={selectPackageOptionAction} /> : null}
              {item.actionKind === "approval" ? (
                <>
                  <InlineAction id={item.id} label="Approve" action={updateEstimatorApprovalAction} status="approved" />
                  <InlineAction id={item.id} label="Dismiss" action={updateEstimatorApprovalAction} status="dismissed" />
                </>
              ) : null}
            </div>
          </li>
        ))}
        {items.length === 0 ? <li className="list-row"><span className="muted">{empty}</span></li> : null}
      </ul>
    </section>
  );
}

function InlineAction({
  id,
  label,
  action,
  status
}: {
  id: string;
  label: string;
  action: (formData: FormData) => void | Promise<void>;
  status?: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      {status ? <input type="hidden" name="status" value={status} /> : null}
      <button className="mini-button secondary-button" type="submit">{label}</button>
    </form>
  );
}

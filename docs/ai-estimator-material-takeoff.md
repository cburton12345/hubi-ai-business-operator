# AI Estimator And Material Takeoff

Ferocity now has a core estimating layer for turning notes and measurements into reviewed takeoffs, bid drafts, warnings, and order-list drafts.

## Non-Negotiable Estimator Rule

AI must never invent trade formulas, product compatibility, code requirements, material quantities, manufacturer requirements, supplier stock, or prices.

When information cannot be verified, Ferocity must state uncertainty, show confidence, ask for clarification, and require approval. Accuracy is more important than speed.

## What Works Now

- `/app/estimator` is the main estimator workflow.
- Users can start from an existing estimate, existing customer, or new customer.
- Supported inputs include typed notes, spoken-note text, audio translation text, photo-note text, uploaded-plan notes, manual fields, and existing job records.
- The original field note is preserved.
- Measurements are extracted from simple field notes and editable manual fields.
- Deterministic calculators prepare takeoffs for:
  - shingle roofing
  - metal roofing
  - metal siding
  - vinyl siding
  - gutters
  - framing
  - drywall
  - flooring
  - concrete
  - insulation
  - painting
  - basic ductwork
  - basic plumbing material allowances
  - basic electrical material allowances
- Takeoff items show formulas, waste, coverage, rounded purchase quantities, assumptions, and confidence.
- Warnings are created for missing measurements, conflicting measurements, mixed-unit notes, unverified photo/plan sources, and missing ZIP/store location for pricing.
- Roofing and siding takeoffs include complete system assembly checks instead of estimating one product in isolation.
- Metal roofing builds a specific product/system specification before supplier pricing: panel gauge/profile/coverage/finish, manufacturer-approved screws, trims, closures, underlayment, ice/water, flashing, ventilation, and review-only components.
- Users can create a customer-facing bid draft from a reviewed takeoff.
- Users can generate an internal draft order list from a takeoff.
- Users can choose how much detail the customer sees: simple total, grouped scope, or detailed.
- Customer estimate wording can be edited separately from internal notes: opening note, scope, exclusions, terms, and next steps.
- Labor can be entered as a direct cost or estimated from crew size, tear-out hours, install hours, and hourly rate.
- Overhead, delivery, equipment, disposal, permits, contingency, and markup are tracked as internal estimating inputs.
- Manual market-price references can be recorded with low/high range, source, checked time, and notes.
- Quote-only and low-confidence components are flagged instead of priced from guesses.
- Major AI-generated bid drafts snapshot the existing estimate first so accepted or reviewed work is not silently overwritten.
- Quote-only items create estimator quote-request records.
- Possible existing inventory matches are checked against service inventory so leftover stock can be reviewed before buying.
- Package and delivery optimization records are created so supplier package sizes, minimums, landed cost, and delivery constraints can be reviewed.
- Approval requirements are created for bid review, purchasing review, measurement conflicts, and low-margin situations.
- Quote requests can be marked requested or received without inventing a price.
- Inventory matches can be reserved or rejected from the estimator dashboard.
- Package/delivery options can be selected while still requiring supplier pricing review.
- Estimator approval requirements can be approved or dismissed with an audit-ready record.
- Price expiration and refresh requirements are visible before ordering.
- Change orders can be created without overwriting the original estimate.
- Plan validation records can track scale checks, missing dimensions, conflicting dimensions, and page-scale issues.
- Compliance records can track local code, climate, manufacturer, warranty, permit, and structural checks.
- Insurance scope records can track carrier scope review, Xactimate comparison status, deductibles, depreciation, code upgrades, and supplements.
- Estimate version history is visible in the estimator dashboard.
- Advanced labor factors are captured: crew experience, stories, access difficulty, tear-off layers, travel, setup, material handling, mobilization, equipment notes, and weather risk.
- Inventory reservations are recorded separately from inventory matches.
- Manual price entries support public, contractor, volume, rebate, quote, tax-exempt, negotiated, cached, and manual pricing.
- Manual pricing updates takeoff item price, expiration, lock status, confidence, and estimated total.
- Supplier price sheets can be uploaded as CSV or pasted as CSV from `/app/estimator`; Ferocity creates or reuses the supplier, stores products, stores prices, and logs the import counts/warnings.
- Substitution reviews compare original spec against proposed substitute and require review for appearance, performance, warranty, compatibility, customer spec, and insurance concerns.
- Delivery reviews are created from order-list drafts and track landed cost factors like fuel surcharge, boom delivery, multiple trips, remote location, minimum delivery, and jobsite access.
- Quality-tier system records are seeded per trade and quality level so budget, standard, premium, and custom options can remain complete compatible systems.
- AI Workforce includes an `AI Estimator` agent in approval-required mode.
- Each takeoff can be opened at `/app/estimator/takeoffs/[takeoffId]` for formulas, items, warnings, missing details, costs, and bid/order actions.
- Each estimate can be previewed at `/app/service/estimates/[estimateId]/preview` to check the customer-safe version before sending.
- Signed-in users can create a secure public customer estimate link and optionally email it through the configured email provider.
- Customers can open `/estimate/[token]`, review customer-safe scope and line items, save/print to PDF from the browser, and accept the estimate.
- Customers can download a generated PDF from `/estimate/[token]/pdf`.
- Customer acceptance writes an `estimate_acceptances` record, marks the estimate approved, prepares an unscheduled job draft, creates an owner follow-up reminder, and sends an owner notification email when email is configured.
- If the estimate has a deposit requirement, acceptance prepares a deposit invoice and payment-link record. If Stripe is configured, it creates a Checkout link; otherwise it leaves the payment request safely drafted.
- Purchase-order drafts can run an order-readiness check that records whether live supplier ordering is blocked or ready for review.

## Core Requirements Added

These are required behavior, not optional roadmap ideas:

- Estimate complete installed systems, not isolated products.
- Build exact product specifications before supplier search.
- Support public, contractor, volume, rebate, quote, tax-exempt, and negotiated pricing, with confirmed company pricing ranked above public pricing.
- Support quote-only products such as trusses, windows, doors, custom metal, cabinets, concrete, custom fabrication, and specialty materials.
- Optimize package combinations, quantity breaks, full pallets, minimum orders, delivery cost, and landed cost before purchase.
- Check company inventory, shop stock, trailers, and leftover job material before recommending new purchases.
- Separate installation waste, purchased overage, returnable extras, non-returnable custom material, and customer attic stock.
- Include crew size, crew experience, production history, stories, pitch, access difficulty, tear-off layers, cleanup, travel, weather, setup, handling, mobilization, and equipment in labor assumptions where available.
- Validate local code, climate zone, manufacturer instructions, and warranty requirements with confidence levels. Never claim uncertain code data is verified.
- Validate uploaded plan scale and detect wrong scales, different page scales, missing dimensions, and conflicting dimensions.
- Require confirmation when measurements disagree.
- Validate units and read critical numbers back for confirmation.
- Create version history for major revisions and never overwrite accepted estimates.
- Track supplier quote expiration, bid expiration, material escalation, and price lock status.
- Track inventory confidence: website stock, API stock, phone confirmed, reserved, ordered, and backordered.
- Evaluate substitutions against appearance, performance, warranty, compatibility, customer specs, and insurance requirements.
- Keep budget, standard, and premium options as complete compatible systems.
- Support insurance scopes, Xactimate comparisons, supplements, code upgrades, depreciation, and deductibles separately from company cost.
- Enforce role-based approvals for workers, estimators, managers, purchasing, and owners.
- Gracefully fall back when supplier APIs fail.
- Protect customer data, company pricing, supplier accounts, internal margins, and uploaded plans with role-based access and audit logs.
- Require human review for low confidence, high project value, low margin, structural work, custom fabrication, conflicting measurements, photo-only dimensions, and unverified prices.
- Support change orders for scope changes, hidden damage, customer upgrades, labor, and materials without overwriting the original estimate.
- Validate calculations against real projects, experienced estimators, unit tests, edge cases, and trade formulas. Roll out by trade.

## Data Model Added

- `estimating_profiles`
- `estimate_measurements`
- `estimate_assumptions`
- `product_categories`
- `suppliers`
- `supplier_locations`
- `supplier_products`
- `supplier_prices`
- `company_product_preferences`
- `material_takeoffs`
- `material_takeoff_items`
- `price_checks`
- `product_recommendations`
- `estimate_warnings`
- `purchase_orders`
- `purchase_order_items`
- `estimate_versions`
- `estimator_quote_requests`
- `estimator_inventory_matches`
- `estimator_package_options`
- `estimator_approval_requirements`
- `estimate_change_orders`
- `estimator_plan_validations`
- `estimator_compliance_checks`
- `estimator_insurance_scopes`
- `estimator_inventory_reservations`
- `estimator_manual_price_entries`
- `estimator_substitution_reviews`
- `estimator_delivery_reviews`
- `estimator_quality_tier_systems`
- `estimator_supplier_price_imports`
- `estimate_share_links`
- `estimate_acceptances`
- `estimator_supplier_order_attempts`

Existing tables extended:

- `service_estimates`
- `estimate_line_items`
- `material_takeoffs`
- `material_takeoff_items`

## Customer Estimate Presentation

Ferocity separates the internal workup from the customer-facing estimate.

Internal:

- material quantities
- formulas
- labor assumptions
- tear-out/install time
- overhead
- markup/profit
- supplier or market reference notes

Customer-facing:

- simple project total or grouped/detailed line items
- plain-English scope
- exclusions
- payment terms
- next steps

The default is customer-safe: internal margin and overhead are not shown unless the workspace intentionally turns on those detail switches.

The signed-in preview route shows what the customer version will look like before public sending. Public share links are token-based and expose only customer-safe fields.

## Safety Rules

- No final bid is sent automatically.
- No materials are ordered automatically.
- Photo and plan measurements require confirmation.
- Missing critical measurements create blocking warnings.
- Supplier prices must be stored with source, location, checked time, confidence, package size, unit conversion, availability, and URL when available.
- Product recommendation is designed for best overall fit, not cheapest-only selection.
- Internal markup and profit stay private unless the owner chooses to expose them.

## Provider-Dependent Pieces

These are ready in the schema and UI but require supplier data or integrations:

- Menards, Home Depot, Lowe's, ABC Supply, Beacon, SRS, and local supplier price feeds.
- Live supplier account/API price feeds and order submission.
- Account-specific pricing.
- Authorized supplier APIs.
- EagleView or future measurement integrations.
- Product validation against manufacturer warranties, local code, and live inventory.
- Live market-price comparison from Google/search/provider APIs.
- Contractor account pricing, rebates, tax-exempt pricing, quote pricing, and negotiated pricing.
- Inventory checks across warehouse, shop, trailers, and leftover job stock.
- Package optimization and landed-cost delivery optimization.
- Code/manufacturer warranty validation.
- Plan-scale validation from uploaded PDFs/images.
- Insurance estimating comparisons and Xactimate-style workflows.
- Stored PDF artifacts. A generated PDF download exists now; durable storage and versioned PDF snapshots can be added when file storage is finalized.
- Full customer-facing payment completion directly inside the estimate page. Deposit Checkout links can be prepared from the accepted estimate when Stripe is configured; webhook-driven paid status still belongs to the existing invoice payment flow.

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm run estimate:path:smoke`
- `npm test`
- `npm run build`

## Launch Truth

This is not a fake live supplier or Google pricing search. Ferocity now calculates takeoffs, estimates labor time, records internal cost assumptions, and prepares customer-safe bid/order drafts. Real-time supplier pricing, Google/search market checks, and final product recommendation quality depend on connected supplier APIs, search/pricing providers, uploaded price lists, or manually verified price records.

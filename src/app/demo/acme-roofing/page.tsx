import type { Metadata } from "next";
import Link from "next/link";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";

export const metadata: Metadata = {
  title: "Roofing Business Demo",
  description: "See a public example of Ferocity coordinating leads, estimates, follow-up, jobs, reviews, marketing, and revenue for a roofing business.",
  alternates: { canonical: "/demo/acme-roofing" }
};

const steps = [
  ["Growth", "A storm-repair campaign uses customer-approved job proof and a saved service area to create a tracked opportunity."],
  ["Reception", "The homeowner calls after hours. Ferocity captures the leak, property, urgency, consent, and preferred contact method in one record."],
  ["Sales", "Damage photos and call context shape the inspection questions, appointment options, scope draft, pricebook items, and margin guardrails."],
  ["Operations", "The appointment is matched against crew skills, route, weather, workload, material availability, and the customer promise."],
  ["Field", "Arrival, time, photos, forms, material use, signatures, and an unexpected deck condition update the live job instead of creating office re-entry."],
  ["Finance", "Approved work becomes an invoice and secure payment path; labor, materials, provider fees, and expected profit stay connected."],
  ["Reputation", "After payment and a service-recovery check, the customer receives the appropriate review or referral request."],
  ["Business Brain", "Source, estimate, actual cost, revenue, and outcome improve the next campaign, estimate, schedule, and owner brief."]
];

export default function AcmeRoofingDemoPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <PublicNav />
        <section className="public-hero">
          <p className="eyebrow">Illustrative roofing walkthrough</p>
          <h1>Watch one roofing customer move through the entire business.</h1>
          <p className="muted">
            This guided example shows how a configured roofing company can preserve context from the first campaign through the completed job, collected payment, customer review, and next growth decision. It is an illustrative demo, not live customer data.
          </p>
          <div className="button-row">
            <Link className="button" href="/demo">Back to tour</Link>
            <Link className="button secondary-button" href="/integrations">Integrations</Link>
          </div>
        </section>
        <section className="panel">
          <p className="eyebrow">One opportunity. Eight connected departments.</p>
          <h2>The story is never rebuilt at the handoff.</h2>
          <div className="operating-loop">
            {steps.map(([department, body], index) => (
              <div className="loop-step" key={department}>
                <strong>{index + 1}. {department}</strong>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="public-grid">
          <div className="panel">
            <h2>What Ferocity noticed</h2>
            <p className="muted">A high-intent storm lead, a scheduling and materials conflict, a field condition that changed the job, and the right moment to ask for a review.</p>
          </div>
          <div className="panel">
            <h2>What Ferocity coordinated</h2>
            <p className="muted">The customer conversation, inspection, estimate, crew, route, materials, field evidence, change order, invoice, payment, and future growth.</p>
          </div>
          <div className="panel">
            <h2>What still needed a person</h2>
            <p className="muted">Only the overtime exception outside the company’s saved authority. Ferocity presented the facts and options before anything protected changed.</p>
          </div>
        </section>
        <section className="final-cta">
          <div><p className="eyebrow">The roofing outcome</p><h2>One customer. Eight departments. Every handoff preserved. One owner decision.</h2></div>
          <Link className="button" href="/start?source=roofing_demo">Start with your business</Link>
        </section>
        <PublicFooter />
      </section>
    </main>
  );
}

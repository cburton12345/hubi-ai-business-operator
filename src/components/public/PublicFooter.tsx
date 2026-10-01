import Link from "next/link";
import { FerocityBrandMark } from "@/components/public/FerocityBrandMark";

const complianceLinks = [
  ["Product", "/#capability-title"],
  ["Pricing", "/pricing"],
  ["Ferocity Earn", "/pricing#earn"],
  ["Ask Ferocity", "/#ask-ferocity"],
  ["Ferocity Connect", "/ferocity-connect"],
  ["Integrations", "/integrations"],
  ["Support", "/support"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["SMS Terms", "/sms-terms"],
  ["SMS Consent", "/sms-consent"],
  ["Acceptable Use", "/acceptable-use"],
  ["Data Processing", "/data-processing-addendum"],
  ["Subprocessors", "/subprocessors"],
  ["Contact & Compliance", "/contact-compliance"]
] as const;

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div>
        <FerocityBrandMark compact />
        <p>The AI operating system for running and growing a business.</p>
      </div>
      <nav aria-label="Legal and compliance">
        {complianceLinks.map(([label, href]) => (
          <Link href={href} key={href}>{label}</Link>
        ))}
      </nav>
      <p className="public-footer-note">© {new Date().getFullYear()} Ferocity. All rights reserved.</p>
    </footer>
  );
}

import Link from "next/link";

const complianceLinks = [
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["SMS Terms", "/sms-terms"],
  ["SMS Consent", "/sms-consent"],
  ["Acceptable Use", "/acceptable-use"],
  ["Contact & Compliance", "/contact-compliance"]
] as const;

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div>
        <Link className="brand-mark" href="/">Ferocity</Link>
        <p>AI business operating software for service businesses.</p>
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

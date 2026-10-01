import Link from "next/link";
import { Menu } from "lucide-react";
import { FerocityBrandMark } from "@/components/public/FerocityBrandMark";

const navigation = [
  ["Product", "/demo"],
  ["Solutions", "/platforms"],
  ["Integrations", "/integrations"],
  ["Pricing", "/pricing"],
  ["Earn", "/pricing#earn"],
  ["Sign in", "/login"]
] as const;

export function PublicNav() {
  return (
    <nav className="public-nav" aria-label="Main navigation">
      <FerocityBrandMark />
      <div className="public-nav-links">
        {navigation.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
        <Link className="nav-cta" href="/start">Start Ferocity</Link>
      </div>
      <div className="public-nav-mobile">
        <Link className="nav-cta" href="/start">Start</Link>
        <details>
          <summary><Menu size={17} /> Menu</summary>
          <div>
            {navigation.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
          </div>
        </details>
      </div>
    </nav>
  );
}

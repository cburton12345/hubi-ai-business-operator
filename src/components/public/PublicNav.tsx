import Link from "next/link";

export function PublicNav() {
  return (
    <nav className="public-nav" aria-label="Main navigation">
      <Link className="brand-mark" href="/">Ferocity</Link>
      <div>
        <Link href="/demo">See Ferocity work</Link>
        <Link href="/pricing">Plans</Link>
        <Link href="/login">Sign in</Link>
        <Link className="nav-cta" href="/start">Start Ferocity</Link>
      </div>
    </nav>
  );
}

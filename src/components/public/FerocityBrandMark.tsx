import Image from "next/image";
import Link from "next/link";

export function FerocityBrandMark({ compact = false, href = "/" }: { compact?: boolean; href?: string }) {
  return (
    <Link className="brand-mark ferocity-brand-mark" href={href} aria-label="Ferocity home">
      <Image
        className="ferocity-brand-symbol"
        src="/ferocity-lion-brand.png"
        alt=""
        width={compact ? 32 : 38}
        height={compact ? 32 : 38}
        priority
      />
      <span>FER<span className="ferocity-brand-o">O</span>CITY</span>
    </Link>
  );
}

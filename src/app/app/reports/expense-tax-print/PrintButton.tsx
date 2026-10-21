"use client";

export function PrintButton() {
  return <button className="mini-button tax-print-hide" type="button" onClick={() => window.print()}>Print tax packet</button>;
}

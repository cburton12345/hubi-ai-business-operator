"use client";

export function PrintButton() {
  return <button className="mini-button" type="button" onClick={() => window.print()}>Print receipt</button>;
}

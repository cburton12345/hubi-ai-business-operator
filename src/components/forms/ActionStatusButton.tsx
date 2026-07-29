"use client";

import { useFormStatus } from "react-dom";

export function ActionStatusButton({
  children,
  pendingLabel = "Processing...",
  className = "button",
  disabled = false
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={disabled || pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

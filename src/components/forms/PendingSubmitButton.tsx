"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function PendingSubmitButton({
  children,
  pendingLabel,
  className = "button",
  name,
  value,
  disabled = false
}: {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" name={name} value={value} disabled={disabled || pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

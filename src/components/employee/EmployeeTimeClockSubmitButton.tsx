"use client";

import { useFormStatus } from "react-dom";

export function EmployeeTimeClockSubmitButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="button" type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

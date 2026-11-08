"use client";

import Link from "next/link";
import { WorkerDocumentLanguage } from "@/components/employee/WorkerDocumentLanguage";
import { useWorkerDeviceLocale } from "@/components/employee/useWorkerDeviceLocale";

export default function EmployeeNotFound() {
  const language = useWorkerDeviceLocale();
  const spanish = language === "es";
  return (
    <main className="page-shell employee-shell" lang={spanish ? "es-US" : "en-US"}>
      <WorkerDocumentLanguage language={language} />
      <section className="workspace">
        <section className="panel workspace-state-card">
          <p className="eyebrow">{spanish ? "Trabajo no disponible" : "Work unavailable"}</p>
          <h1>{spanish ? "No se encontró esta visita" : "This visit was not found"}</h1>
          <p className="muted">{spanish ? "Es posible que la visita haya cambiado o que ya no esté asignada a usted." : "The visit may have changed or may no longer be assigned to you."}</p>
          <Link className="button" href="/employee">{spanish ? "Volver al trabajo de hoy" : "Back to today's work"}</Link>
        </section>
      </section>
    </main>
  );
}

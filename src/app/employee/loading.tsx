"use client";

import { WorkerDocumentLanguage } from "@/components/employee/WorkerDocumentLanguage";
import { useWorkerDeviceLocale } from "@/components/employee/useWorkerDeviceLocale";

export default function EmployeeLoading() {
  const language = useWorkerDeviceLocale();
  const spanish = language === "es";
  return (
    <main className="page-shell employee-shell" lang={spanish ? "es-US" : "en-US"} aria-busy="true" aria-live="polite">
      <WorkerDocumentLanguage language={language} />
      <section className="workspace">
        <section className="panel workspace-state-card">
          <span className="workspace-state-spinner" aria-hidden="true" />
          <div>
            <p className="eyebrow">Ferocity Field</p>
            <h1>{spanish ? "Preparando su jornada" : "Getting your workday ready"}</h1>
            <p className="muted">{spanish ? "Cargando su horario, trabajos, horas y registros de campo." : "Loading your schedule, jobs, hours, and field records."}</p>
          </div>
        </section>
      </section>
    </main>
  );
}

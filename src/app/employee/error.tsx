"use client";

import { useEffect } from "react";
import { WorkerDocumentLanguage } from "@/components/employee/WorkerDocumentLanguage";
import { useWorkerDeviceLocale } from "@/components/employee/useWorkerDeviceLocale";

export default function EmployeeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const language = useWorkerDeviceLocale();
  const spanish = language === "es";
  useEffect(() => {
    console.error("Ferocity employee page failed", error);
  }, [error]);
  return (
    <main className="page-shell employee-shell" lang={spanish ? "es-US" : "en-US"}>
      <WorkerDocumentLanguage language={language} />
      <section className="workspace">
        <section className="panel workspace-state-card" role="alert">
          <div>
            <p className="eyebrow">{spanish ? "Interrupción temporal" : "Temporary interruption"}</p>
            <h1>{spanish ? "Su trabajo sigue seguro" : "Your work is still safe"}</h1>
            <p className="muted">{spanish ? "Intente cargar la página de nuevo. Los cambios sin conexión permanecen en este dispositivo." : "Try the page again. Offline changes remain on this device."}</p>
            <button className="button" onClick={reset} type="button">{spanish ? "Intentar de nuevo" : "Try again"}</button>
          </div>
        </section>
      </section>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { EmployeeWorkday } from "@/components/employee/EmployeeWorkday";
import { WorkerDocumentLanguage } from "@/components/employee/WorkerDocumentLanguage";
import { hasAdminSession } from "@/lib/auth/admin-session";
import { getCurrentAppSession } from "@/lib/auth/session";
import { getEmployeeAccessContext } from "@/lib/employee/employee-access";
import { absoluteAppUrl } from "@/lib/http/safe-redirect";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";
import { logoutUser } from "@/app/login/actions";

export const dynamic = "force-dynamic";

export default async function EmployeeAppPage() {
  const [adminSession, appSession] = await Promise.all([hasAdminSession(), getCurrentAppSession()]);
  if (!adminSession && !appSession) {
    redirect(absoluteAppUrl("/login?next=/employee"));
  }
  const [workspace,employeeAccess] = await Promise.all([getCurrentWorkspace(),getEmployeeAccessContext()]);
  const canOpenFullWorkspace = adminSession || workspace.role !== "viewer";
  const spanish = employeeAccess.preferredLanguage === "es";

  return (
    <main className="page-shell employee-shell" lang={spanish ? "es-US" : "en-US"}>
      <WorkerDocumentLanguage language={spanish ? "es" : "en"} />
      <section className="workspace">
        <header className="app-shell-header panel">
          <Link href="/employee" className="brand-mark">Ferocity Field</Link>
          <div className="session-chip">
            <strong>{spanish ? "Equipo de campo" : "Field team"}</strong>
            <span className="muted">{spanish ? "Hoy, horas, horario, gastos y comprobantes" : "Today, hours, schedule, costs, proof"}</span>
          </div>
          {canOpenFullWorkspace ? <Link className="mini-button" href="/app">{spanish ? "Espacio de trabajo completo" : "Full workspace"}</Link> : null}
          <form action={logoutUser}><button className="mini-button" type="submit">{spanish ? "Cerrar sesión" : "Sign out"}</button></form>
        </header>
        <EmployeeWorkday />
      </section>
    </main>
  );
}

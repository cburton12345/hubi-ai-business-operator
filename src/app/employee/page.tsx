import Link from "next/link";
import { redirect } from "next/navigation";
import { EmployeeWorkday } from "@/components/employee/EmployeeWorkday";
import { hasAdminSession } from "@/lib/auth/admin-session";
import { getCurrentAppSession } from "@/lib/auth/session";
import { absoluteAppUrl } from "@/lib/http/safe-redirect";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";
import { logoutUser } from "@/app/login/actions";

export const dynamic = "force-dynamic";

export default async function EmployeeAppPage() {
  const [adminSession, appSession] = await Promise.all([hasAdminSession(), getCurrentAppSession()]);
  if (!adminSession && !appSession) {
    redirect(absoluteAppUrl("/login?next=/employee"));
  }
  const workspace = await getCurrentWorkspace();
  const canOpenFullWorkspace = adminSession || workspace.role !== "viewer";

  return (
    <main className="page-shell employee-shell">
      <section className="workspace">
        <header className="app-shell-header panel">
          <Link href="/employee" className="brand-mark">Ferocity Field</Link>
          <div className="session-chip">
            <strong>Field team</strong>
            <span className="muted">Today, hours, schedule, costs, proof</span>
          </div>
          {canOpenFullWorkspace ? <Link className="mini-button" href="/app">Full workspace</Link> : null}
          <form action={logoutUser}><button className="mini-button" type="submit">Sign out</button></form>
        </header>
        <EmployeeWorkday />
      </section>
    </main>
  );
}

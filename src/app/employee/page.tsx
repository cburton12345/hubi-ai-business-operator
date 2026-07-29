import Link from "next/link";
import { redirect } from "next/navigation";
import { EmployeeWorkday } from "@/components/employee/EmployeeWorkday";
import { hasAdminSession } from "@/lib/auth/admin-session";
import { getCurrentAppSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function EmployeeAppPage() {
  const [adminSession, appSession] = await Promise.all([hasAdminSession(), getCurrentAppSession()]);
  if (!adminSession && !appSession) {
    redirect("/login?next=/employee");
  }

  return (
    <main className="page-shell employee-shell">
      <section className="workspace">
        <header className="app-shell-header panel">
          <Link href="/employee" className="brand-mark">Ferocity</Link>
          <div className="session-chip">
            <strong>Employee app</strong>
            <span className="muted">Today, time, receipts, proof</span>
          </div>
          <Link className="mini-button" href="/app">
            Owner app
          </Link>
        </header>
        <EmployeeWorkday />
      </section>
    </main>
  );
}

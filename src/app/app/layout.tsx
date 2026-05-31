export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { AppShell } from "@/components/admin/AppShell";
import { hasAdminSession } from "@/lib/auth/admin-session";
import { getCurrentAppSession } from "@/lib/auth/session";

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const [adminSession, appSession] = await Promise.all([hasAdminSession(), getCurrentAppSession()]);
  if (!adminSession && !appSession) {
    redirect("/login?next=/app");
  }

  return <AppShell>{children}</AppShell>;
}

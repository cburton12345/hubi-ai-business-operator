export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppShell } from "@/components/admin/AppShell";
import { hasAdminSession } from "@/lib/auth/admin-session";
import { getCurrentAppSession } from "@/lib/auth/session";
import { absoluteAppUrl } from "@/lib/http/safe-redirect";

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const [adminSession, appSession] = await Promise.all([hasAdminSession(), getCurrentAppSession()]);
  if (!adminSession && !appSession) {
    const requestedPath = (await headers()).get("x-ferocity-app-path") ?? "/app";
    const nextPath = requestedPath.startsWith("/app") ? requestedPath : "/app";
    redirect(absoluteAppUrl(`/login?next=${encodeURIComponent(nextPath)}`));
  }

  return <AppShell>{children}</AppShell>;
}

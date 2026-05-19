export const dynamic = "force-dynamic";

import { AppShell } from "@/components/admin/AppShell";

export default function AdminAppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

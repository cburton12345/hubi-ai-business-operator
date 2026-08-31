import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { FerocityConnectManager } from "@/components/messaging/FerocityConnectManager";
import { requirePermission } from "@/lib/auth/require-permission";

export default async function FerocityConnectPage() {
  await requirePermission("tenant:view");
  return <QueuePageShell eyebrow="Messaging transport" title="Ferocity Connect" description="Securely pair an Android phone and SIM as an optional workspace SMS route. Ferocity still controls consent, STOP rules, authorization, pacing, conversation history, retries, and message health.">
    <FerocityConnectManager />
  </QueuePageShell>;
}

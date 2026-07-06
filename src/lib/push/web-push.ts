import webpush, { type PushSubscription } from "web-push";
import { env } from "@/lib/env";

export type PushReadiness = {
  supported: boolean;
  ready: boolean;
  missing: string[];
  publicKey: string | null;
};

export function getPushReadiness(): PushReadiness {
  const missing = [
    !env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ? "NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY" : null,
    !env.WEB_PUSH_VAPID_PRIVATE_KEY ? "WEB_PUSH_VAPID_PRIVATE_KEY" : null,
    !env.WEB_PUSH_VAPID_SUBJECT ? "WEB_PUSH_VAPID_SUBJECT" : null
  ].filter((item): item is string => Boolean(item));

  return {
    supported: true,
    ready: missing.length === 0,
    missing,
    publicKey: env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? null
  };
}

export function configureWebPush() {
  const readiness = getPushReadiness();
  if (!readiness.ready) {
    return { ok: false as const, readiness };
  }

  webpush.setVapidDetails(
    env.WEB_PUSH_VAPID_SUBJECT!,
    env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY!,
    env.WEB_PUSH_VAPID_PRIVATE_KEY!
  );

  return { ok: true as const, readiness };
}

export async function sendPushNotification(input: {
  subscription: PushSubscription;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}) {
  const configured = configureWebPush();
  if (!configured.ok) {
    return {
      ok: false as const,
      skipped: true,
      statusCode: 0,
      message: `Push skipped. Missing ${configured.readiness.missing.join(", ")}.`
    };
  }

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url ?? "/app/attention-command",
    tag: input.tag ?? "ferocity-alert",
    icon: "/icon.svg",
    badge: "/icon.svg"
  });

  try {
    const result = await webpush.sendNotification(input.subscription, payload);
    return { ok: true as const, skipped: false, statusCode: result.statusCode, message: result.body ?? "sent" };
  } catch (error) {
    const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
    const message = error instanceof Error ? error.message : "Unknown push error";
    return { ok: false as const, skipped: false, statusCode, message };
  }
}

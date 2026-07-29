import { notFound, redirect } from "next/navigation";
import { queryPostgres } from "@/lib/db/postgres";

export default async function ReferralRedirectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{24,64}$/i.test(token)) notFound();
  const result = await queryPostgres<{ public_key: string }>(
    `
    update public.customer_referral_links referral
    set visits = visits + 1, updated_at = now()
    from public.forms form
    where referral.form_id = form.id
      and referral.tenant_id = form.tenant_id
      and referral.referral_token = $1
      and referral.status = 'active'
      and form.active = true
    returning form.public_key
    `,
    [token]
  );
  const publicKey = result?.rows[0]?.public_key;
  if (!publicKey) notFound();
  redirect(`/forms/${encodeURIComponent(publicKey)}?source=referral&referral=${encodeURIComponent(token)}`);
}

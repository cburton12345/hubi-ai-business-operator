import Link from "next/link";
import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">Account Recovery</p>
          <h1>Reset your Ferocity password.</h1>
          <p className="muted">
            Enter the email tied to your workspace account. Ferocity sends a secure reset link through Supabase auth.
          </p>
          <div className="button-row">
            <Link className="button secondary-button" href="/login">
              Back to sign in
            </Link>
          </div>
        </div>
        <ResetPasswordForm />
      </section>
    </main>
  );
}

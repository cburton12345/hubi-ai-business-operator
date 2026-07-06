import Link from "next/link";
import { ResetPasswordUpdateForm } from "@/app/reset-password/update/ResetPasswordUpdateForm";

export default function ResetPasswordUpdatePage() {
  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">Secure Reset</p>
          <h1>Set a new password.</h1>
          <p className="muted">This page only works from the reset link sent to your email.</p>
          <div className="button-row">
            <Link className="button secondary-button" href="/login">
              Back to sign in
            </Link>
          </div>
        </div>
        <ResetPasswordUpdateForm />
      </section>
    </main>
  );
}

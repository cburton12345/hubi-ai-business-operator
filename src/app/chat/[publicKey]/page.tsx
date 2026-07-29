import { notFound } from "next/navigation";
import { ChatExperience } from "./ChatExperience";
import { getPublicFormProfile } from "@/lib/forms/get-public-form-profile";

export default async function PublicChatPage({ params }: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = await params;
  const profile = await getPublicFormProfile(publicKey);
  if (!profile) notFound();
  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">AI website receptionist</p>
          <h1>Chat with {profile.brandName}</h1>
          <p className="muted">{profile.primaryGoal}</p>
        </div>
        <ChatExperience publicKey={publicKey} brandName={profile.brandName} />
      </section>
    </main>
  );
}

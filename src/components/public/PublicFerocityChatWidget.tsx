"use client";

import Image from "next/image";
import { MessageCircle, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChatExperience } from "@/app/chat/[publicKey]/ChatExperience";

const publicChatPaths = new Set([
  "/about",
  "/automations",
  "/business-health-score",
  "/connect-website",
  "/features",
  "/ferocity-connect",
  "/free-business-audit",
  "/growth-system",
  "/integrations",
  "/platforms",
  "/pricing"
]);

export function PublicFerocityChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<{ publicKey: string; brandName: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!publicChatPaths.has(pathname)) return null;

  async function toggleChat() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (profile || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/public/chat/profile");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Ask Ferocity is unavailable.");
      setProfile({ publicKey: result.publicKey, brandName: result.brandName });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ask Ferocity is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className={`public-ferocity-widget${open ? " is-open" : ""}`} aria-label="Ask Ferocity">
      {open ? (
        <div className="public-ferocity-widget-panel">
          <header>
            <span><Image src="/ferocity-lion-brand.png" alt="" width={32} height={32} /> Ask Ferocity</span>
            <button aria-label="Close Ask Ferocity" onClick={() => setOpen(false)} type="button"><X size={18} /></button>
          </header>
          <div className="public-ferocity-widget-body">
            {profile ? (
              <ChatExperience brandName={profile.brandName} experience="ferocity_sales" publicKey={profile.publicKey} />
            ) : loading ? (
              <p className="muted">Opening Ferocity…</p>
            ) : (
              <p className="form-error">{error || "Ask Ferocity is unavailable."}</p>
            )}
          </div>
        </div>
      ) : null}
      <button className="public-ferocity-widget-launcher" onClick={toggleChat} type="button" aria-expanded={open}>
        {open ? <X size={20} /> : <MessageCircle size={20} />}
        <span>{open ? "Close" : "Ask Ferocity"}</span>
      </button>
    </aside>
  );
}

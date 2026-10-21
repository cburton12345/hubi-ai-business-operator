"use client";

import { useRef, useState, useTransition } from "react";
import { executeEmployeeChatAction } from "@/app/employee/actions";
import type { EmployeeChatLanguage, EmployeeChatTurn } from "@/lib/employee/employee-chat";

const copy = {
  en: {
    title: "Ask Ferocity about your work",
    body: "Get help with your assigned goals, schedule, and punch list; add a field note, update a visit, or alert the office.",
    empty: "Ask what is next, which tasks remain, or tell Ferocity what you completed.",
    placeholder: "What do you need help with?",
    send: "Send",
    sending: "Working…",
    private: "Only your assigned work is available here. Owner pricing and private business information stay hidden."
  },
  es: {
    title: "Pregúntele a Ferocity sobre su trabajo",
    body: "Obtenga ayuda con sus objetivos, horario y lista asignados; agregue una nota, actualice una visita o avise a la oficina.",
    empty: "Pregunte qué sigue, qué tareas faltan o dígale a Ferocity qué terminó.",
    placeholder: "¿En qué necesita ayuda?",
    send: "Enviar",
    sending: "Trabajando…",
    private: "Aquí solo está disponible su trabajo asignado. Los precios y la información privada del negocio permanecen ocultos."
  }
} as const;

export function EmployeeFerocityChat({
  initialTurns,
  initialThreadId,
  language
}: {
  initialTurns: EmployeeChatTurn[];
  initialThreadId: string | null;
  language: EmployeeChatLanguage;
}) {
  const labels = copy[language];
  const [turns, setTurns] = useState(initialTurns);
  const [threadId, setThreadId] = useState(initialThreadId);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const state = await executeEmployeeChatAction({ ok: false }, formData);
      if (!state.responseId || !state.message) return;
      if (state.threadId) setThreadId(state.threadId);
      const nextTurns: EmployeeChatTurn[] = [
        ...(state.userMessage ? [{ id: `${state.responseId}-employee`, role: "employee" as const, body: state.userMessage, language: state.language ?? language }] : []),
        { id: `${state.responseId}-ferocity`, role: "ferocity" as const, body: state.message, language: state.language ?? language }
      ];
      setTurns((current) => [...current, ...nextTurns].slice(-20));
      if (state.ok) formRef.current?.reset();
    });
  }

  return (
    <section className="panel employee-ferocity-chat section-actions" aria-labelledby="employee-ferocity-title">
      <div>
        <h2 id="employee-ferocity-title">{labels.title}</h2>
        <p className="muted">{labels.body}</p>
      </div>
      <div className="employee-ferocity-transcript" aria-live="polite">
        {turns.length === 0 ? <p className="muted">{labels.empty}</p> : turns.map((turn) => (
          <div className={`employee-ferocity-turn ${turn.role === "employee" ? "is-employee" : "is-ferocity"}`} key={turn.id}>
            <strong>{turn.role === "employee" ? (language === "es" ? "Usted" : "You") : "Ferocity"}</strong>
            <p>{turn.body}</p>
          </div>
        ))}
        {pending ? <p className="muted">{labels.sending}</p> : null}
      </div>
      <form className="form-stack" ref={formRef} onSubmit={submit}>
        <input name="threadId" type="hidden" value={threadId ?? ""} />
        <input name="preferredLanguage" type="hidden" value={language} />
        <textarea name="command" rows={3} maxLength={4000} placeholder={labels.placeholder} required disabled={pending} />
        <div className="list-row flush-row">
          <small className="muted">{labels.private}</small>
          <button className="button" type="submit" disabled={pending}>{pending ? labels.sending : labels.send}</button>
        </div>
      </form>
    </section>
  );
}

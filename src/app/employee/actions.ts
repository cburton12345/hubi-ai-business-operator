"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateAssignmentTaskStatusAction } from "@/app/app/operations-workforce/actions";
import { saveVisitFieldNoteAction, updateEmployeeVisitStatusAction } from "@/app/employee/visits/[visitId]/actions";
import { queryPostgres, withPostgresTransaction } from "@/lib/db/postgres";
import { canAccessEmployeeAssignment, canAccessEmployeeVisit, getEmployeeAccessContext } from "@/lib/employee/employee-access";
import { getEmployeeOperationalContext, interpretEmployeeChat, type EmployeeChatLanguage, type EmployeeChatTurn } from "@/lib/employee/employee-chat";

export type EmployeeChatActionState = {
  ok: boolean;
  message?: string;
  userMessage?: string;
  language?: EmployeeChatLanguage;
  threadId?: string;
  responseId?: string;
};

const inputSchema = z.object({
  threadId: z.string().uuid().optional(),
  command: z.string().trim().min(1).max(4000),
  preferredLanguage: z.enum(["en", "es"])
});

async function resolveThread(input: { tenantId: string; workerId: string; userId: string; requestedId?: string; language: EmployeeChatLanguage }) {
  if (input.requestedId) {
    const existing = await queryPostgres<{ id: string }>(
      `select id from public.ferocity_chat_threads where id=$1 and tenant_id=$2 and worker_id=$3
       and created_by_user_id=$4 and audience='employee' and status='active' limit 1`,
      [input.requestedId, input.tenantId, input.workerId, input.userId]
    );
    if (existing?.rows[0]) return existing.rows[0].id;
  }
  const created = await queryPostgres<{ id: string }>(
    `insert into public.ferocity_chat_threads
       (tenant_id,created_by_user_id,title,audience,worker_id,preferred_language)
     values ($1,$2,$3,'employee',$4,$5) returning id`,
    [input.tenantId, input.userId, input.language === "es" ? "Mi jornada" : "My workday", input.workerId, input.language]
  );
  if (!created?.rows[0]?.id) throw new Error("Employee conversation could not be created.");
  return created.rows[0].id;
}

async function executeVerifiedAction(
  context: Awaited<ReturnType<typeof getEmployeeAccessContext>>,
  action: Awaited<ReturnType<typeof interpretEmployeeChat>>["action"],
  threadId: string,
  command: string,
  language: EmployeeChatLanguage
) {
  const yes = language === "es";
  if (action.type === "none") return { verified: false, suffix: "" };
  if (action.type === "mark_task_done" || action.type === "reopen_task") {
    if (!(await canAccessEmployeeAssignment(context, action.assignmentId))) return { verified: false, suffix: yes ? " No pude confirmar acceso a esa tarea." : " I could not confirm access to that task." };
    const data = new FormData();
    data.set("assignmentId", action.assignmentId);
    data.set("taskIndex", String(action.taskIndex));
    data.set("status", action.type === "mark_task_done" ? "done" : "open");
    await updateAssignmentTaskStatusAction(data);
    const verified = await queryPostgres<{ matches: boolean }>(
      `select coalesce(task_list_json->$3->>'status','open')=$4 as matches
       from public.operations_assignments where tenant_id=$1 and id=$2`,
      [context.tenantId, action.assignmentId, action.taskIndex, action.type === "mark_task_done" ? "done" : "open"]
    );
    const ok = verified?.rows[0]?.matches === true;
    return { verified: ok, suffix: ok ? (yes ? " Listo: confirmé el cambio en la lista." : " Done—I confirmed the punch-list change.") : (yes ? " No pude verificar el cambio, así que no lo marqué como terminado." : " I could not verify the change, so I did not report it as complete.") };
  }
  if (action.type === "add_field_note") {
    if (!(await canAccessEmployeeVisit(context, action.visitId))) return { verified: false, suffix: yes ? " No pude confirmar acceso a esa visita." : " I could not confirm access to that visit." };
    const data = new FormData();
    data.set("visitId", action.visitId);
    data.set("note", action.note);
    await saveVisitFieldNoteAction(data);
    const verified = await queryPostgres<{ found: boolean }>(
      `select exists(select 1 from public.service_operating_events where tenant_id=$1 and visit_id=$2 and event_type='field_note' and detail=$3) as found`,
      [context.tenantId, action.visitId, action.note]
    );
    const ok = verified?.rows[0]?.found === true;
    return { verified: ok, suffix: ok ? (yes ? " Listo: guardé y confirmé la nota de campo." : " Done—I saved and confirmed the field note.") : (yes ? " No pude verificar que se guardó la nota." : " I could not verify that the note was saved.") };
  }
  if (action.type === "update_visit_status") {
    if (!(await canAccessEmployeeVisit(context, action.visitId))) return { verified: false, suffix: yes ? " No pude confirmar acceso a esa visita." : " I could not confirm access to that visit." };
    const data = new FormData();
    data.set("visitId", action.visitId);
    data.set("status", action.status);
    await updateEmployeeVisitStatusAction(data);
    const verified = await queryPostgres<{ matches: boolean }>(
      `select status=$3 as matches from public.service_visits where tenant_id=$1 and id=$2`,
      [context.tenantId, action.visitId, action.status]
    );
    const ok = verified?.rows[0]?.matches === true;
    return { verified: ok, suffix: ok ? (yes ? " Listo: confirmé el estado de la visita." : " Done—I confirmed the visit status.") : (yes ? " El cambio requiere más información o revisión; no lo marqué como terminado." : " The change needs more information or review; I did not report it as complete.") };
  }
  if (action.type !== "raise_office_attention") return { verified: false, suffix: "" };
  if (action.assignmentId && !(await canAccessEmployeeAssignment(context, action.assignmentId))) return { verified: false, suffix: yes ? " No pude confirmar acceso a ese trabajo." : " I could not confirm access to that work." };
  if (action.visitId && !(await canAccessEmployeeVisit(context, action.visitId))) return { verified: false, suffix: yes ? " No pude confirmar acceso a esa visita." : " I could not confirm access to that visit." };
  const externalId = `employee-chat:${createHash("sha256").update(`${threadId}:${command}:${action.summary}`).digest("hex").slice(0, 32)}`;
  const inserted = await queryPostgres<{ id: string }>(
    `insert into public.owner_command_events
       (tenant_id,platform_key,platform_name,external_event_id,event_type,title,summary,severity,status,owner_attention,ai_handled,recommended_action,action_href,risk_type,confidence_score,metadata_json)
     values ($1,'ferocity-workforce','Ferocity Workforce',$2,'employee.chat_attention',$3,$4,'medium','needs_owner',true,false,$5,'/app/operations-workforce','approval',100,$6::jsonb)
     on conflict (tenant_id,platform_key,external_event_id) where external_event_id is not null
     do update set summary=excluded.summary,owner_attention=true,status='needs_owner',updated_at=now()
     returning id`,
    [context.tenantId, externalId, yes ? "Empleado necesita atención" : "Employee needs attention", action.summary, yes ? "Revisar la solicitud del empleado." : "Review the employee request.", JSON.stringify({ source: "employee_chat", workerId: context.workerId, threadId, assignmentId: action.assignmentId ?? null, visitId: action.visitId ?? null })]
  );
  const ok = Boolean(inserted?.rows[0]?.id);
  return { verified: ok, suffix: ok ? (yes ? " Avisé a la oficina y confirmé que quedó en su lista." : " I alerted the office and confirmed it is on their list.") : (yes ? " No pude confirmar el aviso a la oficina." : " I could not confirm the office alert.") };
}

export async function executeEmployeeChatAction(_previous: EmployeeChatActionState, formData: FormData): Promise<EmployeeChatActionState> {
  const parsed = inputSchema.safeParse({
    threadId: formData.get("threadId") || undefined,
    command: formData.get("command"),
    preferredLanguage: formData.get("preferredLanguage")
  });
  if (!parsed.success) return { ok: false, message: "Please enter a message.", responseId: randomUUID() };
  const context = await getEmployeeAccessContext();
  if (!context.workerId || !context.userId) return { ok: false, message: parsed.data.preferredLanguage === "es" ? "Su perfil de empleado no está conectado." : "Your employee profile is not connected.", language: parsed.data.preferredLanguage, responseId: randomUUID() };

  try {
    const threadId = await resolveThread({ tenantId: context.tenantId, workerId: context.workerId, userId: context.userId, requestedId: parsed.data.threadId, language: parsed.data.preferredLanguage });
    const prior = await queryPostgres<{ id: string; role: "employee" | "ferocity"; body: string; original_language: EmployeeChatLanguage | null }>(
      `select id,role,body,original_language from (select id,role,body,original_language,created_at from public.ferocity_chat_messages
       where tenant_id=$1 and thread_id=$2 and role in ('employee','ferocity') order by created_at desc limit 12) recent order by created_at`,
      [context.tenantId, threadId]
    );
    const history: EmployeeChatTurn[] = (prior?.rows ?? []).map((turn) => ({ id: turn.id, role: turn.role, body: turn.body, language: turn.original_language === "es" ? "es" : "en" }));
    const assignments = await getEmployeeOperationalContext(context);
    const decision = await interpretEmployeeChat({ context, command: parsed.data.command, preferredLanguage: parsed.data.preferredLanguage, history, assignments });
    const execution = await executeVerifiedAction(context, decision.action, threadId, parsed.data.command, decision.language);
    const message = `${decision.answer}${execution.suffix}`.trim();
    const saved = await withPostgresTransaction(async (client) => {
      const inserted = await client.query(
        `insert into public.ferocity_chat_messages (tenant_id,thread_id,user_id,role,body,status,original_language,detail_json)
         values ($1,$2,$3,'employee',$4,'completed',$5,$6::jsonb),
                ($1,$2,null,'ferocity',$7,$8,$5,$9::jsonb)`,
        [context.tenantId, threadId, context.userId, parsed.data.command, decision.language, JSON.stringify({ workerScoped: true }), message, execution.verified || decision.action.type === "none" ? "completed" : "needs_attention", JSON.stringify({ workerScoped: true, actionType: decision.action.type, verifiedExecution: execution.verified })]
      );
      if (inserted.rowCount !== 2) throw new Error("Conversation messages were not saved.");
      const updated = await client.query(`update public.ferocity_chat_threads set preferred_language=$3,updated_at=now() where tenant_id=$1 and id=$2`, [context.tenantId, threadId, decision.language]);
      if (updated.rowCount !== 1) throw new Error("Conversation thread was not updated.");
      return true;
    });
    if (!saved) throw new Error("Conversation could not be saved atomically.");
    revalidatePath("/employee");
    revalidatePath("/app/operations-workforce");
    revalidatePath("/app/owner-command-center");
    return { ok: true, message, userMessage: parsed.data.command, language: decision.language, threadId, responseId: randomUUID() };
  } catch (error) {
    console.error("employee_chat_failed", error instanceof Error ? error.message : "unknown");
    return { ok: false, message: parsed.data.preferredLanguage === "es" ? "No pude terminar eso de forma segura. Nada se marcó como completo." : "I could not finish that safely. Nothing was reported as complete.", language: parsed.data.preferredLanguage, responseId: randomUUID() };
  }
}

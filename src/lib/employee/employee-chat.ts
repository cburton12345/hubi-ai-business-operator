import { z } from "zod";
import { generateJsonWithAiService } from "@/lib/ai/ai-service";
import { queryPostgres } from "@/lib/db/postgres";
import type { EmployeeAccessContext } from "@/lib/employee/employee-access";

export type EmployeeChatLanguage = "en" | "es";

export type EmployeeChatTurn = {
  id: string;
  role: "employee" | "ferocity";
  body: string;
  language: EmployeeChatLanguage;
};

export type EmployeeChatAction =
  | { type: "none" }
  | { type: "mark_task_done" | "reopen_task"; assignmentId: string; taskIndex: number }
  | { type: "add_field_note"; visitId: string; note: string }
  | { type: "update_visit_status"; visitId: string; status: "dispatched" | "en_route" | "arrived" | "in_progress" | "paused" | "completed" | "no_show" }
  | { type: "raise_office_attention"; assignmentId?: string; visitId?: string; summary: string };

export type EmployeeChatDecision = {
  answer: string;
  language: EmployeeChatLanguage;
  action: EmployeeChatAction;
};

type EmployeeAssignmentContext = {
  assignmentId: string;
  visitId: string | null;
  title: string;
  jobsite: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  status: string;
  priority: string;
  tasks: Array<{ index: number; title: string; status: "open" | "done" }>;
};

const uuid = z.string().uuid();
const responseSchema = z.object({
  answer: z.string().trim().min(1).max(4000),
  language: z.enum(["en", "es"]),
  action: z.object({
    type: z.enum(["none", "mark_task_done", "reopen_task", "add_field_note", "update_visit_status", "raise_office_attention"]),
    assignmentId: z.string().optional(),
    visitId: z.string().optional(),
    taskIndex: z.number().int().min(0).max(99).optional(),
    status: z.string().optional(),
    note: z.string().trim().max(4000).optional(),
    summary: z.string().trim().max(1200).optional()
  })
});

function fallbackAnswer(language: EmployeeChatLanguage) {
  return language === "es"
    ? "Puedo ayudar con su trabajo asignado, lista de tareas, horario y notas de campo. Dígame cuál trabajo o tarea necesita revisar."
    : "I can help with your assigned work, punch list, schedule, and field notes. Tell me which job or task you need to review.";
}

export function normalizeEmployeeChatDecision(
  input: unknown,
  fallbackLanguage: EmployeeChatLanguage,
  assignments: EmployeeAssignmentContext[]
): EmployeeChatDecision {
  const parsed = responseSchema.safeParse(input);
  if (!parsed.success) return { answer: fallbackAnswer(fallbackLanguage), language: fallbackLanguage, action: { type: "none" } };

  const { answer, language, action } = parsed.data;
  if (action.type === "none") return { answer, language, action: { type: "none" } };

  const assignment = action.assignmentId && uuid.safeParse(action.assignmentId).success
    ? assignments.find((item) => item.assignmentId === action.assignmentId)
    : undefined;
  const visit = action.visitId && uuid.safeParse(action.visitId).success
    ? assignments.find((item) => item.visitId === action.visitId)
    : undefined;

  if (action.type === "mark_task_done" || action.type === "reopen_task") {
    if (!assignment || action.taskIndex === undefined || !assignment.tasks.some((task) => task.index === action.taskIndex)) {
      return { answer, language, action: { type: "none" } };
    }
    return { answer, language, action: { type: action.type, assignmentId: assignment.assignmentId, taskIndex: action.taskIndex } };
  }
  if (action.type === "add_field_note") {
    if (!visit?.visitId || !action.note) return { answer, language, action: { type: "none" } };
    return { answer, language, action: { type: action.type, visitId: visit.visitId, note: action.note } };
  }
  if (action.type === "update_visit_status") {
    const status = z.enum(["dispatched", "en_route", "arrived", "in_progress", "paused", "completed", "no_show"]).safeParse(action.status);
    if (!visit?.visitId || !status.success) return { answer, language, action: { type: "none" } };
    return { answer, language, action: { type: action.type, visitId: visit.visitId, status: status.data } };
  }
  if (!action.summary) return { answer, language, action: { type: "none" } };
  if (action.assignmentId && !assignment) return { answer, language, action: { type: "none" } };
  if (action.visitId && !visit?.visitId) return { answer, language, action: { type: "none" } };
  return {
    answer,
    language,
    action: {
      type: "raise_office_attention",
      summary: action.summary,
      ...(assignment ? { assignmentId: assignment.assignmentId } : {}),
      ...(visit?.visitId ? { visitId: visit.visitId } : {})
    }
  };
}

export async function getEmployeeChatInitialState(context: EmployeeAccessContext) {
  if (!context.workerId || !context.userId) {
    return { threadId: null, language: "en" as const, turns: [] as EmployeeChatTurn[] };
  }
  const worker = await queryPostgres<{ preferred_language: EmployeeChatLanguage }>(
    `select preferred_language from public.operations_workers where tenant_id=$1 and id=$2 limit 1`,
    [context.tenantId, context.workerId]
  );
  const language: EmployeeChatLanguage = worker?.rows[0]?.preferred_language === "es" ? "es" : "en";
  const thread = await queryPostgres<{ id: string }>(
    `select id from public.ferocity_chat_threads
     where tenant_id=$1 and worker_id=$2 and created_by_user_id=$3 and audience='employee' and status='active'
     order by updated_at desc limit 1`,
    [context.tenantId, context.workerId, context.userId]
  );
  const threadId = thread?.rows[0]?.id ?? null;
  if (!threadId) return { threadId, language, turns: [] as EmployeeChatTurn[] };
  const messages = await queryPostgres<{ id: string; role: "employee" | "ferocity"; body: string; original_language: EmployeeChatLanguage | null }>(
    `select id,role,body,original_language from (
       select id,role,body,original_language,created_at from public.ferocity_chat_messages
       where tenant_id=$1 and thread_id=$2 and role in ('employee','ferocity')
       order by created_at desc limit 20
     ) recent order by created_at asc`,
    [context.tenantId, threadId]
  );
  return {
    threadId,
    language,
    turns: (messages?.rows ?? []).map((message) => ({
      id: message.id,
      role: message.role,
      body: message.body,
      language: (message.original_language === "es" ? "es" : "en") as EmployeeChatLanguage
    }))
  };
}

export async function getEmployeeOperationalContext(context: EmployeeAccessContext): Promise<EmployeeAssignmentContext[]> {
  if (!context.workerId) return [];
  const result = await queryPostgres<{
    id: string; service_visit_id: string | null; title: string; jobsite: string | null;
    scheduled_start: Date | null; scheduled_end: Date | null; status: string; priority: string;
    task_list_json: unknown;
  }>(
    `select a.id,a.service_visit_id,a.title,a.jobsite,a.scheduled_start,a.scheduled_end,
            a.status,a.priority,a.task_list_json
     from public.operations_assignments a
     where a.tenant_id=$1 and a.status <> 'archived' and (
       a.worker_id=$2
       or exists(select 1 from public.operations_crew_members cm where cm.tenant_id=a.tenant_id and cm.crew_id=a.crew_id and cm.worker_id=$2)
       or exists(select 1 from public.service_visit_assignments va where va.tenant_id=a.tenant_id and va.visit_id=a.service_visit_id and va.worker_id=$2)
     )
     order by coalesce(a.scheduled_start,a.created_at) asc limit 30`,
    [context.tenantId, context.workerId]
  );
  return (result?.rows ?? []).map((row) => ({
    assignmentId: row.id,
    visitId: row.service_visit_id,
    title: row.title,
    jobsite: row.jobsite,
    scheduledStart: row.scheduled_start?.toISOString() ?? null,
    scheduledEnd: row.scheduled_end?.toISOString() ?? null,
    status: row.status,
    priority: row.priority,
    tasks: Array.isArray(row.task_list_json) ? row.task_list_json.slice(0, 100).map((value, index) => {
      const task = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
      return {
        index,
        title: typeof task.title === "string" ? task.title.slice(0, 240) : `Task ${index + 1}`,
        status: task.status === "done" ? "done" as const : "open" as const
      };
    }) : []
  }));
}

export async function interpretEmployeeChat(input: {
  context: EmployeeAccessContext;
  command: string;
  preferredLanguage: EmployeeChatLanguage;
  history: EmployeeChatTurn[];
  assignments: EmployeeAssignmentContext[];
}) {
  const fallback: EmployeeChatDecision = {
    answer: fallbackAnswer(input.preferredLanguage),
    language: input.preferredLanguage,
    action: { type: "none" }
  };
  const raw = await generateJsonWithAiService<Record<string, unknown>>({
    tenantId: input.context.tenantId,
    userId: input.context.userId,
    featureKey: "employee_ferocity_chat",
    runType: "employee_ferocity_chat",
    system: `You are Ferocity's field-work assistant. Answer in the language of the employee's latest message (English or Spanish), using the preferred language only as fallback. Use only the supplied worker-scoped assignments. Never reveal or speculate about prices, estimates, invoices, margins, payroll, pay rates, owner goals, unrelated workers, unrelated customers, or hidden business data. Preserve business meaning across languages. Be concise and practical. Only choose a write action when the employee explicitly and unambiguously asks for it. Never claim an action succeeded; the application verifies execution afterward. Return JSON with answer, language, and action. Action is one of: none; mark_task_done/reopen_task with assignmentId and taskIndex; add_field_note with visitId and note; update_visit_status with visitId and status; raise_office_attention with summary and optional assignmentId/visitId.`,
    user: JSON.stringify({
      preferredLanguage: input.preferredLanguage,
      latestMessage: input.command,
      recentConversation: input.history.slice(-12).map(({ role, body, language }) => ({ role, body, language })),
      assignedWork: input.assignments
    }),
    fallback: fallback as unknown as Record<string, unknown>,
    temperature: 0.2,
    timeoutMs: 20_000,
    metadata: { workerScoped: true, assignmentCount: input.assignments.length }
  });
  return normalizeEmployeeChatDecision(raw, input.preferredLanguage, input.assignments);
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const openingSchema = z.object({
  title: z.string().trim().min(2).max(180),
  department: z.string().trim().max(120).optional(),
  location: z.string().trim().max(180).optional(),
  type: z.enum(["employee", "subcontractor", "temporary", "intern"]),
  description: z.string().trim().max(3000).optional()
});
const applicantSchema = z.object({
  openingId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(180),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  source: z.string().trim().max(120).optional(),
  summary: z.string().trim().max(2000).optional()
});
const stageSchema = z.object({
  applicantId: z.string().uuid(),
  stage: z.enum(["new", "screening", "interview", "reference_check", "offer", "hired", "rejected", "withdrawn"])
});

export async function createJobOpeningAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = openingSchema.safeParse({
    title: formData.get("title"), department: String(formData.get("department") ?? ""),
    location: String(formData.get("location") ?? ""), type: formData.get("type"),
    description: String(formData.get("description") ?? "")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `insert into public.recruiting_job_openings
      (tenant_id, title, department, location, employment_type, status, description)
     values ($1,$2,$3,$4,$5,'open',$6)`,
    [tenantId, parsed.data.title, parsed.data.department || null, parsed.data.location || null, parsed.data.type, parsed.data.description || null]
  );
  revalidatePath("/app/team");
}

export async function createApplicantAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = applicantSchema.safeParse({
    openingId: String(formData.get("openingId") ?? "") || undefined,
    name: formData.get("name"), email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""), source: String(formData.get("source") ?? ""),
    summary: String(formData.get("summary") ?? "")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `insert into public.recruiting_applicants
      (tenant_id, opening_id, name, email, phone, source, ai_summary, consent_status)
     values ($1,$2,$3,$4,$5,$6,$7,'unknown')`,
    [tenantId, parsed.data.openingId ?? null, parsed.data.name, parsed.data.email || null, parsed.data.phone || null, parsed.data.source || null, parsed.data.summary || null]
  );
  revalidatePath("/app/team");
}

export async function updateApplicantStageAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = stageSchema.safeParse({ applicantId: formData.get("applicantId"), stage: formData.get("stage") });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `update public.recruiting_applicants set stage = $3, updated_at = now()
     where tenant_id = $1 and id = $2`,
    [tenantId, parsed.data.applicantId, parsed.data.stage]
  );
  revalidatePath("/app/team");
}

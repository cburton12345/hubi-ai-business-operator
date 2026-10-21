import pg from "pg";
import { reconcileRetellTransferPrompt, retellBusinessTools } from "@/lib/phone/retell-tool-definitions";
import type { HumanTransferDestination, TransferRoutingRole } from "@/lib/phone/transfer-routing";

const apply = process.argv.includes("--apply");
const adoptQaPrimary = process.argv.includes("--adopt-authorized-qa-primary");
const targetTenantId = process.env.RETELL_TEST_TENANT_ID?.trim() || "11111111-1111-4111-8111-111111111111";
const appUrl = (process.env.FEROCITY_APP_URL || "https://ferocity.live").replace(/\/+$/, "");
const apiKey = process.env.RETELL_API_KEY?.trim();
if (!process.env.DATABASE_URL || !apiKey) throw new Error("DATABASE_URL and RETELL_API_KEY are required.");

type DestinationRow = {
  id: string;
  label: string;
  routing_role: TransferRoutingRole;
  phone_number: string;
  priority: number;
  weekdays_json: number[];
  available_start: string | null;
  available_end: string | null;
  timezone: string;
  is_primary: boolean;
  authorization_confirmed_at: Date;
};

function destinationFromRow(row: DestinationRow): HumanTransferDestination {
  return {
    id: row.id,
    label: row.label,
    role: row.routing_role,
    phoneNumber: row.phone_number,
    priority: Number(row.priority),
    weekdays: Array.isArray(row.weekdays_json) ? row.weekdays_json.map(Number) : [0, 1, 2, 3, 4, 5, 6],
    availableStart: row.available_start?.slice(0, 5) ?? null,
    availableEnd: row.available_end?.slice(0, 5) ?? null,
    timezone: row.timezone || "America/Chicago",
    isPrimary: row.is_primary,
  };
}

async function retell(path: string, method: "GET" | "PATCH" = "GET", payload?: Record<string, unknown>) {
  const response = await fetch(`https://api.retellai.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, ...(payload ? { "Content-Type": "application/json" } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : typeof body?.error === "string" ? body.error : "";
    throw new Error(`Retell ${method} ${path} failed with HTTP ${response.status}${message ? `: ${message.slice(0, 240)}` : "."}`);
  }
  return body ?? {};
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let originalLlm: { llmId: string; prompt: string; tools: Record<string, unknown>[] } | null = null;
  let remoteChanged = false;
  try {
    const provider = await client.query<{ assistant_id: string | null }>(
      `select nullif(metadata_json->>'assistantId','') assistant_id
         from public.provider_accounts
        where tenant_id=$1 and provider_key='retell_voice' limit 1`,
      [targetTenantId],
    );
    const assistantId = provider.rows[0]?.assistant_id;
    if (!assistantId) throw new Error("The production Ferocity Retell assistant is not recorded for the target workspace.");

    let destinationRows = (await client.query<DestinationRow>(
      `select id,label,routing_role,phone_number,priority,weekdays_json,
              available_start::text,available_end::text,timezone,is_primary,authorization_confirmed_at
         from public.call_transfer_destinations
        where tenant_id=$1 and is_active=true and authorization_confirmed_at is not null
        order by is_primary desc,priority,created_at`,
      [targetTenantId],
    )).rows;

    let adopted: DestinationRow | null = null;
    if (!destinationRows.length && adoptQaPrimary) {
      const source = await client.query<DestinationRow>(
        `select d.id,d.label,d.routing_role,d.phone_number,d.priority,d.weekdays_json,
                d.available_start::text,d.available_end::text,d.timezone,d.is_primary,d.authorization_confirmed_at
           from public.call_transfer_destinations d
           join public.tenants t on t.id=d.tenant_id
          where t.slug='ferocity-qa-demo' and d.is_active=true and d.is_primary=true
            and d.authorization_confirmed_at is not null
          order by d.updated_at desc`,
      );
      if (source.rows.length !== 1) {
        throw new Error("Exactly one active, authorized Ferocity QA primary transfer destination is required for adoption.");
      }
      adopted = source.rows[0];
      destinationRows = [adopted];
    }
    if (!destinationRows.length) {
      throw new Error("No active authorized transfer destination exists for the production Ferocity workspace.");
    }

    const destinations = destinationRows.slice(0, 12).map(destinationFromRow);
    const agent = await retell(`/get-agent/${encodeURIComponent(assistantId)}`);
    const engine = agent.response_engine as Record<string, unknown> | undefined;
    const llmId = typeof engine?.llm_id === "string" ? engine.llm_id : "";
    if (!llmId) throw new Error("The production Retell agent does not expose an editable Retell LLM.");
    const llm = await retell(`/get-retell-llm/${encodeURIComponent(llmId)}`);
    const prompt = typeof llm.general_prompt === "string" ? llm.general_prompt : "";
    const tools = Array.isArray(llm.general_tools)
      ? llm.general_tools.filter((tool): tool is Record<string, unknown> => Boolean(tool && typeof tool === "object" && !Array.isArray(tool)))
      : [];
    const preservedTools = tools.filter((tool) => tool.type !== "transfer_call");
    const transferTools = retellBusinessTools(appUrl, destinations).filter((tool) => tool.type === "transfer_call");
    const nextPrompt = reconcileRetellTransferPrompt(prompt, transferTools.length > 0);
    originalLlm = { llmId, prompt, tools };

    if (!apply) {
      console.log(JSON.stringify({
        ok: true,
        mode: "dry_run",
        targetHasDestination: adopted === null,
        adoptingAuthorizedQaPrimary: adopted !== null,
        existingTransferTools: tools.filter((tool) => tool.type === "transfer_call").length,
        proposedTransferTools: transferTools.length,
        promptRequiresUpdate: nextPrompt !== prompt,
      }, null, 2));
      return;
    }

    await retell(`/update-retell-llm/${encodeURIComponent(llmId)}`, "PATCH", {
      general_prompt: nextPrompt,
      general_tools: [...preservedTools, ...transferTools],
    });
    remoteChanged = true;
    const verified = await retell(`/get-retell-llm/${encodeURIComponent(llmId)}`);
    const verifiedTools = Array.isArray(verified.general_tools) ? verified.general_tools : [];
    const verifiedTransferCount = verifiedTools.filter((tool) => tool && typeof tool === "object" && (tool as Record<string, unknown>).type === "transfer_call").length;
    if (verifiedTransferCount !== transferTools.length || verifiedTransferCount < 1) {
      throw new Error("Retell did not preserve the expected verified transfer tools after synchronization.");
    }

    await client.query("begin");
    try {
      if (adopted) {
        await client.query(
          `update public.call_transfer_destinations
              set is_primary=false,updated_at=now()
            where tenant_id=$1 and is_primary=true and is_active=true`,
          [targetTenantId],
        );
        await client.query(
          `insert into public.call_transfer_destinations
             (tenant_id,label,routing_role,phone_number,priority,weekdays_json,available_start,available_end,
              timezone,is_primary,is_active,authorization_confirmed_at,metadata_json)
           values ($1,$2,$3,$4,$5,$6::jsonb,$7::time,$8::time,$9,true,true,now(),$10::jsonb)
           on conflict (tenant_id,phone_number,routing_role) do update set
             label=excluded.label,priority=excluded.priority,weekdays_json=excluded.weekdays_json,
             available_start=excluded.available_start,available_end=excluded.available_end,
             timezone=excluded.timezone,is_primary=true,is_active=true,
             authorization_confirmed_at=now(),metadata_json=public.call_transfer_destinations.metadata_json||excluded.metadata_json,
             updated_at=now()`,
          [
            targetTenantId,
            adopted.label,
            adopted.routing_role,
            adopted.phone_number,
            adopted.priority,
            JSON.stringify(adopted.weekdays_json),
            adopted.available_start,
            adopted.available_end,
            adopted.timezone,
            JSON.stringify({ source: "authorized_ferocity_qa_primary", adoptedAt: new Date().toISOString(), ownerAuthorizedSetup: true }),
          ],
        );
        await client.query(
          `update public.phone_connections
              set human_transfer_number=$2,
                  setup_json=setup_json||$3::jsonb,updated_at=now()
            where tenant_id=$1`,
          [targetTenantId, adopted.phone_number, JSON.stringify({ transferConfiguredAt: new Date().toISOString(), source: "authorized_ferocity_qa_primary" })],
        );
      }
      await client.query(
        `update public.provider_accounts
            set metadata_json=metadata_json||$2::jsonb,updated_at=now()
          where tenant_id=$1 and provider_key='retell_voice'`,
        [targetTenantId, JSON.stringify({ transferToolCount: transferTools.length, transferToolsSyncedAt: new Date().toISOString() })],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      if (originalLlm) {
        await retell(`/update-retell-llm/${encodeURIComponent(originalLlm.llmId)}`, "PATCH", {
          general_prompt: originalLlm.prompt,
          general_tools: originalLlm.tools,
        }).catch(() => undefined);
        remoteChanged = false;
      }
      throw error;
    }

    console.log(JSON.stringify({
      ok: true,
      mode: "applied",
      destinationSource: adopted ? "authorized_qa_primary" : "existing_target_configuration",
      transferToolsVerified: verifiedTransferCount,
      databaseRecorded: true,
    }, null, 2));
  } catch (error) {
    if (remoteChanged && originalLlm) {
      await retell(`/update-retell-llm/${encodeURIComponent(originalLlm.llmId)}`, "PATCH", {
        general_prompt: originalLlm.prompt,
        general_tools: originalLlm.tools,
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Retell transfer reconciliation failed.");
  process.exitCode = 1;
});

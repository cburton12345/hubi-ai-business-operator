import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '@/lib/env';
import { queryPostgres, withPostgresTransaction } from '@/lib/db/postgres';
import { assertCompanionActionPermitted } from '@/lib/integrations/companion-product-contract';
import { generateJsonWithAiService } from '@/lib/ai/ai-service';

const candidateSchema=z.object({tenant_id:z.string().uuid(),tenant_name:z.string(),unit_label:z.string(),property_name:z.string()});
const authorizationProofSchema=z.object({
  h4r_workspace_id:z.string().uuid(),
  ferocity_tenant_id:z.string().uuid(),
  ferocity_user_id:z.string().min(1),
  authorization_id:z.string().uuid(),
  h4r_actor_user_id:z.string().uuid(),
  verified_at:z.string().datetime({offset:true}),
  authorized_at:z.string().datetime({offset:true}),
  purpose:z.literal('owner_received_rent_payments'),
  scopes:z.array(z.enum(['rent_payment:read','rent_payment:prepare','rent_payment:confirm','rent_payment:cancel'])).min(1),
});
const browserAuthorizationEnvelopeSchema=z.object({
  ok:z.literal(true),contract_version:z.literal(2),authorization:authorizationProofSchema,
  result:z.object({linked:z.literal(true)}),
});
const proposalSchema=z.object({
  id:z.string().uuid(),workspace_id:z.string().uuid(),bridge_authorization_id:z.string().uuid(),
  created_by:z.string().uuid(),source_thread_id:z.string().min(1),proposal_version:z.number().int().positive(),proposal_digest:z.string().regex(/^[a-f0-9]{64}$/),
  expires_at:z.string().datetime({offset:true}),record_version:z.string().min(1),amount:z.coerce.number().positive(),
  payment_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),method:z.string().min(1),
  status:z.literal('pending'),href:z.string().regex(/^\/(?!\/)/),
  snapshot:z.object({tenant_name:z.string(),property_name:z.string(),unit_label:z.string(),balance:z.coerce.number(),ledger_version:z.string().min(1)}),
});
const paymentResultSchema=z.object({
  confirmed:z.literal(true),status:z.literal('posted'),workspace_id:z.string().uuid(),payment_id:z.string().uuid(),
  tenant_id:z.string().uuid(),unit_id:z.string().uuid(),amount:z.coerce.number().positive(),
  payment_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),method:z.string().min(1),previous_balance:z.coerce.number(),balance:z.coerce.number(),
  record_version:z.string().min(1),href:z.string().url().startsWith('https://homes4rent.net/'),verified_at:z.string().datetime({offset:true}),
  proposal_id:z.string().uuid(),proposal_digest:z.string().regex(/^[a-f0-9]{64}$/),
});
const cancellationResultSchema=z.object({status:z.literal('cancelled'),confirmed:z.literal(false),proposal_id:z.string().uuid(),payment_id:z.null()});
const resolvedPaymentResultSchema=z.discriminatedUnion('confirmed',[paymentResultSchema,cancellationResultSchema]);
const pendingPaymentSchema=z.object({
  proposalId:z.string().uuid(),workspaceId:z.string().uuid(),status:z.literal('pending'),
  proposalVersion:z.number().int().positive().optional(),proposalDigest:z.string().regex(/^[a-f0-9]{64}$/).optional(),
  authorizationId:z.string().uuid().optional(),expiresAt:z.string().datetime({offset:true}).optional(),recordVersion:z.string().min(1).optional(),
});
const extraction=z.object({tenant_query:z.string().nullable(),amount:z.number().positive().nullable(),payment_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  method:z.enum(['cash','check','cash_app','bank_transfer','other']).nullable()});
type Input={tenantId:string;userId:string;email:string;threadId:string;command:string;canManageTenant:boolean};
type PendingPayment=z.infer<typeof pendingPaymentSchema>;
type RequiredScope='rent_payment:read'|'rent_payment:prepare'|'rent_payment:confirm'|'rent_payment:cancel';
type ActiveMapping={h4r_workspace_id:string;authorization_id:string|null;h4r_actor_user_id:string|null};
function ownerLinkUrl(workspaceId:string,input:Input){
  const appUrl=(env.FEROCITY_APP_URL??'https://ferocity.live').replace(/\/+$/,'');
  const body={contract_version:2,action:'authorize',workspace_id:workspaceId,ferocity_tenant_id:input.tenantId,ferocity_user_id:input.userId,
    payload:{return_url:`${appUrl}/app/ferocity`}};
  const timestamp=String(Math.floor(Date.now()/1000));const nonce=crypto.randomUUID();
  const signature=`sha256=${crypto.createHmac('sha256',env.H4R_SMS_BRIDGE_SECRET!).update(`${timestamp}.${nonce}.${JSON.stringify(body)}`).digest('hex')}`;
  const token=Buffer.from(JSON.stringify({body,timestamp,nonce,signature})).toString('base64url');
  return `https://homes4rent.net/connect?ferocity_owner_link=${token}`;
}
const dollars=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
function pendingFromProposal(proposal:z.infer<typeof proposalSchema>):PendingPayment{
  return {proposalId:proposal.id,workspaceId:proposal.workspace_id,status:'pending',proposalVersion:proposal.proposal_version,
    proposalDigest:proposal.proposal_digest,authorizationId:proposal.bridge_authorization_id,expiresAt:proposal.expires_at,recordVersion:proposal.record_version};
}
async function callH4r<T>(input:Input,binding:{workspaceId:string;authorizationId:string;h4rActorUserId?:string|null},action:string,scope:RequiredScope,resultSchema:z.ZodType<T>,payload:Record<string,unknown>={}){
  if(!env.H4R_CONTEXT_URL||!env.H4R_SMS_BRIDGE_SECRET)throw new Error('The H4R payment bridge is not configured.');
  const url=new URL(env.H4R_CONTEXT_URL);
  if(url.protocol!=='https:')throw new Error('H4R requires a secure bridge URL.');
  url.pathname=url.pathname.replace(/\/ferocity-brain-context\/?$/,'/ferocity-owner-payments');
  if(!url.pathname.endsWith('/ferocity-owner-payments'))throw new Error('The H4R bridge URL is invalid.');
  const body=JSON.stringify({contract_version:2,action,workspace_id:binding.workspaceId,ferocity_tenant_id:input.tenantId,
    ferocity_user_id:input.userId,authorization_id:binding.authorizationId,payload});
  const timestamp=String(Math.floor(Date.now()/1000));const nonce=crypto.randomUUID();
  const signature=crypto.createHmac('sha256',env.H4R_SMS_BRIDGE_SECRET).update(`${timestamp}.${nonce}.${body}`).digest('hex');
  const response=await fetch(url,{method:'POST',signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json',
    'x-h4r-timestamp':timestamp,'x-h4r-nonce':nonce,'x-h4r-signature':`sha256=${signature}`},body});
  const data=await response.json().catch(()=>null) as {ok?:boolean;contract_version?:unknown;error?:unknown;error_code?:unknown;result?:unknown;authorization?:unknown}|null;
  if(!response.ok||!data?.ok){
    const code=typeof data?.error_code==='string'?`${data.error_code}: `:'';
    throw new Error(`${code}${typeof data?.error==='string'?data.error:'H4R did not confirm the requested action.'}`);
  }
  if(data.contract_version!==2)throw new Error('H4R returned an unsupported protected-action contract version.');
  const proof=authorizationProofSchema.parse(data.authorization);
  if(proof.h4r_workspace_id!==binding.workspaceId||proof.ferocity_tenant_id!==input.tenantId||proof.ferocity_user_id!==input.userId||
    proof.authorization_id!==binding.authorizationId||(binding.h4rActorUserId&&proof.h4r_actor_user_id!==binding.h4rActorUserId)||!proof.scopes.includes(scope)){
    throw new Error('H4R returned an authorization proof for a different user, workspace, or permission.');
  }
  return {result:resultSchema.parse(data.result),authorization:proof};
}

export async function completeH4rOwnerPaymentAuthorization(input:{tenantId:string;userId:string;email:string;proofToken:string}){
  if(!/^[A-Za-z0-9_-]{20,20000}$/.test(input.proofToken))return {ok:false as const,message:'The H4R authorization response is invalid or too large.'};
  let decoded:unknown;
  try{
    const raw=Buffer.from(input.proofToken,'base64url').toString('utf8');
    if(!raw||Buffer.from(raw,'utf8').toString('base64url').replace(/=+$/,'')!==input.proofToken.replace(/=+$/,''))throw new Error('Invalid encoding');
    decoded=JSON.parse(raw);
  }catch{
    return {ok:false as const,message:'The H4R authorization response could not be read. Reconnect from H4R.'};
  }
  const envelope=browserAuthorizationEnvelopeSchema.safeParse(decoded);
  if(!envelope.success)return {ok:false as const,message:'H4R did not return a complete authorization proof.'};
  const browserProof=envelope.data.authorization;
  if(browserProof.ferocity_tenant_id!==input.tenantId||browserProof.ferocity_user_id!==input.userId){
    return {ok:false as const,message:'The H4R authorization belongs to a different Ferocity account or workspace.'};
  }
  const mapping=(await queryPostgres<{h4r_workspace_id:string}>(
    `select h4r_workspace_id::text from public.h4r_ferocity_bridge_workspaces
     where ferocity_tenant_id=$1 and h4r_workspace_id=$2 and status='active' limit 1`,
    [input.tenantId,browserProof.h4r_workspace_id]))?.rows[0];
  if(!mapping)return {ok:false as const,message:'That H4R workspace is not the active workspace connected to this Ferocity workspace.'};
  const verificationInput:Input={tenantId:input.tenantId,userId:input.userId,email:input.email,threadId:'h4r-authorization-verification',command:'',canManageTenant:true};
  try{
    const verified=await callH4r(verificationInput,{workspaceId:browserProof.h4r_workspace_id,authorizationId:browserProof.authorization_id,
      h4rActorUserId:browserProof.h4r_actor_user_id},'list','rent_payment:read',z.array(candidateSchema));
    const proof=verified.authorization;
    if(proof.authorized_at!==browserProof.authorized_at||proof.purpose!==browserProof.purpose){
      return {ok:false as const,message:'The H4R authorization changed before Ferocity could verify it. Reconnect from H4R.'};
    }
    const stored=await withPostgresTransaction(async client=>{
      const locked=await client.query<{id:string}>(
        `select id::text from public.h4r_ferocity_bridge_workspaces
         where ferocity_tenant_id=$1 and h4r_workspace_id=$2 and status='active' for update`,
        [input.tenantId,proof.h4r_workspace_id]);
      if(!locked.rows[0])return false;
      await client.query(
        `update public.h4r_ferocity_bridge_workspaces
         set metadata_json=coalesce(metadata_json,'{}'::jsonb)||$3::jsonb,updated_at=now()
         where id=$1 and ferocity_tenant_id=$2`,
        [locked.rows[0].id,input.tenantId,JSON.stringify({ownerPaymentAuthorizationId:proof.authorization_id,
          ownerPaymentH4rActorUserId:proof.h4r_actor_user_id,ownerPaymentAuthorizedAt:proof.authorized_at,
          ownerPaymentVerifiedAt:proof.verified_at,ownerPaymentScopes:proof.scopes})]);
      return true;
    });
    if(!stored)return {ok:false as const,message:'The H4R workspace connection changed before authorization could be saved.'};
    return {ok:true as const,message:'H4R received-payment access is connected to the verified signed-in workspace.'};
  }catch(error){
    return {ok:false as const,message:`H4R could not verify this authorization: ${error instanceof Error?error.message:'Unknown error'}`};
  }
}
export async function handleH4rOwnerPaymentChat(input:Input):Promise<{ok:boolean;message:string;threadId:string;intent:string;href?:string;actionLabel?:string}|null>{
  const last=(await queryPostgres<{id:string;user_id:string;detail_json:{h4rPayment?:unknown}}>(
    `select id,user_id,detail_json from public.ferocity_chat_messages where tenant_id=$1 and thread_id=$2 and role='ferocity' order by created_at desc limit 1`,
    [input.tenantId,input.threadId]))?.rows[0];
  let pending:PendingPayment|null=null;
  if(last?.user_id===input.userId){
    const parsedPending=pendingPaymentSchema.safeParse(last.detail_json?.h4rPayment);
    if(parsedPending.success)pending=parsedPending.data;
  }
  const affirmation=/^(yes|confirm|no|cancel)[.!]?$/i.test(input.command.trim());
  if(!pending&&/^\s*(show|list|what|who|when|why|how|check|review|did|has|is|are)\b/i.test(input.command))return null;
  let repreview=false;
  if(!pending&&affirmation){
    const prior=(await queryPostgres<{detail_json:{h4rPayment:unknown}}>(
      `select detail_json from public.ferocity_chat_messages where tenant_id=$1 and thread_id=$2 and user_id=$3 and role='ferocity' and detail_json#>>'{h4rPayment,status}'='pending' order by created_at desc limit 1`,[input.tenantId,input.threadId,input.userId]))?.rows[0];
    const parsedPrior=pendingPaymentSchema.safeParse(prior?.detail_json.h4rPayment);
    if(parsedPrior.success){pending=parsedPrior.data;repreview=true;}
  }
  if(!pending&&!(/\b(paid|received|payment)\b/i.test(input.command)&&/\b(h4r|homes4rent|rent|tenant)\b/i.test(input.command)))return null;
  if(!input.canManageTenant)return {ok:false,message:'Only a workspace owner or administrator can connect H4R or prepare and confirm H4R payment records.',threadId:input.threadId,intent:'h4r_payment'};
  let detail:Record<string,unknown>={};let message='';let ok=true;let href:string|undefined;let receipt:Record<string,unknown>|null=null;
  let resolvedState:string|null=null;
  try{
    const mappings=(await queryPostgres<ActiveMapping>(`select h4r_workspace_id::text,
      nullif(metadata_json->>'ownerPaymentAuthorizationId','') as authorization_id,
      nullif(metadata_json->>'ownerPaymentH4rActorUserId','') as h4r_actor_user_id
      from public.h4r_ferocity_bridge_workspaces where ferocity_tenant_id=$1 and status='active'`,[input.tenantId]))?.rows??[];
    if(!pending&&!mappings.length&&!/\b(rent|tenant|h4r|homes4rent)\b/i.test(input.command))return null;
    if(pending){
      const pendingWorkspace=pending.workspaceId;
      const mapping=mappings.find(candidate=>candidate.h4r_workspace_id===pendingWorkspace);
      if(!mapping)throw new Error('The H4R connection is no longer active.');
      if(!mapping.authorization_id)throw new Error('H4R_OWNER_LINK_REQUIRED: The signed-in H4R workspace has not approved received-payment access.');
      const binding={workspaceId:pendingWorkspace,authorizationId:mapping.authorization_id,h4rActorUserId:mapping.h4r_actor_user_id};
      const missingImmutableProof=!pending.proposalVersion||!pending.proposalDigest||!pending.authorizationId||!pending.expiresAt||!pending.recordVersion;
      if(repreview||missingImmutableProof){
        const recovered=await callH4r(input,binding,'recover','rent_payment:read',proposalSchema.nullable(),{thread_id:input.threadId});
        const r=recovered.result;
        if(!r)throw new Error('The H4R preview expired or no longer belongs to this signed-in H4R workspace. Prepare a new preview.');
        if(r.workspace_id!==pendingWorkspace||r.bridge_authorization_id!==recovered.authorization.authorization_id||r.created_by!==recovered.authorization.h4r_actor_user_id||r.source_thread_id!==input.threadId){
          throw new Error('H4R returned a proposal for a different workspace or authorization.');
        }
        pending=pendingFromProposal(r);
        message=`Recovered the pending H4R preview for ${r.snapshot.tenant_name}, ${r.snapshot.property_name} / ${r.snapshot.unit_label}: ${dollars(r.amount)} on ${r.payment_date} via ${r.method}. Balance ${dollars(r.snapshot.balance)} -> ${dollars(r.snapshot.balance-r.amount)}. Reply Yes to this preview or No to cancel.`;
        detail={h4rPayment:pending};
      }
      else if(!affirmation){message='Please reply Yes to confirm the displayed H4R payment, or No to cancel it first.';detail={h4rPayment:pending};}
      else{
        const confirmed=/^(yes|confirm)/i.test(input.command.trim());
        const idempotencyKey=`h4r-payment:${pending.workspaceId}:${pending.proposalId}:${pending.proposalDigest}`;
        assertCompanionActionPermitted({productKey:'h4r',actionKey:'record_owner_confirmed_payment',requestedMode:'execute',idempotencyKey,approvalGatePresent:true,authoritativeVerificationPresent:true,systemWorkflow:true});
        const confirmedResponse=await callH4r(input,binding,confirmed?'confirm':'cancel',confirmed?'rent_payment:confirm':'rent_payment:cancel',resolvedPaymentResultSchema,
          {thread_id:input.threadId,proposal_id:pending.proposalId,proposal_version:pending.proposalVersion,
            proposal_digest:pending.proposalDigest,record_version:pending.recordVersion});
        const result=confirmedResponse.result;
        if(confirmed&&('workspace_id' in result)&&(result.workspace_id!==pendingWorkspace||result.proposal_id!==pending.proposalId||result.proposal_digest!==pending.proposalDigest)){
          throw new Error('H4R confirmed a different workspace or proposal than the approved preview.');
        }
        if(result.proposal_id!==pending.proposalId)throw new Error('H4R resolved a different proposal than the approved preview.');
        message=result.confirmed?`Recorded ${dollars(result.amount)} in H4R. Current unit balance: ${dollars(result.balance)}. Payment reference: ${result.payment_id}. Open ${result.href}`:'Cancelled. No payment was recorded.';
        resolvedState=result.confirmed?'confirmed':'cancelled';
        if(result.confirmed){href=result.href;receipt={payment_id:result.payment_id,tenant_id:result.tenant_id,unit_id:result.unit_id,
          amount:result.amount,payment_date:result.payment_date,method:result.method,previous_balance:result.previous_balance,balance:result.balance,
          href,status:'completed',h4r_workspace_id:result.workspace_id,authorization_id:confirmedResponse.authorization.authorization_id,
          record_version:result.record_version,verified_at:result.verified_at,idempotency_key:idempotencyKey};}
      }
    }else{
      if(mappings.length!==1)throw new Error(mappings.length?'More than one H4R workspace is connected. Open the connector while signed into H4R and select the intended H4R workspace before preparing this payment.':'No active H4R payment connection exists for this workspace.');
      if(!mappings[0].authorization_id)throw new Error('H4R_OWNER_LINK_REQUIRED: The signed-in H4R workspace has not approved received-payment access.');
      const binding={workspaceId:mappings[0].h4r_workspace_id,authorizationId:mappings[0].authorization_id,h4rActorUserId:mappings[0].h4r_actor_user_id};
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const raw=await generateJsonWithAiService({tenantId:input.tenantId,userId:input.userId,featureKey:'ai_generation',runType:'h4r_owner_payment_interpretation',temperature:0,
        system:`Extract only an already received manual rent payment. Return JSON {tenant_query:string|null,amount:number|null,payment_date:string|null,method:string|null}. Questions about payments are not received-payment instructions: use null amount. Never extract a promise, future payment, charge, or pending ACH/Stripe transaction as received. Never invent details. Date YYYY-MM-DD defaults today ${today}; method is cash, check, cash_app, bank_transfer, other or null.`,
        user:input.command,fallback:{tenant_query:null,amount:null,payment_date:null,method:null}});
      const parsed=extraction.parse(raw);
      if(!parsed.tenant_query||!parsed.amount||!parsed.method||!parsed.payment_date){message='Tell me the tenant or address, amount received, payment date, and method together. I will show the exact H4R entry before you confirm.';}
      else{
        const listed=await callH4r(input,binding,'list','rent_payment:read',z.array(candidateSchema));
        const all=listed.result;
        const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ');
        const tokens=normalize(parsed.tenant_query);
        const matches=all.filter(c=>tokens.every(t=>normalize(`${c.tenant_name} ${c.property_name} ${c.unit_label}`).includes(t)));
        if(matches.length!==1){message=matches.length?`Several tenants match. Resend the payment with the exact name and address:\n${matches.map(c=>`${c.tenant_name} - ${c.property_name} / ${c.unit_label}`).join('\n')}`:'No active tenant matches that name or address in the connected H4R workspace.';}
        else{
          const prepared=await callH4r(input,binding,'prepare','rent_payment:prepare',proposalSchema,
            {thread_id:input.threadId,tenant_id:matches[0].tenant_id,amount:parsed.amount,payment_date:parsed.payment_date,method:parsed.method,note:input.command});
          const r=prepared.result;
          if(r.workspace_id!==mappings[0].h4r_workspace_id||r.bridge_authorization_id!==prepared.authorization.authorization_id||r.created_by!==prepared.authorization.h4r_actor_user_id||r.source_thread_id!==input.threadId){
            throw new Error('H4R prepared the payment under a different workspace or signed-in user.');
          }
          detail={h4rPayment:pendingFromProposal(r)};
          message=`Record this received payment in H4R?\nTenant: ${r.snapshot.tenant_name}\nProperty: ${r.snapshot.property_name}\nUnit: ${r.snapshot.unit_label}\nPayment: ${dollars(r.amount)}\nDate: ${r.payment_date}\nMethod: ${r.method}\nCurrent balance: ${dollars(r.snapshot.balance)}\nResulting balance: ${dollars(r.snapshot.balance-r.amount)}\nThis records a posted payment; it does not debit a bank account. Reply Yes to record this exact entry or No to cancel. The preview expires in 15 minutes.`;
        }
      }
    }
  }catch(error){ok=false;message=`H4R payment action could not complete: ${error instanceof Error?error.message:'Unknown error'}. Check the ledger before retrying a timed-out confirmation.`;if(pending)detail={h4rPayment:pending};
    if(message.includes('H4R_OWNER_LINK_REQUIRED')&&env.H4R_SMS_BRIDGE_SECRET){
      const mapping=(await queryPostgres<{h4r_workspace_id:string}>(`select h4r_workspace_id::text from public.h4r_ferocity_bridge_workspaces where ferocity_tenant_id=$1 and status='active'`,[input.tenantId]))?.rows??[];
      if(mapping.length===1){href=ownerLinkUrl(mapping[0].h4r_workspace_id,input);message='Sign into H4R, select the intended H4R workspace, and approve this exact Ferocity connection. H4R will reject a different workspace or unauthorized membership. Then repeat the request. The connection link expires in five minutes.';}
    }
  }
  const saved=await withPostgresTransaction(async client=>{
    if(resolvedState&&pending)await client.query(`update public.ferocity_chat_messages set detail_json=jsonb_set(detail_json,'{h4rPayment,status}',to_jsonb($5::text)) where tenant_id=$1 and thread_id=$2 and user_id=$3 and detail_json#>>'{h4rPayment,proposalId}'=$4`,[input.tenantId,input.threadId,input.userId,pending.proposalId,resolvedState]);
    await client.query(`insert into public.ferocity_chat_messages(tenant_id,thread_id,user_id,role,body,status,detail_json) values($1,$2,$3,'owner',$4,'completed','{}'),($1,$2,$3,'ferocity',$5,$6,$7::jsonb)`,[input.tenantId,input.threadId,input.userId,input.command,message,ok?'completed':'needs_attention',JSON.stringify(detail)]);
    await client.query('update public.ferocity_chat_threads set updated_at=now() where id=$1 and tenant_id=$2',[input.threadId,input.tenantId]);
    if(receipt)await client.query(`insert into public.ferocity_chat_action_receipts(tenant_id,thread_id,receipt_kind,title,summary,status,href,target_table,target_id,evidence_json) values($1,$2,'result','H4R received payment',$3,'completed',$4,'h4r.payments',$5,$6::jsonb)`,[input.tenantId,input.threadId,message,href,receipt.payment_id,JSON.stringify(receipt)]);
    return true;
  });
  if(!saved)return {ok:false,message:'The H4R request may have completed, but Ferocity could not save its receipt. Check the H4R ledger before retrying.',threadId:input.threadId,intent:'h4r_payment'};
  return {ok,message,threadId:input.threadId,intent:'h4r_payment',...(href?{href,actionLabel:receipt?'Open H4R ledger':'Connect H4R owner chat'}:{})};
}

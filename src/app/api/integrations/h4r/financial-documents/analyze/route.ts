import crypto from 'node:crypto';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {queryPostgres} from '@/lib/db/postgres';
import {env} from '@/lib/env';
import {claimH4rBridgeNonce,verifyH4rSignedRequest} from '@/lib/integrations/h4r/request-auth';
import {allowedH4rFinancialUrl,analyzeH4rFinancialDocument} from '@/lib/document-intelligence/h4r-financial-analysis';
import {assertCompanionActionPermitted} from '@/lib/integrations/companion-product-contract';
export const maxDuration=300;
const limit=15*1024*1024;
const schema=z.object({workspace_id:z.string().uuid(),document_id:z.string().uuid(),file_name:z.string().min(1).max(240),mime_type:z.enum(['application/pdf','image/jpeg','image/png','image/webp','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),byte_count:z.number().int().min(1).max(limit),sha256:z.string().regex(/^[a-f0-9]{64}$/),download_url:z.string().url().max(4000)});
export async function POST(request:Request){
 const raw=await request.text();if(raw.length>12000)return NextResponse.json({error:'Request too large.'},{status:413});
 const verified=verifyH4rSignedRequest(request,raw);if(!verified.ok)return NextResponse.json({error:verified.error},{status:verified.status});
 if(!await claimH4rBridgeNonce(verified.nonce))return NextResponse.json({error:'Duplicate nonce.'},{status:409});
 let input:z.infer<typeof schema>;try{input=schema.parse(JSON.parse(raw));}catch{return NextResponse.json({error:'Invalid financial document request.'},{status:400});}
 assertCompanionActionPermitted({productKey:'h4r',actionKey:'analyze_financial_document',requestedMode:'prepare',idempotencyKey:`${input.workspace_id}:${input.document_id}:${input.sha256}`,approvalGatePresent:true});
 if(!allowedH4rFinancialUrl(input.download_url,env.H4R_DOCUMENT_ORIGIN))return NextResponse.json({error:'H4R private source origin is not authorized.'},{status:403});
 const mapping=(await queryPostgres<{ferocity_tenant_id:string}>("select ferocity_tenant_id from h4r_ferocity_bridge_workspaces where h4r_workspace_id=$1 and status in ('shadow','review','active')",[input.workspace_id]))?.rows[0];
 if(!mapping)return NextResponse.json({error:'Workspace is not authorized for document analysis.'},{status:403});
 const params=[mapping.ferocity_tenant_id,input.workspace_id,input.document_id,input.sha256];
 const cached=(await queryPostgres<{id:string;status:string;result_json:unknown;updated_at:string}>('select id,status,result_json,updated_at from h4r_financial_document_analyses where tenant_id=$1 and h4r_workspace_id=$2 and h4r_document_id=$3 and source_sha256=$4',params))?.rows[0];
 if(cached?.status==='needs_review')return NextResponse.json({ok:true,reused_existing:true,analysis_id:cached.id,...cached.result_json as object});
 const claimed=(await queryPostgres<{id:string}>(`insert into h4r_financial_document_analyses(tenant_id,h4r_workspace_id,h4r_document_id,source_sha256) values($1,$2,$3,$4)
 on conflict(tenant_id,h4r_workspace_id,h4r_document_id,source_sha256) do update set status='processing',updated_at=now(),processing_error=null
 where h4r_financial_document_analyses.status='failed' or (h4r_financial_document_analyses.status='processing' and h4r_financial_document_analyses.updated_at<now()-interval '10 minutes') returning id`,params))?.rows[0];
 if(!claimed)return NextResponse.json({error:'Document analysis is already processing. Retry after it finishes.'},{status:409});
 try{
  const response=await fetch(input.download_url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok||!response.body)throw new Error('Original file could not be read.');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new Error('Source exceeds 15 MB.');}chunks.push(value);}
  const bytes=Buffer.concat(chunks);if(bytes.length!==input.byte_count||crypto.createHash('sha256').update(bytes).digest('hex')!==input.sha256)throw new Error('Original size or checksum differs.');
  const result=await analyzeH4rFinancialDocument({tenantId:mapping.ferocity_tenant_id,fileName:input.file_name,mimeType:input.mime_type,bytes});
  await queryPostgres("update h4r_financial_document_analyses set status='needs_review',result_json=$2::jsonb,updated_at=now() where id=$1",[claimed.id,JSON.stringify(result)]);
  return NextResponse.json({ok:true,analysis_id:claimed.id,...result});
 }catch{
  // Raw errors can contain source URLs or private model text. Store only a
  // bounded public failure reason, never capability URLs or source bytes.
  const error='Financial document analysis failed. Original retained; review required.';
  await queryPostgres("update h4r_financial_document_analyses set status='failed',processing_error=$2,updated_at=now() where id=$1",[claimed.id,error]);
  return NextResponse.json({error},{status:422});
 }
}

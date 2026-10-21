import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/db/postgres',()=>({queryPostgres:mocks.query,withPostgresTransaction:async(fn:(client:{query:typeof mocks.query})=>Promise<unknown>)=>fn({query:mocks.query})}));
vi.mock('@/lib/ai/ai-service',()=>({generateJsonWithAiService:vi.fn()}));
vi.mock('@/lib/env',()=>({env:{H4R_CONTEXT_URL:'https://example.supabase.co/functions/v1/ferocity-brain-context',H4R_SMS_BRIDGE_SECRET:'test-secret-which-is-long-enough',OPENAI_API_KEY:'test-api-key'}}));
import { completeH4rOwnerPaymentAuthorization, handleH4rOwnerPaymentChat } from './owner-payments';
const input={tenantId:'11111111-1111-4111-8111-111111111111',userId:'owner',email:'owner@example.com',threadId:'thread',command:'Yes',canManageTenant:true};
const workspace='22222222-2222-4222-8222-222222222222';
const proposal='33333333-3333-4333-8333-333333333333';
const payment='44444444-4444-4444-8444-444444444444';
const authorization='55555555-5555-4555-8555-555555555555';
const h4rUser='66666666-6666-4666-8666-666666666666';
const proof={h4r_workspace_id:workspace,ferocity_tenant_id:input.tenantId,ferocity_user_id:input.userId,
  authorization_id:authorization,h4r_actor_user_id:h4rUser,verified_at:'2026-10-15T12:00:00Z',authorized_at:'2026-10-15T11:00:00Z',
  purpose:'owner_received_rent_payments',scopes:['rent_payment:read','rent_payment:prepare','rent_payment:confirm','rent_payment:cancel']};
const pending={proposalId:proposal,workspaceId:workspace,status:'pending',proposalVersion:2,
  proposalDigest:'a'.repeat(64),authorizationId:authorization,expiresAt:'2026-10-15T12:15:00Z',recordVersion:'ledger:8'};
const authorizationToken=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
describe('H4R owner payment chat',()=>{
  beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('fetch',mocks.fetch);});
  it('does not route unrelated chat to H4R',async()=>{
    mocks.query.mockResolvedValue({rows:[]});
    expect(await handleH4rOwnerPaymentChat({...input,command:'How is marketing doing?'})).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('does not allow a non-admin chat user to prepare or confirm H4R payments',async()=>{
    mocks.query.mockResolvedValueOnce({rows:[]});
    const result=await handleH4rOwnerPaymentChat({...input,command:'Tenant paid H4R rent today',canManageTenant:false});
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain('workspace owner or administrator');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('cannot confirm another users proposal',async()=>{
    mocks.query.mockResolvedValueOnce({rows:[{id:'message',user_id:'different-user',detail_json:{h4rPayment:{proposalId:proposal,workspaceId:workspace,status:'pending'}}}]});
    expect(await handleH4rOwnerPaymentChat(input)).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('does not intercept unrelated invoice payments or read-only rent questions',async()=>{
    mocks.query.mockResolvedValue({rows:[]});
    expect(await handleH4rOwnerPaymentChat({...input,command:'The contractor invoice was paid $100'})).toBeNull();
    expect(await handleH4rOwnerPaymentChat({...input,command:'Show the tenant payment history'})).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('uses the saved proposal and session email for explicit confirmation',async()=>{
    mocks.query.mockResolvedValueOnce({rows:[{id:'message',user_id:input.userId,detail_json:{h4rPayment:pending}}]})
      .mockResolvedValueOnce({rows:[{h4r_workspace_id:workspace,authorization_id:authorization,h4r_actor_user_id:h4rUser}]}).mockResolvedValue({rows:[]});
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ok:true,contract_version:2,authorization:proof,result:{confirmed:true,workspace_id:workspace,
      payment_id:payment,tenant_id:'77777777-7777-4777-8777-777777777777',unit_id:'88888888-8888-4888-8888-888888888888',amount:20,
      payment_date:'2026-10-15',method:'cash',previous_balance:120,balance:100,status:'posted',record_version:'ledger:9',
      href:'https://homes4rent.net/app/?unit_id=test',verified_at:'2026-10-15T12:01:00Z',proposal_id:proposal,proposal_digest:'a'.repeat(64)}})));
    const result=await handleH4rOwnerPaymentChat(input);
    expect(result?.ok).toBe(true);
    const [url,options]=mocks.fetch.mock.calls[0];
    expect(String(url)).toContain('/ferocity-owner-payments');
    expect(JSON.parse(options.body)).toEqual({contract_version:2,action:'confirm',workspace_id:workspace,ferocity_tenant_id:input.tenantId,
      ferocity_user_id:input.userId,authorization_id:authorization,payload:{thread_id:input.threadId,proposal_id:proposal,
        proposal_version:2,proposal_digest:'a'.repeat(64),record_version:'ledger:8'}});
    expect(options.headers['x-h4r-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
  it('refuses a yes after the workspace mapping was removed',async()=>{
    mocks.query.mockResolvedValueOnce({rows:[{id:'message',user_id:input.userId,detail_json:{h4rPayment:pending}}]})
      .mockResolvedValueOnce({rows:[]}).mockResolvedValue({rows:[]});
    expect((await handleH4rOwnerPaymentChat(input))?.ok).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('fails closed when H4R verifies a different workspace',async()=>{
    mocks.query.mockResolvedValueOnce({rows:[{id:'message',user_id:input.userId,detail_json:{h4rPayment:pending}}]})
      .mockResolvedValueOnce({rows:[{h4r_workspace_id:workspace,authorization_id:authorization,h4r_actor_user_id:h4rUser}]}).mockResolvedValue({rows:[]});
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ok:true,contract_version:2,authorization:{...proof,h4r_workspace_id:'77777777-7777-4777-8777-777777777777'},
      result:{confirmed:true,workspace_id:workspace,payment_id:payment,tenant_id:'77777777-7777-4777-8777-777777777777',
        unit_id:'88888888-8888-4888-8888-888888888888',amount:20,payment_date:'2026-10-15',method:'cash',previous_balance:120,
        balance:100,status:'posted',record_version:'ledger:9',href:'https://homes4rent.net/app/?unit_id=test',verified_at:'2026-10-15T12:01:00Z',
        proposal_id:proposal,proposal_digest:'a'.repeat(64)}})));
    const result=await handleH4rOwnerPaymentChat(input);
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain('different user, workspace, or permission');
  });
  it('recovers legacy previews and requires a fresh confirmation',async()=>{
    mocks.query.mockResolvedValueOnce({rows:[{id:'message',user_id:input.userId,detail_json:{h4rPayment:{proposalId:proposal,workspaceId:workspace,status:'pending'}}}]})
      .mockResolvedValueOnce({rows:[{h4r_workspace_id:workspace,authorization_id:authorization,h4r_actor_user_id:h4rUser}]}).mockResolvedValue({rows:[]});
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ok:true,contract_version:2,authorization:proof,result:{id:proposal,workspace_id:workspace,
      bridge_authorization_id:authorization,created_by:h4rUser,source_thread_id:input.threadId,proposal_version:2,proposal_digest:'a'.repeat(64),
      expires_at:'2026-10-15T12:15:00Z',record_version:'ledger:8',amount:20,payment_date:'2026-10-15',method:'cash',status:'pending',
      href:'/app/?unit_id=test',snapshot:{tenant_name:'Tenant',property_name:'Property',unit_label:'1',balance:120,ledger_version:'ledger:8'}}})));
    const result=await handleH4rOwnerPaymentChat(input);
    expect(result?.ok).toBe(true);
    expect(result?.message).toContain('Reply Yes to this preview');
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).action).toBe('recover');
  });
  it('does not trust a browser authorization proof for another Ferocity workspace',async()=>{
    const token=authorizationToken({ok:true,contract_version:2,authorization:{...proof,ferocity_tenant_id:'99999999-9999-4999-8999-999999999999'},result:{linked:true}});
    const result=await completeH4rOwnerPaymentAuthorization({tenantId:input.tenantId,userId:input.userId,email:input.email,proofToken:token});
    expect(result.ok).toBe(false);
    expect(result.message).toContain('different Ferocity account or workspace');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('persists a binding only after a fresh signed H4R verification',async()=>{
    const token=authorizationToken({ok:true,contract_version:2,authorization:proof,result:{linked:true}});
    mocks.query.mockResolvedValueOnce({rows:[{h4r_workspace_id:workspace}]})
      .mockResolvedValueOnce({rows:[{id:'mapping-id'}]}).mockResolvedValueOnce({rows:[]});
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ok:true,contract_version:2,authorization:proof,result:[]})));
    const result=await completeH4rOwnerPaymentAuthorization({tenantId:input.tenantId,userId:input.userId,email:input.email,proofToken:token});
    expect(result.ok).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    const request=JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(request).toMatchObject({contract_version:2,action:'list',workspace_id:workspace,
      ferocity_tenant_id:input.tenantId,ferocity_user_id:input.userId,authorization_id:authorization,payload:{}});
    expect(mocks.query.mock.calls.some(([,parameters])=>String(parameters?.[2]).includes('ownerPaymentAuthorizationId')&&String(parameters?.[2]).includes(authorization))).toBe(true);
  });
});

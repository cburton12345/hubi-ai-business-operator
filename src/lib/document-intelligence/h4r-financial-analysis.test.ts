import {describe,it,expect,vi} from 'vitest';
vi.mock('./extract',()=>({extractExpenseDocument:vi.fn()}));
vi.mock('./structured-file',()=>({extractStructuredFileText:vi.fn()}));
vi.mock('@/lib/ai/model-routing',()=>({independentReviewerConfigured:vi.fn()}));
import {allowedH4rFinancialUrl} from './h4r-financial-analysis';
describe('H4R financial origin boundary',()=>{
 const origin='https://project.supabase.co';
 it('accepts only the exact private financial source bucket',()=>{
  expect(allowedH4rFinancialUrl(`${origin}/storage/v1/object/sign/h4r-financial-documents/w/d/source?token=abc`,origin)).toBe(true);
  for(const url of ['http://project.supabase.co/storage/v1/object/sign/h4r-financial-documents/a',`${origin}/storage/v1/object/public/h4r-financial-documents/a`,`${origin}/storage/v1/object/sign/h4r-documents/a`,'https://evil.test/storage/v1/object/sign/h4r-financial-documents/a'])expect(allowedH4rFinancialUrl(url,origin)).toBe(false);
  expect(allowedH4rFinancialUrl(`${origin}/storage/v1/object/sign/h4r-financial-documents/a`,undefined)).toBe(false);
 });
});

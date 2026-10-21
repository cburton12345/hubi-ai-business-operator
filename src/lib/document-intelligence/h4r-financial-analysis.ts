import { extractExpenseDocument } from './extract';
import { extractStructuredFileText } from './structured-file';
import { independentReviewerConfigured } from '@/lib/ai/model-routing';
import { compareDocumentExtractions, hasUsableDocumentExtraction } from './independent-review';

export function allowedH4rFinancialUrl(value:string,origin:string|undefined){
 if(!origin)return false;
 try{const url=new URL(value);return url.protocol==='https:'&&url.origin===new URL(origin).origin&&url.pathname.startsWith('/storage/v1/object/sign/h4r-financial-documents/')&&!url.username&&!url.password;}catch{return false;}
}
export async function analyzeH4rFinancialDocument(input:{tenantId:string;fileName:string;mimeType:string;bytes:Uint8Array}){
 const imageUrl=input.mimeType.startsWith('image/')?`data:${input.mimeType};base64,${Buffer.from(input.bytes).toString('base64')}`:null;
 const structuredText=await extractStructuredFileText({fileName:input.fileName,bytes:input.bytes});
 const source={workspaceId:input.tenantId,fileName:input.fileName,mimeType:input.mimeType,fileBytes:input.bytes,imageUrl,suppliedText:structuredText};
 const primary=await extractExpenseDocument(source);
 const requestType=input.mimeType==='application/pdf'||imageUrl?'vision_json' as const:'json' as const;
 const available=primary.extractionMethod!=='deterministic_cash_app'&&independentReviewerConfigured({primaryRunType:requestType==='vision_json'?'expense_document_extraction':'expense_document_text_extraction',requestType});
 const reviewer=hasUsableDocumentExtraction(primary)&&available?await extractExpenseDocument({...source,reviewPass:true}):null;
 const review=compareDocumentExtractions(primary,reviewer);
 return {mode:'review_only' as const,primary,independent_review:{...review,humanReviewRequired:true},warnings:['Original files remain authoritative.','No expense, tenant payment, property assignment or tax determination was posted.']};
}

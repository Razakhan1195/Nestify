import {authenticateMobileRequest} from '@/lib/supabase/mobile';
import {loadBillReview} from '@/lib/product/connected-bill-review';
import {readMobileMultipart,mobileUploadFile,SCAN_MIME_TYPES,UploadError} from '@/lib/uploads/mobile-upload';
import {reserveAiRequest} from '@/lib/ai/reservation';
import {checkAiRateLimit} from '@/lib/ai/rate-limit';
import {extractWrittenOffer} from '@/lib/ai/offer-reading';
import {isTelecomCategory} from '../../../../../../../../../apps/mobile/src/lib/bill-review';
export const maxDuration=60;
export const dynamic='force-dynamic';
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await authenticateMobileRequest(request);if(auth.error)return reply({error:auth.error.message},auth.error.status);
 const {id}=await params;if(!/^[a-f0-9-]{36}$/i.test(id))return reply({error:'Choose a saved bill.'},400);
 const home=await auth.supabase.from('homes').select('id').eq('user_id',auth.user.id).order('created_at').limit(1).maybeSingle();if(home.error||!home.data)return reply({error:'Could not verify your home.'},409);
 const state=await loadBillReview({supabase:auth.supabase,userId:auth.user.id,homeId:home.data.id},id);if('error'in state)return reply({error:state.error},state.status);
 if('readOnly'in state.payload&&state.payload.readOnly)return reply({error:'This changed bill is available to read only.'},409);
 if(!isTelecomCategory(state.payload.category))return reply({error:'Use a saved internet or mobile bill for this comparison.'},400);
 let input:Parameters<typeof extractWrittenOffer>[0];
 try{
  const form=await readMobileMultipart(request);
  if(form.getAll('consent').length!==1||form.get('consent')!=='true')throw new UploadError('Confirm that Rezlee can read this offer with AI.');
  const text=form.get('text');if(form.getAll('text').length>1||text!==null&&typeof text!=='string')throw new UploadError('Use one offer at a time.');
  const file=await mobileUploadFile(form,SCAN_MIME_TYPES,false);
  if(file&&typeof text==='string'&&text.trim()||!file&&!(typeof text==='string'&&text.trim()))throw new UploadError('Choose a file or paste one offer.');
  if(file)input={file:{data:Buffer.from(await file.arrayBuffer()).toString('base64'),mediaType:file.type,filename:file.name.slice(0,250)},name:file.name.slice(0,250)};
  else{if((text as string).length>12000)throw new UploadError('Keep the offer text under 12,000 characters.');input={text:(text as string).trim(),name:'Pasted offer'};}
 }catch(e){return reply({error:e instanceof UploadError?e.message:'Could not read this offer. Your entered details are kept.'},e instanceof UploadError?e.status:400);}
 if(!checkAiRateLimit(auth.user.id).allowed)return reply({error:'The reading limit has been reached. You can enter the terms yourself.'},429);
 const reservation=await reserveAiRequest(auth.supabase,undefined,'assistant');if(!reservation.ok)return reply({error:reservation.message},reservation.status);
 try{return reply({reading:await extractWrittenOffer(input)});}
 catch{await reservation.release?.().catch(()=>console.warn('[offer-reading] allowance recovery needed'));return reply({error:'Could not read the offer. Your details are kept. Try again when ready or enter the terms yourself.'},502);}
}

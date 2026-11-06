import {offerReadingSchema,OFFER_INSTRUCTION,verifyOfferReading} from './offer-evidence';
import {generateText,Output} from 'ai';
import {budgetedModel} from './spend';
import {AI_MODELS} from './models';
import type {AiFilePart} from './extraction';
export async function extractWrittenOffer(input:{file?:AiFilePart;text?:string;name:string}){
 const {output}=await generateText({model:budgetedModel(AI_MODELS.vision,'document'),system:OFFER_INSTRUCTION,
 messages:[{role:'user',content:input.file?[{type:'file',...input.file}]:[{type:'text',text:input.text??''}]}],output:Output.object({schema:offerReadingSchema}),maxRetries:0,maxOutputTokens:3500,abortSignal:AbortSignal.timeout(45000)});
 return verifyOfferReading(output,{kind:input.file?'file':'text',name:input.name},input.file?undefined:input.text);
}

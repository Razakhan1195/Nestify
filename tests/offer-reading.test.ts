import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeOfferReading,parseOfferReading,validOfferSources,type OfferReading} from '../apps/mobile/src/lib/offer-reading';
import {offerDefaults,priceWrittenOffer} from '../apps/mobile/src/lib/bill-review';
const reading:OfferReading={currency:'CAD',source:{kind:'text',name:'Pasted offer'},facts:[{key:'monthly',value:'40',excerpt:'CAD $40 per month for 6 months',page:null},{key:'promoMonths',value:'6',excerpt:'CAD $40 per month for 6 months',page:null}],notes:['Setup fees and price afterward were not stated.']};
test('offer suggestions retain customer edits and never invent absent fees or comparison horizon',()=>{
 const actual=mergeOfferReading({...offerDefaults,monthly:'55',months:'24'},reading);
 assert.equal(actual.monthly,'55');assert.equal(actual.promoMonths,'6');assert.equal(actual.months,'24');assert.equal(actual.upfront,'');assert.equal(actual.exitFee,'');assert.equal(actual.credit,'');assert.equal(actual.afterPromo,'');assert.equal(priceWrittenOffer(actual),null);
});
test('unconfirmed or other currency cannot enter a CAD comparison',()=>{for(const currency of ['other','unknown']as const)assert.deepEqual(mergeOfferReading(offerDefaults,{...reading,currency}),offerDefaults);});
test('source validation rejects duplicate fields, invalid money, unsupported keys and oversized passages',()=>{
 assert.ok(parseOfferReading(reading));
 for(const facts of [[reading.facts[0],reading.facts[0]],[{...reading.facts[0],value:'-10'}],[{...reading.facts[0],value:'Infinity'}],[{...reading.facts[0],key:'months'}],[{...reading.facts[0],excerpt:'x'.repeat(801)}],[{...reading.facts[1],value:'100'}]])assert.equal(parseOfferReading({...reading,facts}),null);
 assert.equal(validOfferSources([reading,null]),true);assert.equal(validOfferSources([reading]),false);
});

import {verifyOfferReading} from '../src/lib/ai/offer-evidence';
test('pasted source must contain the exact quote and numeric token; unsupported facts are withheld',()=>{
 const source='CAD $40 monthly for 6 months; then CAD $70 monthly.';
 const output={currency:'CAD',facts:[{key:'monthly',value:'40',excerpt:'CAD $40 monthly for 6 months',page:null},{key:'afterPromo',value:'7',excerpt:'then CAD $70 monthly.',page:null},{key:'upfront',value:'0',excerpt:'No setup fee: 0',page:null}],notes:[]};
 const actual=verifyOfferReading(output,{kind:'text',name:'Pasted offer'},source);
 assert.equal(actual.facts.length,1);assert.equal(actual.facts[0].value,'40');assert.match(actual.notes[0],/left out/);
});

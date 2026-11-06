import test from 'node:test';import assert from 'node:assert/strict';
import {preparePhoto,photoResize,PHOTO_TARGET_BYTES} from '../apps/mobile/src/lib/photo-preparation-core';
test('large phone photos resize proportionally without cropping or changing the original',async()=>{
 const input={uri:'file://original.heic',name:'receipt.HEIC',type:'image/heic',size:14_000_000,width:4032,height:6048};let attempts=0;
 const out=await preparePhoto(input,async(_,size,q)=>{attempts++;assert(size.height<=2800);assert(q>=.72);return {uri:'file://prepared.jpg',size:attempts===1?4_100_000:2_100_000};});
 assert.equal(attempts,2);assert.equal(out.type,'image/jpeg');assert.equal(out.name,'receipt.jpg');assert(out.size!<PHOTO_TARGET_BYTES);assert.equal(input.uri,'file://original.heic');
});
test('small photos never upscale and PDFs pass through without image encoding',async()=>{
 assert.deepEqual(photoResize(800,1200,2800),{width:800,height:1200});
 const p={uri:'file://statement.pdf',name:'statement.pdf',type:'application/pdf',size:100};
 assert.equal(await preparePhoto(p,async()=>{throw Error('must not encode PDF')}),p);
});
test('invalid dimensions and persistently oversized photos fail with a useful recovery',async()=>{
 assert.throws(()=>photoResize(0,100,2800));let attempts=0;
 await assert.rejects(()=>preparePhoto({uri:'x',name:'x.png',type:'image/png',width:4000,height:3000},async()=>{attempts++;return {uri:'y',size:8_000_000};}),/Retake/);assert.equal(attempts,3);
});

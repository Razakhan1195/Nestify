import test from 'node:test';
import assert from 'node:assert/strict';
import {referralInvitationUrl} from '../src/lib/membership/referral-link';
const staging='https://gjwvalpxnfbvryosmcbj.supabase.co',production='https://eynbuhmtxkigvqoewbwi.supabase.co';
test('referral links stay with their originating account environment',()=>{
 assert.equal(referralInvitationUrl('a1b2c3d4e5f6','https://staging.rezlee.com',staging),'https://staging.rezlee.com/invite/A1B2C3D4E5F6');
 assert.equal(referralInvitationUrl('a1b2c3d4e5f6','https://rezlee.com',production),'https://rezlee.com/invite/A1B2C3D4E5F6');
});
test('wrong or missing environment never sends a staging recipient to production',()=>{
 for(const [app,db] of [['https://rezlee.com',staging],['https://staging.rezlee.com',production],[undefined,staging],['https://rezlee.com',undefined],['https://untrusted.invalid',staging]])assert.throws(()=>referralInvitationUrl('A1B2C3D4E5F6',app,db));
});
test('invalid referral codes cannot become invitation paths',()=>{
 for(const code of [null,'','ABC','../membership','A1B2C3D4E5F6?redirect=elsewhere'])assert.throws(()=>referralInvitationUrl(code,'https://staging.rezlee.com',staging));
});

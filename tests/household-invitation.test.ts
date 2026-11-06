import test from "node:test";
import assert from "node:assert/strict";
import { invitationExpired, invitationNeedsPassword, validInvitationLink } from "../src/lib/household/invitation";
const member="11111111-1111-4111-8111-111111111111";
test("invitation links accept only bounded expected token, member and verification type",()=>{
 assert.equal(validInvitationLink(member,"a".repeat(64),"invite"),true);
 for(const row of [[member,"<script>","invite"],[member,"a".repeat(513),"invite"],[member,"a".repeat(64),"recovery"],["wrong","a".repeat(64),"magiclink"]])assert.equal(validInvitationLink(...row as [string,string,string]),false);
});
test("new-user password setup is tied to this invitation, not a hidden form field",()=>{
 assert.equal(invitationNeedsPassword({rezlee_invite_new_user:true,rezlee_household_member_id:member},member),true);
 assert.equal(invitationNeedsPassword({rezlee_invite_new_user:true,rezlee_household_member_id:"other"},member),false);
 assert.equal(invitationNeedsPassword({},member),false);
});
test("pending invitation expires at seven days without expiring active membership",()=>{
 const now=Date.parse("2026-09-26T12:00:00Z"),created_at="2026-09-19T12:00:00Z";
 assert.equal(invitationExpired({status:"invited",created_at},now),true);
 assert.equal(invitationExpired({status:"invited",created_at,invite_sent_at:"2026-09-20T12:00:00Z"},now),false);
 assert.equal(invitationExpired({status:"active",created_at},now),false);
 assert.equal(invitationExpired({status:"invited",created_at:"invalid"},now),true);
});

export const inviteUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type InviteContext = {state:"pending"|"active"|"expired"|"other_household"|"unavailable";memberId?:string;homeId?:string;homeName?:string;inviterName?:string;email?:string;expiresAt?:string};
export function validInvitationLink(member: string | null, token: string | null, type: string | null) {
  return Boolean(member && inviteUuidPattern.test(member) && token && /^[a-zA-Z0-9_-]{16,512}$/.test(token) && (type === "invite" || type === "magiclink"));
}
export function invitationNeedsPassword(metadata: Record<string, unknown>, memberId: string) {
  return metadata.rezlee_invite_new_user === true && metadata.rezlee_household_member_id === memberId;
}
export function invitationExpired(member: {status:string;invite_sent_at?:string|null;created_at:string}, now=Date.now()) {
  const sent=Date.parse(member.invite_sent_at ?? member.created_at);
  return member.status === "invited" && (!Number.isFinite(sent) || sent+7*24*60*60*1000<=now);
}

/** Invitations must stay in the same environment as the account that owns the code. */
export function referralInvitationUrl(code: unknown, appUrl: string | undefined, databaseUrl: string | undefined) {
 if (typeof code !== 'string' || !/^[A-F0-9]{12}$/i.test(code)) throw Error('Invitation unavailable');
 const expected = databaseUrl?.replace(/\/$/, '') === 'https://gjwvalpxnfbvryosmcbj.supabase.co'
  ? 'https://staging.rezlee.com'
  : databaseUrl?.replace(/\/$/, '') === 'https://eynbuhmtxkigvqoewbwi.supabase.co' ? 'https://rezlee.com' : null;
 if (!expected || appUrl?.replace(/\/$/, '') !== expected) throw Error('Invitation environment unavailable');
 return expected+'/invite/'+code.toUpperCase();
}

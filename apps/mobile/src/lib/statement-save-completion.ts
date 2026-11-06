// A confirmed server save must not become an apparent upload failure because
// local draft cleanup failed. Keep recovery until draft cleanup succeeds.
export async function settleStatementSave(clearDraft: () => Promise<void>, forgetRecovery: () => Promise<void>): Promise<void> {
 try { await clearDraft(); } catch { return; }
 try { await forgetRecovery(); } catch { /* Existing receipt resolves to the saved bill on return. */ }
}

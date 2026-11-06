// This is a non-secret retry identifier, never a credential. Authorization and
// full-payload equality are enforced independently by the server.
export function newVaultSaveRequestId() {
 return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
  const value = Math.floor(Math.random() * 16);
  return (char === "x" ? value : (value & 3) | 8).toString(16);
 });
}

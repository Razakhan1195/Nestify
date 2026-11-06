import * as SecureStore from "expo-secure-store";
const key="rezlee.annual-gift.invitation";
export const validGiftCode=(code:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(code);
export async function saveGiftInvitation(code:string){if(!validGiftCode(code))throw Error("Check your gift link.");await SecureStore.setItemAsync(key,code);}
export async function readGiftInvitation(){const code=await SecureStore.getItemAsync(key);if(code&&!validGiftCode(code))throw Error("Saved gift link is unavailable.");return code;}
export const clearGiftInvitation=()=>SecureStore.deleteItemAsync(key);

import * as SecureStore from "expo-secure-store";
const key = (userId: string) => "rezlee.quick-guide.v1." + userId;
export const hasSeenQuickGuide = async (userId: string) => (await SecureStore.getItemAsync(key(userId))) === "done";
export const finishQuickGuide = (userId: string) => SecureStore.setItemAsync(key(userId), "done");

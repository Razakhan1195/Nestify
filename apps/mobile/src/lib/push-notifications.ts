import { notificationResponseTarget, type NotificationResponseTarget } from "./notification-routing";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { apiPost } from "@/lib/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerPushNotifications(input: {
  requestPermission: boolean;
}) {
  if (!Device.isDevice) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("home-reminders", {name:"Home reminders",importance:Notifications.AndroidImportance.DEFAULT});
    await Notifications.setNotificationChannelAsync("recall-watch", {
      name: "Product recall notices",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync("provider-sync", {
      name: "Bill connection updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
    });
  }

  let permissions = await Notifications.getPermissionsAsync();
  if (
    permissions.status !== "granted" &&
    input.requestPermission &&
    permissions.canAskAgain
  ) {
    permissions = await Notifications.requestPermissionsAsync();
  }

  if (permissions.status !== "granted") return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) return null;

  const token = (
    await Notifications.getExpoPushTokenAsync({ projectId })
  ).data;

  await apiPost<{ ok: true }>("/api/mobile/v1/push-tokens", {
    token,
    platform: Platform.OS,
  });

  return token;
}

function providerHrefFromResponse(
  response: Notifications.NotificationResponse | null,
) {
  const href = response?.notification.request.content.data?.mobileHref;
  return typeof href === "string" &&
    (/^\/(provider|bill|care|shared)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(href) || ["/shared","/recalls","/notifications","/(tabs)/bills","/(tabs)/care"].includes(href))
    ? href
    : null;
}

export async function getInitialProviderNotificationHref() {
  return providerHrefFromResponse(
    await Notifications.getLastNotificationResponseAsync(),
  );
}

export function addProviderNotificationResponseListener(
  onProviderHref: (href: string) => void,
) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const href = providerHrefFromResponse(response);
    if (href) onProviderHref(href);
  });
}

export async function clearNotificationResponse() {await Notifications.clearLastNotificationResponseAsync();}
export async function unregisterPushNotifications(expectedUserId?: string) {
 if (!Device.isDevice || !expectedUserId) return;
 const controller = new AbortController();
 let timer: ReturnType<typeof setTimeout> | undefined;
 const cleanup = async () => {
  const permissions = await Notifications.getPermissionsAsync();
  if (controller.signal.aborted || permissions.status !== "granted") return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;
  const token = (await Notifications.getExpoPushTokenAsync({projectId})).data;
  if (controller.signal.aborted) return;
  const {supabase} = await import("./supabase");
  const current = (await supabase.auth.getSession()).data.session;
  if (controller.signal.aborted || current?.user.id !== expectedUserId) return;
  await supabase.from("device_push_tokens").update({enabled:false})
   .eq("user_id", expectedUserId).eq("expo_push_token", token).abortSignal(controller.signal);
  if (!controller.signal.aborted) await clearNotificationResponse();
 };
 // Notification services must not hold local sign-out indefinitely. Native
 // token calls cannot be cancelled, so check the signal again before any write.
 try {
  await Promise.race([cleanup(), new Promise<void>(resolve => {
   timer = setTimeout(() => { controller.abort(); resolve(); }, 4_000);
  })]);
 } finally { if (timer) clearTimeout(timer); controller.abort(); }
}

export async function getInitialNotificationTarget() {
 return notificationResponseTarget(await Notifications.getLastNotificationResponseAsync());
}
export function addNotificationTargetListener(open:(target:NotificationResponseTarget)=>void) {
 return Notifications.addNotificationResponseReceivedListener(response=>{const target=notificationResponseTarget(response);if(target)open(target);});
}

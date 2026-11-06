import { apiGet, apiPost } from "./api";
export type NotificationPreferences={push_enabled:boolean;connections:boolean;bills:boolean;care:boolean;recalls:boolean;shared_expenses?:boolean;timezone:string};
export type AppNotification={id:string;title:string;body:string|null;status:"unread"|"read";category:"connections"|"bills"|"care"|"recalls"|"shared_expenses";createdAt:string;href:string|null};
export type NotificationsPayload={items:AppNotification[];unread:number;nextBefore:string|null;asOf:string};
export const fetchNotifications=(before?:string,expectedUserId?:string)=>apiGet<NotificationsPayload>("/api/mobile/v1/notifications"+(before?"?before="+encodeURIComponent(before):""),{timeoutMs:15000,expectedUserId});
export const readNotification=(id:string,expectedUserId?:string)=>apiPost("/api/mobile/v1/notifications",{id},{timeoutMs:15000,expectedUserId});
export const readAllNotifications=(readAllBefore:string,expectedUserId?:string)=>apiPost("/api/mobile/v1/notifications",{readAllBefore},{timeoutMs:15000,expectedUserId});
export const fetchNotificationPreferences=()=>apiGet<{preferences:NotificationPreferences;canManageRecalls:boolean}>("/api/mobile/v1/notifications/preferences",{timeoutMs:15000});
export const saveNotificationPreferences=(patch:Partial<NotificationPreferences>)=>apiPost<{preferences:NotificationPreferences}>("/api/mobile/v1/notifications/preferences",patch,{timeoutMs:15000});

export const openNotification=(id:string,expectedUserId:string)=>apiPost<{href:string;notice?:"handled"|"unavailable"}>("/api/mobile/v1/notifications/open",{id},{timeoutMs:15000,expectedUserId});

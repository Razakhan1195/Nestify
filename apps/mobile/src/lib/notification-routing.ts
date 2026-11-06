export type NotificationResponseTarget = { responseId: string; notificationId: string | null };
export function notificationResponseTarget(response: unknown): NotificationResponseTarget | null {
  if (!response || typeof response !== "object") return null;
  const request = (response as { notification?: { request?: { identifier?: unknown; content?: { data?: { notificationId?: unknown } } } } }).notification?.request;
  if (typeof request?.identifier !== "string" || !request.identifier || request.identifier.length > 512) return null;
  const value = request.content?.data?.notificationId;
  return { responseId: request.identifier, notificationId: typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null };
}
export function notificationNavigationReady(path: string) {
  return Boolean(path && path !== "/" && !/^\/(?:welcome|login|signup|forgot-password|reset-password|auth-return|onboarding|delete-account|household\/join)(?:\/|$)/.test(path));
}
export function safeNotificationDestination(href: unknown) {
  return typeof href === "string" && (/^\/(provider|bill|care|shared)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(href) || ["/provider", "/shared", "/recalls", "/notifications", "/(tabs)/bills", "/(tabs)/care"].includes(href)) ? href : "/notifications";
}
export function mergeNotificationItems<T extends { id: string }>(previous: T[], next: T[]): T[] {
  const items = new Map(previous.map(item => [item.id, item]));
  for (const item of next) items.set(item.id, item);
  return Array.from(items.values());
}

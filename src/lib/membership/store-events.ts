import {createHash,timingSafeEqual} from "node:crypto";
import {readBoundedJson} from "../security/request";
import {z} from "zod";

export const storeEventSchema = z.object({
 event: z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  environment: z.enum(["SANDBOX", "PRODUCTION"]).optional(),
  app_user_id: z.string().max(200).optional(),
  transferred_from: z.array(z.string().max(200)).max(30).optional(),
  transferred_to: z.array(z.string().max(200)).max(30).optional(),
 }),
});
type StoreEvent = z.infer<typeof storeEventSchema>["event"];
type Dependencies = {
 userExists: (userId: string) => Promise<boolean>;
 allowsSandbox: (userId: string) => Promise<boolean>;
 reconcile: (userId: string) => Promise<void>;
};

/** A notification triggers an authoritative lookup; its payload never grants access. */
export async function reconcileStoreEvent(event: StoreEvent, deps: Dependencies) {
 const candidates = event.type === "TRANSFER"
  ? [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])]
  : [event.app_user_id ?? ""];
 const ids = [...new Set(candidates)].filter(id => z.string().uuid().safeParse(id).success);
 for (const id of ids) {
  if (!await deps.userExists(id)) continue;
  // Acknowledge unapproved test traffic without changing membership or retrying forever.
  if (event.environment === "SANDBOX" && !await deps.allowsSandbox(id)) continue;
  // Missing environment retains the older lookup path; the store parser still fails closed.
  await deps.reconcile(id);
 }
}

/** RevenueCat requires HTTP 200 specifically; other codes trigger delivery retries. */
export async function handleStoreWebhook(request: Request, config: {configured: boolean; secret?: string}, deps: Dependencies) {
 if (!config.configured || !config.secret || config.secret.length < 32) return new Response(null, {status:503});
 const supplied = request.headers.get("authorization") ?? "";
 if (!timingSafeEqual(createHash("sha256").update(config.secret).digest(), createHash("sha256").update(supplied).digest()))
  return new Response(null, {status:401});
 const input = storeEventSchema.safeParse(await readBoundedJson(request,64000).catch(()=>null));
 if (!input.success) return new Response(null, {status:400});
 try {
  await reconcileStoreEvent(input.data.event,deps);
  return new Response(null,{status:200});
 } catch {
  return new Response(null,{status:503});
 }
}

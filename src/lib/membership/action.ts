import type { Membership } from "./policy";
import { welcomeAcknowledgement } from "./welcome";

type Acknowledgement = NonNullable<ReturnType<typeof welcomeAcknowledgement>>;
type Services = {
  read: (userId: string, activate?: boolean) => Promise<Membership>;
  restore: (userId: string) => Promise<void>;
  acknowledge: (userId: string, value: Acknowledgement) => Promise<void>;
};

/** Reuse only this request's verified result; mutations still require a fresh read. */
export async function completeMembershipAction(
  userId: string,
  action: string,
  services: Services,
  now: () => string = () => new Date().toISOString(),
): Promise<Membership> {
  if (!["activate", "restore", "seen", "pro-seen"].includes(action)) {
    throw new Error("Invalid membership action");
  }
  const current = await services.read(userId, true);
  if (action === "restore") await services.restore(userId);
  const acknowledgement = welcomeAcknowledgement(action, current.plan, now());
  if (acknowledgement) await services.acknowledge(userId, acknowledgement);
  return action === "restore" || acknowledgement
    ? services.read(userId)
    : current;
}

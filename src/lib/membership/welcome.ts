export function welcomeAcknowledgement(action: string, plan: string, at: string) {
  if (action === "pro-seen" && plan === "pro") return { pro_welcome_seen_at: at };
  if (action === "seen") return { founder_seen_at: at };
  return null;
}

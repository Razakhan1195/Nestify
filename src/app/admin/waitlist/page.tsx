import { redirect, notFound } from "next/navigation";
import { operatorAccess } from "@/lib/ops/auth";
import { WaitlistDashboard } from "./waitlist-dashboard";
export default async function Page() {
  const access = await operatorAccess();
  if (access.state === "disabled" || access.state === "forbidden") notFound();
  if (access.state !== "ready") redirect("/admin/access");
  return <WaitlistDashboard />;
}

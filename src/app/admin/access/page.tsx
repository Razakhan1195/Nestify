import { notFound, redirect } from "next/navigation";
import { operatorAccess } from "@/lib/ops/auth";
import { googleAvailability, operatorSignInMessage } from "@/lib/ops/oauth";
import { OperationsAccess } from "./access-form";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const access = await operatorAccess();
  if (access.state === "disabled") notFound();
  if (access.state === "ready") redirect("/admin");
  if (access.state === "unavailable") return <main className="mx-auto max-w-md space-y-4 px-6 py-16"><h1 className="text-2xl font-semibold">Operations is temporarily unavailable</h1><p>We could not verify your session. No operational data was loaded.</p><a href="/admin/access" className="text-primary underline">Try again</a></main>;
  const mode = access.state === "forbidden" ? "denied" : access.state === "mfa" ? "mfa" : "login";
  return <OperationsAccess mode={mode} google={mode === "login" ? await googleAvailability() : "unavailable"} initialError={operatorSignInMessage((await searchParams).error)} />;
}

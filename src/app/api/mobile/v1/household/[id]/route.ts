import { isMissingSchemaError } from "@/lib/schema-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return Response.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { id } = await params;
  const { data: home } = await auth.supabase
    .from("homes")
    .select("id")
    .eq("user_id", auth.user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!home) return Response.json({ error: "Home setup required." }, { status: 409 });
  const { data: member, error: memberError } = await auth.supabase
    .from("household_members")
    .select("id,role,status,linked_user_id")
    .eq("id", id)
    .eq("home_id", home.id)
    .maybeSingle();

  if (memberError) {
    if (isMissingSchemaError(memberError)) {
      return Response.json({ error: "Household collaboration is not enabled yet." }, { status: 503 });
    }
    return Response.json({ error: "Could not load this person." }, { status: 400 });
  }
  if (!member) return Response.json({ error: "Person not found." }, { status: 404 });
  if (member.role === "owner") {
    return Response.json({ error: "The home owner cannot be removed." }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("household_members")
    .delete()
    .eq("id", id)
    .eq("home_id", home.id);

  if (error) return Response.json({ error: "Could not remove this person." }, { status: 400 });

  // A brand-new invite generates an unclaimed Supabase auth identity so the
  // one-time invite token can be verified. If the owner cancels before the
  // person joins, clean up only that unclaimed identity. Never delete an
  // existing Rezlee account or an active household member's account.
  if (member.status === "invited" && member.linked_user_id) {
    try {
      const admin = createAdminClient();
      const { data } = await admin.auth.admin.getUserById(member.linked_user_id);
      const invitedUser = data.user;
      const metadata = invitedUser?.user_metadata ?? {};
      const isGeneratedInviteUser =
        metadata.rezlee_invite_new_user === true &&
        metadata.rezlee_household_member_id === member.id &&
        !invitedUser?.last_sign_in_at;
      if (invitedUser && isGeneratedInviteUser) {
        await admin.auth.admin.deleteUser(invitedUser.id);
      }
    } catch {
      console.warn("[household:invite-cancel] auth cleanup skipped");
    }
  }

  return Response.json({ ok: true });
}

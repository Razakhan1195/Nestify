import type { User } from "@supabase/supabase-js";
import { z } from "zod";

import {
  householdInviteEmailReady,
  sendHouseholdInviteEmail,
} from "@/lib/email/household-invite";
import { householdInviterName } from "@/lib/household/inviter-name";
import { invitationExpired } from "@/lib/household/invitation";
import { resolveAccessibleHome } from "@/lib/household/access";
import { isMissingSchemaError } from "@/lib/schema-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

const memberInput = z.object({
  expensePersonId: z.string().uuid().optional(),
  displayName: z.string().trim().min(1).max(80),
  email: z.string().trim().email("Enter a valid email address."),
  relationship: z.string().trim().max(40).optional().or(z.literal("")),
});

function inviteBaseUrl() {
  return (process.env.HOUSEHOLD_INVITE_BASE_URL || "https://rezlee.com").replace(/\/$/, "");
}

async function findUserByEmail(email: string): Promise<User | null> {
  const admin = createAdminClient();
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < 1000) break;
  }
  return null;
}

export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return Response.json({ error: auth.error.message }, { status: auth.error.status });

  const access = await resolveAccessibleHome(auth.supabase, auth.user.id);
  if (access.error) return Response.json({ error: "Could not load your household." }, { status: 500 });
  if (!access.data) return Response.json({ needsOnboarding: true });

  const { home, role } = access.data;
  const { data: members = [], error } = await auth.supabase
    .from("household_members")
    .select("id,display_name,email,relationship,role,status,linked_user_id,created_at,invite_sent_at,accepted_at")
    .eq("home_id", home.id)
    .order("role", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingSchemaError(error)) return Response.json({ available: false, home });
    return Response.json({ error: "Could not load your household." }, { status: 500 });
  }

  const taskQuery = auth.supabase
    .from("maintenance_tasks")
    .select("id,title,due_date,status,assigned_member_id,rotation_id")
    .eq("home_id", home.id)
    .neq("status", "completed");
  if (role === "owner") taskQuery.eq("user_id", auth.user.id);

  const [{ data: rotations = [] }, taskResult] = await Promise.all([
    auth.supabase
      .from("household_rotations")
      .select("id,title,enabled,created_at")
      .eq("home_id", home.id)
      .order("created_at", { ascending: false })
      .then((result) => (result.error ? { data: [] } : result)),
    taskQuery,
  ]);

  const phoneResult = role === "owner" ? await auth.supabase.from("household_phone_invites").select("member_id,phone,request_user_id,request_email,requested_at,accepted_at,expires_at").eq("home_id", home.id) : null;
  const phoneInvites = new Map((phoneResult?.data ?? []).map(row => [row.member_id, row]));
  const memberRows = members ?? [];
  const assignedTasks = taskResult.error ? [] : taskResult.data ?? [];
  const openAssigned = assignedTasks.filter((task) => task.assigned_member_id);
  const activeRotations = (rotations ?? []).filter((rotation) => rotation.enabled);

  return Response.json({
    available: true,
    home: { id: home.id, nickname: home.nickname },
    accessRole: role,
    members: memberRows.map(member => ({...member, inviteExpired: invitationExpired(member), phoneInvite: phoneInvites.get(member.id) ?? null})),
    phoneInvitesAvailable: role !== "owner" || !phoneResult?.error,
    summary: {
      memberCount: memberRows.length,
      assignedOpenCount: openAssigned.length,
      activeRotationCount: activeRotations.length,
    },
    rotations: activeRotations.slice(0, 6),
  });
}

export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return Response.json({ error: auth.error.message }, { status: auth.error.status });

  const access = await resolveAccessibleHome(auth.supabase, auth.user.id);
  if (access.error || !access.data) return Response.json({ error: "Home setup required." }, { status: 409 });
  if (access.data.role !== "owner") return Response.json({ error: "Only the household owner can invite people." }, { status: 403 });

  const parsed = memberInput.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Check this invitation and try again." }, { status: 400 });
  }

  if (!householdInviteEmailReady()) {
    console.error("[household:invite] transactional email is not configured");
    return Response.json(
      { error: "Household invitations are temporarily unavailable." },
      { status: 503 },
    );
  }

  const { home } = access.data;
  const email = parsed.data.email.toLowerCase();
  if (email === auth.user.email?.toLowerCase()) {
    return Response.json({ error: "You are already part of this household." }, { status: 400 });
  }

  const profile = await auth.supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const inviterName = householdInviterName(auth.user.user_metadata, profile.data?.full_name);

  const { data: member, error: memberError } = parsed.data.expensePersonId
    ? await auth.supabase.rpc("rezlee_prepare_expense_invite", { target_home: home.id, person_id: parsed.data.expensePersonId, invite_email: email, relationship: parsed.data.relationship || null })
    : await auth.supabase
    .from("household_members")
    .insert({
      home_id: home.id,
      created_by_user_id: auth.user.id,
      display_name: parsed.data.displayName,
      email,
      relationship: parsed.data.relationship || null,
      role: "member",
      status: "invited",
      invite_sent_at: new Date().toISOString(),
    })
    .select("id,display_name,email,relationship,role,status,linked_user_id,created_at,invite_sent_at,accepted_at")
    .single();

  if (memberError || !member) {
    if (isMissingSchemaError(memberError)) return Response.json({ error: "Household invitations are not enabled yet." }, { status: 503 });
    if (memberError?.code === "PT409") return Response.json({ error: "This person already has a pending invitation or household access. Check People before trying again." }, { status: 409 });
    if (memberError?.code === "23505") return Response.json({ error: "That email is already part of this household." }, { status: 409 });
    return Response.json({ error: "Could not create this invitation." }, { status: 400 });
  }

  const baseMetadata = {
    full_name: parsed.data.displayName,
    rezlee_household_member_id: member.id,
    rezlee_home_name: home.nickname,
    rezlee_inviter_name: inviterName,
    rezlee_relationship: parsed.data.relationship || "Household member",
  };
  const admin = createAdminClient();

  let generatedNewUserId: string | null = null;
  try {
    const existingUser = await findUserByEmail(email);
    const linkType = existingUser ? "magiclink" : "invite";


    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: linkType,
      email,
      options: {
        ...(!existingUser ? { data: { ...baseMetadata, rezlee_invite_new_user: true } } : {}),
      },
    });
    if (linkError || !linkData.user || !linkData.properties?.action_link) {
      throw linkError ?? new Error("Could not generate the invitation link.");
    }

    if (!existingUser) generatedNewUserId = linkData.user.id;
    const actionUrl = new URL(linkData.properties.action_link);
    const tokenHash = actionUrl.searchParams.get("token") ?? actionUrl.searchParams.get("token_hash");
    const verificationType = actionUrl.searchParams.get("type") ?? linkType;
    if (!tokenHash) throw new Error("Invitation token was missing.");

    const publicBaseUrl = inviteBaseUrl();
    const joinUrl = `${publicBaseUrl}/auth/invite?member=${encodeURIComponent(member.id)}&token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verificationType)}`;
    const linkedUserId = existingUser?.id ?? linkData.user.id;

    const { data: updated, error: updateError } = await auth.supabase
      .from("household_members")
      .update({ linked_user_id: linkedUserId, invite_sent_at: new Date().toISOString() })
      .eq("id", member.id)
      .eq("home_id", home.id)
      .select("id,display_name,email,relationship,role,status,linked_user_id,created_at,invite_sent_at,accepted_at")
      .single();
    if (updateError || !updated) throw updateError ?? new Error("Could not link invitation user.");

    await sendHouseholdInviteEmail({
      memberId: member.id,
      inviterName,
      homeName: home.nickname,
      recipientEmail: email,
      joinUrl,
      brandMarkUrl: `${publicBaseUrl}/rezlee-mark-email.png`,
    });

    return Response.json({ member: updated, invitationSent: true }, { status: 201 });
  } catch (error) {
    await auth.supabase.from("household_members").delete().eq("id", member.id).eq("home_id", home.id).eq("status", "invited");
    if (generatedNewUserId) {
      const { data } = await admin.auth.admin.getUserById(generatedNewUserId);
      if (data.user && !data.user.last_sign_in_at && data.user.user_metadata?.rezlee_household_member_id === member.id) {
        await admin.auth.admin.deleteUser(generatedNewUserId).catch(() => undefined);
      }
    }
    console.error("[household:invite] send failed", {kind:error instanceof Error ? error.name : "unknown"});
    return Response.json({ error: "We could not send the invitation. Please try again." }, { status: 502 });
  }
}

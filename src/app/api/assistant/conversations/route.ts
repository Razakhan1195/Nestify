import { NextResponse } from "next/server";
import type { UIMessage } from "ai";

import {
  messageToHistory,
  titleFromMessages,
  type AssistantConversation,
  type AssistantConversationSummary,
  type AssistantHistoryMessage,
} from "@/lib/assistant/history";
import { getCurrentUserHome } from "@/lib/homes";
import { isMissingSchemaError } from "@/lib/schema-errors";
import { createClient } from "@/lib/supabase/server";

const HISTORY_MIGRATION_MESSAGE =
  "Run `supabase/migrations/202606230003_assistant_chat_history.sql` in the Supabase SQL Editor to enable assistant history.";

type ConversationRow = {
  created_at: string;
  id: string;
  is_saved: boolean;
  last_message_at: string;
  title: string;
};

type MessageRow = {
  content: string;
  created_at: string;
  id: string;
  role: string;
  source_message_id: string | null;
};

async function requireUserAndHome() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: home, error: homeError } = await getCurrentUserHome(user.id);
  if (homeError) {
    return { error: NextResponse.json({ error: homeError.message }, { status: 500 }) };
  }

  if (!home) {
    return { error: NextResponse.json({ error: "Home setup required." }, { status: 409 }) };
  }

  return { home, supabase, user };
}

function conversationSummary(row: ConversationRow): AssistantConversationSummary {
  return {
    created_at: row.created_at,
    id: row.id,
    is_saved: row.is_saved,
    last_message_at: row.last_message_at,
    title: row.title,
  };
}

function historyMessage(row: MessageRow): AssistantHistoryMessage | null {
  if (row.role !== "user" && row.role !== "assistant") return null;
  return {
    content: row.content,
    created_at: row.created_at,
    id: row.source_message_id ?? row.id,
    role: row.role,
  };
}

function normalizeMessages(messages: unknown): AssistantHistoryMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message) => messageToHistory(message as UIMessage))
    .filter((message): message is AssistantHistoryMessage => Boolean(message))
    .slice(0, 80);
}

export async function GET() {
  const auth = await requireUserAndHome();
  if (auth.error) return auth.error;
  const { home, supabase, user } = auth;

  const { data: conversations, error } = await supabase
    .from("assistant_conversations")
    .select("id,title,is_saved,last_message_at,created_at")
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("last_message_at", { ascending: false })
    .limit(24);

  if (error) {
    if (isMissingSchemaError(error)) {
      return NextResponse.json({
        conversations: [],
        message: HISTORY_MIGRATION_MESSAGE,
        schemaReady: false,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    conversations: ((conversations ?? []) as ConversationRow[]).map(conversationSummary),
    schemaReady: true,
  });
}

export async function POST(req: Request) {
  const auth = await requireUserAndHome();
  if (auth.error) return auth.error;
  const { home, supabase, user } = auth;
  const body = (await req.json().catch(() => ({}))) as {
    conversationId?: string;
    messages?: unknown;
    saved?: boolean;
    title?: string;
  };

  const messages = normalizeMessages(body.messages);
  if (messages.length === 0) {
    return NextResponse.json({ error: "Add at least one message before saving." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const title = (body.title?.trim() || titleFromMessages(messages)).slice(0, 140);
  const saved = body.saved === true;
  let conversation: ConversationRow | null = null;

  if (body.conversationId) {
    const { data: existing, error: existingError } = await supabase
      .from("assistant_conversations")
      .select("id,title,is_saved,last_message_at,created_at")
      .eq("id", body.conversationId)
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .single();

    if (existingError || !existing) {
      if (existingError && isMissingSchemaError(existingError)) {
        return NextResponse.json({ error: HISTORY_MIGRATION_MESSAGE }, { status: 409 });
      }
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("assistant_conversations")
      .update({
        is_saved: saved ? true : existing.is_saved,
        last_message_at: now,
        title,
      })
      .eq("id", existing.id)
      .eq("user_id", user.id)
      .eq("home_id", home.id)
      .select("id,title,is_saved,last_message_at,created_at")
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message ?? "Could not update conversation." },
        { status: 500 }
      );
    }
    conversation = updated as ConversationRow;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("assistant_conversations")
      .insert({
        user_id: user.id,
        home_id: home.id,
        is_saved: saved,
        last_message_at: now,
        title,
      })
      .select("id,title,is_saved,last_message_at,created_at")
      .single();

    if (insertError || !inserted) {
      if (insertError && isMissingSchemaError(insertError)) {
        return NextResponse.json({ error: HISTORY_MIGRATION_MESSAGE }, { status: 409 });
      }
      return NextResponse.json(
        { error: insertError?.message ?? "Could not save conversation." },
        { status: 500 }
      );
    }
    conversation = inserted as ConversationRow;
  }

  const { error: deleteError } = await supabase
    .from("assistant_messages")
    .delete()
    .eq("conversation_id", conversation.id)
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const rows = messages.map((message, index) => ({
    conversation_id: conversation.id,
    user_id: user.id,
    home_id: home.id,
    role: message.role,
    content: message.content,
    message_order: index,
    source_message_id: message.id,
  }));

  const { error: messageError } = await supabase.from("assistant_messages").insert(rows);
  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 500 });
  }

  return NextResponse.json({
    conversation: conversationSummary(conversation),
    schemaReady: true,
  });
}

export async function PATCH(req: Request) {
  const auth = await requireUserAndHome();
  if (auth.error) return auth.error;
  const { home, supabase, user } = auth;
  const body = (await req.json().catch(() => ({}))) as {
    conversationId?: string;
    saved?: boolean;
    title?: string;
  };

  if (!body.conversationId) {
    return NextResponse.json({ error: "Conversation id is required." }, { status: 400 });
  }

  const update: { is_saved?: boolean; title?: string } = {};
  if (typeof body.saved === "boolean") update.is_saved = body.saved;
  if (body.title?.trim()) update.title = body.title.trim().slice(0, 140);

  const { data, error } = await supabase
    .from("assistant_conversations")
    .update(update)
    .eq("id", body.conversationId)
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .select("id,title,is_saved,last_message_at,created_at")
    .single();

  if (error || !data) {
    if (error && isMissingSchemaError(error)) {
      return NextResponse.json({ error: HISTORY_MIGRATION_MESSAGE }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message ?? "Conversation not found." }, { status: 404 });
  }

  return NextResponse.json({ conversation: conversationSummary(data as ConversationRow) });
}

export async function DELETE(req: Request) {
  const auth = await requireUserAndHome();
  if (auth.error) return auth.error;
  const { home, supabase, user } = auth;
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("id");

  if (!conversationId) {
    return NextResponse.json({ error: "Conversation id is required." }, { status: 400 });
  }

  const { error } = await supabase
    .from("assistant_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  if (error) {
    if (isMissingSchemaError(error)) {
      return NextResponse.json({ error: HISTORY_MIGRATION_MESSAGE }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const auth = await requireUserAndHome();
  if (auth.error) return auth.error;
  const { home, supabase, user } = auth;
  const body = (await req.json().catch(() => ({}))) as { conversationId?: string };

  if (!body.conversationId) {
    return NextResponse.json({ error: "Conversation id is required." }, { status: 400 });
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("assistant_conversations")
    .select("id,title,is_saved,last_message_at,created_at")
    .eq("id", body.conversationId)
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .single();

  if (conversationError || !conversation) {
    if (conversationError && isMissingSchemaError(conversationError)) {
      return NextResponse.json({ error: HISTORY_MIGRATION_MESSAGE }, { status: 409 });
    }
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const { data: rows, error: messageError } = await supabase
    .from("assistant_messages")
    .select("id,role,content,source_message_id,created_at")
    .eq("conversation_id", conversation.id)
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("message_order", { ascending: true });

  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 500 });
  }

  const payload: AssistantConversation = {
    ...conversationSummary(conversation as ConversationRow),
    messages: ((rows ?? []) as MessageRow[])
      .map(historyMessage)
      .filter((message): message is AssistantHistoryMessage => Boolean(message)),
  };

  return NextResponse.json({ conversation: payload });
}

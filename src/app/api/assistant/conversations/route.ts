import { hasSupabaseEnv } from "@/lib/supabase/env";
import { readBoundedJson } from "@/lib/security/request";
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
  "Conversation history is temporarily unavailable. Please try again later.";

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
  if (!hasSupabaseEnv())
    return {
      error: NextResponse.json(
        { error: "Account access is temporarily unavailable." },
        { status: 503 },
      ),
    };
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: home, error: homeError } = await getCurrentUserHome(user.id);
  if (homeError) {
    return {
      error: NextResponse.json(
        { error: "Could not load your place." },
        { status: 500 },
      ),
    };
  }

  if (!home) {
    return {
      error: NextResponse.json(
        { error: "Home setup required." },
        { status: 409 },
      ),
    };
  }

  return { home, supabase, user };
}

function conversationSummary(
  row: ConversationRow,
): AssistantConversationSummary {
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
    .filter(
      (message) =>
        message &&
        typeof message === "object" &&
        typeof message.id === "string" &&
        Array.isArray(message.parts) &&
        message.parts.every(
          (part: unknown) =>
            part &&
            typeof part === "object" &&
            "type" in part &&
            (part.type !== "text" ||
              ("text" in part && typeof part.text === "string")),
        ),
    )
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
    return NextResponse.json(
      { error: "Conversation could not be loaded or saved. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    conversations: ((conversations ?? []) as ConversationRow[]).map(
      conversationSummary,
    ),
    schemaReady: true,
  });
}

export async function POST(req: Request) {
  const auth = await requireUserAndHome();
  if (auth.error) return auth.error;
  const { home, supabase } = auth;
  const body = ((await readBoundedJson(req).catch(() => ({}))) ?? {}) as {
    conversationId?: string;
    messages?: unknown;
    saved?: boolean;
    title?: string;
  };

  const messages = normalizeMessages(body.messages);
  if (messages.length === 0) {
    return NextResponse.json(
      { error: "Add at least one message before saving." },
      { status: 400 },
    );
  }

  const title = (
    (typeof body.title === "string" ? body.title.trim() : "") ||
    titleFromMessages(messages)
  ).slice(0, 140);
  const { data: conversation, error } = await supabase.rpc(
    "save_rezlee_conversation",
    {
      p_home_id: home.id,
      p_conversation_id:
        typeof body.conversationId === "string" ? body.conversationId : null,
      p_title: title,
      p_saved: body.saved === true,
      p_messages: messages,
    },
  );
  if (error || !conversation) {
    return NextResponse.json(
      {
        error:
          "Conversation could not be saved. Your previous history has been kept. Please try again.",
      },
      { status: 503 },
    );
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
  const body = ((await readBoundedJson(req).catch(() => ({}))) ?? {}) as {
    conversationId?: string;
    saved?: boolean;
    title?: string;
  };

  if (!body.conversationId) {
    return NextResponse.json(
      { error: "Conversation id is required." },
      { status: 400 },
    );
  }

  const update: { is_saved?: boolean; title?: string } = {};
  if (typeof body.saved === "boolean") update.is_saved = body.saved;
  if (typeof body.title === "string" && body.title.trim())
    update.title = body.title.trim().slice(0, 140);

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
      return NextResponse.json(
        { error: HISTORY_MIGRATION_MESSAGE },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    conversation: conversationSummary(data as ConversationRow),
  });
}

export async function DELETE(req: Request) {
  const auth = await requireUserAndHome();
  if (auth.error) return auth.error;
  const { home, supabase, user } = auth;
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("id");

  if (!conversationId) {
    return NextResponse.json(
      { error: "Conversation id is required." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("assistant_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .eq("home_id", home.id);

  if (error) {
    if (isMissingSchemaError(error)) {
      return NextResponse.json(
        { error: HISTORY_MIGRATION_MESSAGE },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Conversation could not be loaded or saved. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const auth = await requireUserAndHome();
  if (auth.error) return auth.error;
  const { home, supabase, user } = auth;
  const body = ((await readBoundedJson(req).catch(() => ({}))) ?? {}) as {
    conversationId?: string;
  };

  if (!body.conversationId) {
    return NextResponse.json(
      { error: "Conversation id is required." },
      { status: 400 },
    );
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
      return NextResponse.json(
        { error: HISTORY_MIGRATION_MESSAGE },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 },
    );
  }

  const { data: rows, error: messageError } = await supabase
    .from("assistant_messages")
    .select("id,role,content,source_message_id,created_at")
    .eq("conversation_id", conversation.id)
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("message_order", { ascending: true });

  if (messageError) {
    return NextResponse.json(
      { error: "Conversation could not be saved. Please try again." },
      { status: 500 },
    );
  }

  const payload: AssistantConversation = {
    ...conversationSummary(conversation as ConversationRow),
    messages: ((rows ?? []) as MessageRow[])
      .map(historyMessage)
      .filter((message): message is AssistantHistoryMessage =>
        Boolean(message),
      ),
  };

  return NextResponse.json({ conversation: payload });
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { LifeBuoy } from "lucide-react";

import { AssistantChat } from "@/components/assistant/assistant-chat";
import { PageHeader, PageShell, SecondaryCTA } from "@/components/product/design-system";
import type { AssistantConversationSummary } from "@/lib/assistant/history";
import { getCurrentUserHome } from "@/lib/homes";
import { isMissingSchemaError } from "@/lib/schema-errors";
import { createClient } from "@/lib/supabase/server";

export default async function AssistantPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: home } = await getCurrentUserHome(user.id);
  if (!home) redirect("/app/onboarding");

  const firstName = (user.user_metadata?.full_name as string | undefined)?.split(" ")[0];
  const greeting = firstName
    ? `Hi ${firstName}, how can I help with ${home.nickname ?? "your home"}?`
    : `How can I help with ${home.nickname ?? "your home"}?`;
  let historyReady = true;
  let historyMessage: string | null = null;
  let conversations: AssistantConversationSummary[] = [];

  const { data: conversationRows, error: conversationError } = await supabase
    .from("assistant_conversations")
    .select("id,title,is_saved,last_message_at,created_at")
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("last_message_at", { ascending: false })
    .limit(24);

  if (conversationError) {
    historyReady = false;
    historyMessage = isMissingSchemaError(conversationError)
      ? "Run `supabase/migrations/202606230003_assistant_chat_history.sql` in Supabase to enable assistant history and saved chats."
      : "Assistant history is temporarily unavailable.";
  } else {
    conversations = (conversationRows ?? []) as AssistantConversationSummary[];
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Assistant"
        title="Ask Nestify"
        description="Ask about your home, bills, repairs, renovations, rough project costs, contractor planning, and the records you've added."
        actions={
          <SecondaryCTA asChild>
            <Link href="/app/help">
              <LifeBuoy className="size-4" />
              Guided issue check
            </Link>
          </SecondaryCTA>
        }
      />
      <AssistantChat
        greeting={greeting}
        historyMessage={historyMessage}
        historyReady={historyReady}
        initialConversations={conversations}
      />
    </PageShell>
  );
}

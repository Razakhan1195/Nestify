import Link from "next/link";
import { redirect } from "next/navigation";
import { LifeBuoy } from "lucide-react";

import { AssistantChat } from "@/components/assistant/assistant-chat";
import { PageHeader, PageShell, SecondaryCTA } from "@/components/product/design-system";
import { getCurrentUserHome } from "@/lib/homes";
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

  return (
    <PageShell>
      <PageHeader
        eyebrow="Assistant"
        title="Ask Nestify"
        description="A grounded helper that knows what you've added to your home — bills, maintenance, documents, and more."
        actions={
          <SecondaryCTA asChild>
            <Link href="/app/help">
              <LifeBuoy className="size-4" />
              Guided issue check
            </Link>
          </SecondaryCTA>
        }
      />
      <AssistantChat greeting={greeting} />
    </PageShell>
  );
}

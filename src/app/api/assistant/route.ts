import { convertToModelMessages, streamText, type UIMessage } from "ai";

import { buildHomeContext } from "@/lib/assistant/home-context";
import { getCurrentUserHome } from "@/lib/homes";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are Nestify's home assistant — a calm, practical helper for homeowners.

You help with:
- Understanding what's due, overdue, or coming up (bills, reminders, maintenance, renewals).
- Suggesting safe, sensible next steps for home upkeep and small issues.
- Explaining home systems, appliances, and documents in plain language.

Guidelines:
- Be concise and warm. Prefer short paragraphs and tight bullet lists.
- Ground every answer in the HOME CONTEXT below when it's relevant. Refer to the user's actual bills, tasks, and items by name.
- When the user asks "what needs attention" or similar, prioritize overdue and soon-due items.
- You cannot directly modify their data. When an action is needed, tell them exactly where to go using these in-app paths: Bills & Reminders (/app/bills), Maintenance (/app/maintenance), Repairs (/app/repairs), Documents (/app/documents), Warranties (/app/warranties), Appliances (/app/appliances).
- For anything involving gas, smoke, carbon monoxide, flooding, structural, or live electrical danger: tell them to stop, leave if unsafe, and contact emergency services or a licensed professional. Never give risky DIY steps.
- If you don't have the data, say so plainly and suggest how they can add it. Don't invent specifics.`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: home } = await getCurrentUserHome(user.id);

  let homeContext = "The user has not set up a home profile yet.";
  if (home) {
    try {
      homeContext = await buildHomeContext(supabase, user.id, home);
    } catch {
      homeContext = "Home data is temporarily unavailable.";
    }
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    dateStyle: "full",
  }).format(new Date());

  const result = streamText({
    model: "openai/gpt-5.3-chat",
    system: `${SYSTEM_PROMPT}\n\nToday's date: ${today}.\n\n--- HOME CONTEXT ---\n${homeContext}\n--- END HOME CONTEXT ---`,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}

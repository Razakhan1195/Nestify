import { gateway } from "@ai-sdk/gateway";
import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";

import { AI_MODELS } from "@/lib/ai/models";
import { buildHomeContext } from "@/lib/assistant/home-context";
import { getCurrentUserHome } from "@/lib/homes";
import { isMissingSchemaError } from "@/lib/schema-errors";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are Nestify's home assistant — a calm, practical helper for homeowners.

You help with:
- Understanding what's due, overdue, or coming up (bills, reminders, maintenance, renewals).
- Suggesting safe, sensible next steps for home upkeep and small issues.
- Explaining home systems, appliances, and documents in plain language.
- Answering general homeowner questions about repairs, renovations, upgrades, contractor planning, permits, materials, timelines, prioritization, and rough cost ranges.

Guidelines:
- Be concise and warm. Prefer short paragraphs and tight bullet lists.
- Ground every answer in the HOME CONTEXT below when it's relevant. Refer to the user's actual bills, tasks, and items by name.
- When the user asks "what needs attention" or similar, prioritize overdue and soon-due items.
- For renovation or repair estimates, give rough planning ranges only, not quotes. Explain the main cost drivers such as scope, home age, materials, local labor, permits, hidden damage, access, and contractor availability.
- If the user asks for a budget, help them break the project into a practical planning range, likely line items, questions to ask contractors, and what to verify before committing.
- If pricing depends on current local rates or live product prices, say that Nestify does not have live market pricing and recommend getting multiple local quotes.
- You cannot directly modify their data. When an action is needed, tell them exactly where to go using these in-app paths: Bills & Reminders (/app/bills), Maintenance (/app/maintenance), Repairs (/app/repairs), Documents (/app/documents), Warranties (/app/warranties), Appliances (/app/appliances).
- For anything involving gas, smoke, carbon monoxide, flooding, structural, or live electrical danger: tell them to stop, leave if unsafe, and contact emergency services or a licensed professional. Never give risky DIY steps.
- If you don't have the data, say so plainly and suggest how they can add it. Don't invent specifics.`;

function localAssistantMessage(message: string) {
  const textId = "assistant-fallback";
  const stream = createUIMessageStream<UIMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: message });
      writer.write({ type: "text-end", id: textId });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function envFlag(name: string, defaultValue: boolean) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
}

function positiveIntegerEnv(name: string, defaultValue: number) {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function dayStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function gatewayIsConfigured() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN);
}

function googleIsConfigured() {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

function getAssistantRuntime() {
  const providerPreference = (process.env.AI_ASSISTANT_PROVIDER ?? "auto").toLowerCase();
  const preferGoogle = providerPreference === "auto" || providerPreference === "google";
  const preferGateway = providerPreference === "auto" || providerPreference === "gateway";

  if (preferGoogle && googleIsConfigured()) {
    const modelId = process.env.AI_ASSISTANT_MODEL ?? AI_MODELS.assistantGoogle;
    return {
      configured: true,
      model: google(modelId),
      modelId,
      provider: "google",
    } as const;
  }

  if (preferGateway && gatewayIsConfigured()) {
    const modelId = process.env.AI_ASSISTANT_MODEL ?? AI_MODELS.assistantGateway;
    return {
      configured: true,
      model: gateway(modelId),
      modelId,
      provider: "gateway",
    } as const;
  }

  return {
    configured: false,
    message:
      "I can help with home questions once AI is connected. For the cheapest setup, add a Google AI Studio key to `.env.local` as `GOOGLE_GENERATIVE_AI_API_KEY=...`, then restart `npm run dev`.\n\nYou can also use Vercel AI Gateway by setting `AI_GATEWAY_API_KEY=...`. The assistant UI, home context, and cost controls are wired; it just needs a model credential.",
    modelId:
      providerPreference === "gateway"
        ? process.env.AI_ASSISTANT_MODEL ?? AI_MODELS.assistantGateway
        : process.env.AI_ASSISTANT_MODEL ?? AI_MODELS.assistantGoogle,
    provider: providerPreference === "gateway" ? "gateway" : "google",
  } as const;
}

async function countUsage(input: {
  since: Date;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}) {
  return input.supabase
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.userId)
    .eq("feature", "assistant")
    .in("status", ["started", "succeeded"])
    .gte("created_at", input.since.toISOString());
}

async function createUsageEvent(input: {
  homeId: string | null;
  model: string;
  provider: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}) {
  const { data, error } = await input.supabase
    .from("ai_usage_events")
    .insert({
      user_id: input.userId,
      home_id: input.homeId,
      feature: "assistant",
      provider: input.provider,
      model: input.model,
      status: "started",
      metadata: {
        max_output_tokens: positiveIntegerEnv("AI_ASSISTANT_MAX_OUTPUT_TOKENS", 700),
      },
    })
    .select("id")
    .single();

  return { data, error };
}

async function updateUsageEvent(input: {
  errorMessage?: string;
  eventId: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  status: "succeeded" | "failed" | "aborted";
  supabase: Awaited<ReturnType<typeof createClient>>;
  totalTokens?: number | null;
}) {
  await input.supabase
    .from("ai_usage_events")
    .update({
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      total_tokens: input.totalTokens ?? null,
      error_message: input.errorMessage ?? null,
      status: input.status,
    })
    .eq("id", input.eventId);
}

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
  const assistantEnabled = envFlag("AI_ASSISTANT_ENABLED", true);
  if (!assistantEnabled) {
    return localAssistantMessage(
      "The Nestify assistant is temporarily turned off. Set `AI_ASSISTANT_ENABLED=true` when you want to enable it again."
    );
  }

  const runtime = getAssistantRuntime();
  if (!runtime.configured) {
    return localAssistantMessage(runtime.message);
  }

  const now = new Date();
  const dailyLimit = positiveIntegerEnv("AI_ASSISTANT_DAILY_LIMIT", 20);
  const monthlyLimit = positiveIntegerEnv("AI_ASSISTANT_MONTHLY_LIMIT", 250);
  const maxOutputTokens = positiveIntegerEnv("AI_ASSISTANT_MAX_OUTPUT_TOKENS", 700);

  const [dailyUsage, monthlyUsage] = await Promise.all([
    countUsage({ since: dayStart(now), supabase, userId: user.id }),
    countUsage({ since: monthStart(now), supabase, userId: user.id }),
  ]);

  if (dailyUsage.error || monthlyUsage.error) {
    const error = dailyUsage.error ?? monthlyUsage.error;
    if (isMissingSchemaError(error)) {
      return localAssistantMessage(
        "AI usage controls are not set up yet. Run `supabase/migrations/202606230002_ai_usage_controls.sql` in the Supabase SQL Editor, then refresh and try again."
      );
    }

    return localAssistantMessage(
      "Nestify could not verify assistant usage limits, so the request was blocked to avoid unexpected AI cost. Please try again later."
    );
  }

  if ((dailyUsage.count ?? 0) >= dailyLimit) {
    return localAssistantMessage(
      `You've reached today's assistant limit of ${dailyLimit} messages. This limit helps keep Nestify's AI costs under control.`
    );
  }

  if ((monthlyUsage.count ?? 0) >= monthlyLimit) {
    return localAssistantMessage(
      `You've reached this month's assistant limit of ${monthlyLimit} messages. This limit helps keep Nestify's AI costs under control.`
    );
  }

  const usageEvent = await createUsageEvent({
    homeId: home?.id ?? null,
    model: runtime.modelId,
    provider: runtime.provider,
    supabase,
    userId: user.id,
  });

  if (usageEvent.error || !usageEvent.data) {
    const message = isMissingSchemaError(usageEvent.error)
      ? "AI usage controls are not set up yet. Run `supabase/migrations/202606230002_ai_usage_controls.sql` in the Supabase SQL Editor, then refresh and try again."
      : "Nestify could not start the assistant safely, so the request was blocked to avoid unexpected AI cost.";
    return localAssistantMessage(message);
  }
  const usageEventId = usageEvent.data.id;

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
    model: runtime.model,
    maxOutputTokens,
    system: `${SYSTEM_PROMPT}\n\nToday's date: ${today}.\n\n--- HOME CONTEXT ---\n${homeContext}\n--- END HOME CONTEXT ---`,
    messages: await convertToModelMessages(messages),
    onError: ({ error }) => {
      console.error("[assistant] model request failed", error);
      void updateUsageEvent({
        errorMessage: error instanceof Error ? error.message : "Assistant model request failed.",
        eventId: usageEventId,
        status: "failed",
        supabase,
      });
    },
    onAbort: () => {
      void updateUsageEvent({
        eventId: usageEventId,
        status: "aborted",
        supabase,
      });
    },
    onFinish: ({ usage }) => {
      void updateUsageEvent({
        eventId: usageEventId,
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
        status: "succeeded",
        supabase,
        totalTokens: usage.totalTokens ?? null,
      });
    },
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error("[assistant] stream failed", error);
      return "Nestify could not reach the AI model. Check `GOOGLE_GENERATIVE_AI_API_KEY` for the cheapest direct setup, or `AI_GATEWAY_API_KEY` for Vercel AI Gateway, then try again.";
    },
  });
}

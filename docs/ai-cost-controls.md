# Nestify AI Cost Controls

Nestify uses the AI SDK for assistant and extraction features. The assistant is configured to be cheap-first and guarded by usage limits.

## Cheapest Assistant Setup

Use a Google AI Studio key for direct Gemini access:

```env
GOOGLE_GENERATIVE_AI_API_KEY=...
AI_ASSISTANT_PROVIDER=auto
```

With `AI_ASSISTANT_PROVIDER=auto`, Nestify prefers direct Google when `GOOGLE_GENERATIVE_AI_API_KEY` exists. The default direct model is:

```txt
gemini-2.5-flash-lite
```

Google documents a Gemini API free tier with rate limits. This is the cheapest path for development and early testing.

## Gateway Fallback

Vercel AI Gateway can route to many providers and models:

```env
AI_GATEWAY_API_KEY=...
AI_ASSISTANT_PROVIDER=gateway
```

The default Gateway model is:

```txt
google/gemini-2.5-flash-lite
```

Gateway usage is credit/billing based, so keep the limits below enabled.

## Guardrails

```env
AI_ASSISTANT_ENABLED=true
AI_ASSISTANT_DAILY_LIMIT=20
AI_ASSISTANT_MONTHLY_LIMIT=250
AI_ASSISTANT_MAX_OUTPUT_TOKENS=700
```

- `AI_ASSISTANT_ENABLED=false` turns the assistant off immediately.
- Daily/monthly limits are per authenticated user.
- `AI_ASSISTANT_MAX_OUTPUT_TOKENS` caps response size.
- Every assistant request is logged in `public.ai_usage_events`.

## Required SQL

Run this migration before enabling the assistant in production:

```txt
supabase/migrations/202606230002_ai_usage_controls.sql
```

If the migration is missing, the assistant blocks model calls instead of risking unexpected spend.

Run this migration to enable assistant conversation history and saved chats:

```txt
supabase/migrations/202606230003_assistant_chat_history.sql
```

If the history migration is missing, the assistant can still answer, but previous chats and saved conversations will not persist.

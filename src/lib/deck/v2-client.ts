export type DeckV2ErrorDetail = {
  type?: string;
  code?: string;
  field?: string;
  message?: string;
};

export class DeckV2ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly type: string | null;
  readonly field: string | null;
  readonly requestId: string | null;

  constructor(input: {
    status: number;
    detail?: DeckV2ErrorDetail;
    requestId?: string | null;
    fallback?: string;
  }) {
    super(input.detail?.message || input.fallback || `Deck API request failed (${input.status}).`);
    this.name = "DeckV2ApiError";
    this.status = input.status;
    this.code = input.detail?.code ?? null;
    this.type = input.detail?.type ?? null;
    this.field = input.detail?.field ?? null;
    this.requestId = input.requestId ?? null;
  }
}

export type DeckV2InteractionField = {
  name: string;
  type?: string;
  label?: string;
  options?: Array<{
    value: string;
    label: string;
  }>;
};

export type DeckV2Interaction = {
  type?: string;
  message?: string;
  fields?: DeckV2InteractionField[];
};
export type DeckV2TaskRun = {
  id: string;
  object?: string;
  status: "queued" | "running" | "pending" | "interaction_required" | "completed" | "failed" | "canceled" | string;
  result?: "success" | "failure" | string | null;
  task_id?: string | null;
  agent_id?: string | null;
  source_id?: string | null;
  credential_id?: string | null;
  session_id?: string | null;
  runtime_ms?: number | null;
  output?: unknown;
  errors?: DeckV2ErrorDetail[] | null;
  interaction?: DeckV2Interaction | null;
  storage?: Array<Record<string, unknown>> | null;
  request_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DeckV2WorkflowRun = {
  id: string; workflow_id: string; status: string; result: string | null;
  session_id: string | null;
  steps: Array<{ name: string; status: string; output: unknown;
    task_runs?: Array<{ task_run_id: string; status: string; result: string | null; item?: unknown }> | null }>;
};

export type DeckV2Session = { id: string; status: string; task_runs: Array<{ id: string; credential_id: string }> };

export type DeckV2Credential = {
  id: string;
  status: string;
  source_id: string;
  external_id?: string | null;
  persistence?: { enabled?: boolean } | null;
  request_id?: string | null;
};

export type DeckV2Source = {
  id: string;
  name: string;
  type: string;
  website?: { url?: string | null } | null;
  request_id?: string | null;
};

type DeckV2List<T> = {
  data: T[];
  has_more?: boolean;
  next_cursor?: string | null;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
};

function apiKey() {
  const value = process.env.DECK_API_KEY?.trim();
  if (!value) throw new Error("Deck v2 is not configured.");
  return value;
}

function baseUrl() {
  return (process.env.DECK_BASE_URL?.trim() || "https://api.deck.co/v2").replace(/\/$/, "");
}
async function deckRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    signal: AbortSignal.timeout(options.timeoutMs ?? 25_000),
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      "User-Agent": "Rezlee/0.1 (+https://rezlee.com)",
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  const raw = await response.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const envelope = data && typeof data === "object" ? data as Record<string, unknown> : null;
    const errors = envelope?.errors;
    const detail = Array.isArray(errors) && errors[0] && typeof errors[0] === "object"
      ? errors[0] as DeckV2ErrorDetail
      : undefined;
    const requestId = typeof envelope?.request_id === "string" ? envelope.request_id : null;
    throw new DeckV2ApiError({
      status: response.status,
      detail,
      requestId,
      fallback: raw && raw.length < 180 ? raw : undefined,
    });
  }

  return data as T;
}

export function createDeckV2Client() {
  return {
    createAuthToken() {
      return deckRequest<{ token: string; expires_at: string }>("/token", { method: "POST", timeoutMs: 15000 });
    },
    updateCredentialExternalId(credentialId: string, externalId: string) {
      return deckRequest<DeckV2Credential>(`/credentials/${encodeURIComponent(credentialId)}`, { method: "PATCH", body: { external_id: externalId } });
    },
    listSources(input: { search?: string; cursor?: string } = {}) {
      const query = new URLSearchParams({ limit: "100" });
      if (input.search) query.set("search", input.search);
      if (input.cursor) query.set("cursor", input.cursor);
      return deckRequest<DeckV2List<DeckV2Source>>(`/sources?${query.toString()}`);
    },

    createSource(input: {
      name: string;
      url: string;
      idempotencyKey: string;
    }) {
      return deckRequest<DeckV2Source>("/sources", {
        method: "POST",
        idempotencyKey: input.idempotencyKey,
        body: {
          name: input.name,
          type: "website",
          website: { url: input.url },
        },
      });
    },

    getTask(taskId: string) {
      return deckRequest<Record<string, unknown>>(`/tasks/${taskId}`);
    },

    updateTask(input: {
      taskId: string;
      patch: Record<string, unknown>;
      idempotencyKey: string;
    }) {
      return deckRequest<Record<string, unknown>>(`/tasks/${input.taskId}`, {
        method: "PATCH",
        idempotencyKey: input.idempotencyKey,
        body: input.patch,
      });
    },

    createCredential(input: {
      sourceId: string;
      externalId: string;
      username: string;
      password: string;
      sourceFields?: Record<string, string>;
      persistenceEnabled?: boolean;
      idempotencyKey: string;
    }) {
      return deckRequest<DeckV2Credential>("/credentials", {
        method: "POST",
        idempotencyKey: input.idempotencyKey,
        body: {
          source_id: input.sourceId,
          external_id: input.externalId,
          auth_method: "username_password",
          auth_credentials: {
            username: input.username,
            password: input.password,
            ...(input.sourceFields && Object.keys(input.sourceFields).length
              ? { source_fields: input.sourceFields }
              : {}),
          },
          persistence: { enabled: input.persistenceEnabled ?? true },
        },
      });
    },

    runWorkflow(input: { workflowId: string; steps: Array<{ name: string; credential_id: string; input?: Record<string, unknown> }>; idempotencyKey: string }) {
      return deckRequest<DeckV2WorkflowRun>(`/workflows/${encodeURIComponent(input.workflowId)}/run`, {
        method: "POST", idempotencyKey: input.idempotencyKey, body: { steps: input.steps, interactions_suppressed: false },
      });
    },
    getWorkflowRun(id: string) {
      return deckRequest<DeckV2WorkflowRun>(`/workflow-runs/${encodeURIComponent(id)}`);
    },
    cancelWorkflowRun(id: string, idempotencyKey: string) {
      return deckRequest<DeckV2WorkflowRun>(`/workflow-runs/${encodeURIComponent(id)}/cancel`, { method: "POST", idempotencyKey });
    },

    runTask(input: {
      taskId: string;
      credentialId: string;
      taskInput?: Record<string, unknown>;
      sessionId?: string | null;
      idempotencyKey: string;
    }) {
      return deckRequest<DeckV2TaskRun>(`/tasks/${input.taskId}/run`, {
        method: "POST",
        idempotencyKey: input.idempotencyKey,
        body: {
          credential_id: input.credentialId,
          input: input.taskInput ?? {},
          ...(input.sessionId ? { session_id: input.sessionId } : {}),
        },
      });
    },
    getTaskRun(taskRunId: string, includeStorage = true) {
      const query = includeStorage ? "?include=storage" : "";
      return deckRequest<DeckV2TaskRun>(`/task-runs/${taskRunId}${query}`);
    },

    submitInteraction(input: {
      taskRunId: string;
      values: Record<string, string | boolean>;
      idempotencyKey: string;
    }) {
      return deckRequest<DeckV2TaskRun>(`/task-runs/${input.taskRunId}/interaction`, {
        method: "POST",
        idempotencyKey: input.idempotencyKey,
        body: { input: input.values },
      });
    },

    listCredentials(externalId: string) {
      const query = new URLSearchParams({ external_id: externalId, status: "unverified,verified,invalid", limit: "100" });
      return deckRequest<DeckV2List<DeckV2Credential>>(`/credentials?${query.toString()}`);
    },
    getSession(sessionId: string) {
      return deckRequest<DeckV2Session>(`/sessions/${encodeURIComponent(sessionId)}`, { timeoutMs: 12000 });
    },
    endSession(sessionId: string, idempotencyKey: string) {
      return deckRequest<DeckV2Session>(`/sessions/${encodeURIComponent(sessionId)}/end`, { method: "POST", idempotencyKey, timeoutMs: 12000 });
    },
    getCredential(credentialId: string) {
      return deckRequest<DeckV2Credential>(`/credentials/${encodeURIComponent(credentialId)}`);
    },
    cancelTaskRun(taskRunId: string, idempotencyKey: string) {
      return deckRequest<DeckV2TaskRun>(`/task-runs/${encodeURIComponent(taskRunId)}/cancel`, { method: "POST", idempotencyKey });
    },
    deleteCredential(credentialId: string, idempotencyKey: string) {
      return deckRequest<unknown>(`/credentials/${credentialId}`, {
        method: "DELETE",
        idempotencyKey,
      });
    },

    listEventDestinations() {
      return deckRequest<{ data: Array<Record<string, unknown>>; has_more?: boolean; next_cursor?: string | null }>(
        "/event-destinations?limit=100",
      );
    },
  };
}

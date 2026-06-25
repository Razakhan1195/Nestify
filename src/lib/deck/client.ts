import { MockDeckClient } from "@/lib/deck/mock";
import type {
  DeckBill,
  DeckBillPdf,
  DeckClient,
  DeckConnection,
  DeckConnectionSession,
  DeckCredential,
} from "@/lib/deck/types";

class RealDeckClient implements DeckClient {
  private readonly apiKey = process.env.DECK_API_KEY;
  private readonly baseUrl = process.env.DECK_BASE_URL ?? "https://api.deck.co/v2";
  private readonly durhamWaterAgentId = process.env.DECK_DURHAM_WATER_AGENT_ID;
  private readonly durhamWaterSourceId = process.env.DECK_DURHAM_WATER_SOURCE_ID;
  private readonly durhamWaterTaskId = process.env.DECK_DURHAM_WATER_TASK_ID;
  private readonly durhamWaterCredentialId =
    process.env.DECK_DURHAM_WATER_CREDENTIAL_ID;
  private readonly billsByConnection = new Map<string, DeckBill[]>();

  private getDurhamWaterConfig(credentialId?: string) {
    if (!this.apiKey) {
      throw new Error(
        "Deck API key is missing. Set DECK_API_KEY in .env.local after rotating the exposed key."
      );
    }

    if (!this.durhamWaterSourceId || !this.durhamWaterTaskId) {
      throw new Error(
        "Durham Water Deck IDs are missing. Set DECK_DURHAM_WATER_SOURCE_ID and DECK_DURHAM_WATER_TASK_ID."
      );
    }

    return {
      agentId: this.durhamWaterAgentId,
      credentialId: credentialId ?? this.validCredentialId(),
      sourceId: this.durhamWaterSourceId,
      taskId: this.durhamWaterTaskId,
    };
  }

  private validCredentialId() {
    if (
      !this.durhamWaterCredentialId ||
      this.durhamWaterCredentialId === "cred_..." ||
      this.durhamWaterCredentialId.trim() === ""
    ) {
      return undefined;
    }

    return this.durhamWaterCredentialId;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(getDeckErrorMessage(data, response.status));
    }

    return data as T;
  }

  private connectionIdFor(providerId: string) {
    return `deck_durham_water_${providerId}`;
  }

  private mapTaskRunToConnection(
    connectionId: string,
    completedRun: DeckTaskRun
  ): DeckConnection {
    if (completedRun.status === "interaction_required") {
      return {
        connectionId,
        providerName: "Durham Water",
        status: deckStatusForInteraction(completedRun.interaction),
        userActionMessage:
          completedRun.interaction?.message ??
          "Durham Water needs additional verification before syncing can continue.",
        metadata: safeTaskRunMetadata(completedRun),
      };
    }

    if (isActiveTaskRunStatus(completedRun.status)) {
      return {
        connectionId,
        providerName: "Durham Water",
        status: "syncing",
        userActionMessage:
          "Deck is still retrieving the Durham Water bill. Check again in a moment.",
        metadata: safeTaskRunMetadata(completedRun),
      };
    }

    if (completedRun.status !== "completed" || completedRun.result === "failure") {
      return {
        connectionId,
        providerName: "Durham Water",
        status: "failed",
        userActionMessage: getTaskRunFailureMessage(completedRun),
        metadata: safeTaskRunMetadata(completedRun),
      };
    }

    const bills = mapDurhamWaterOutputToBills(completedRun.output);
    this.billsByConnection.set(connectionId, bills);

    return {
      connectionId,
      providerName: "Durham Water",
      status: bills.length ? "connected" : "no_bill_found",
      lastSyncedAt: new Date().toISOString(),
      userActionMessage: bills.length
        ? undefined
        : "Deck completed the Durham Water task, but no bill data was returned.",
      metadata: safeTaskRunMetadata(completedRun),
    };
  }

  private async runDurhamWaterTask(
    connectionId: string,
    credentialId?: string,
    taskRunId?: string
  ) {
    const config = this.getDurhamWaterConfig(credentialId);

    if (!config.credentialId) {
      return {
        connectionId,
        providerName: "Durham Water",
        status: "requires_user_action",
        userActionMessage:
          "Durham Water credentials are not connected yet. Store them in Deck Vault and set DECK_DURHAM_WATER_CREDENTIAL_ID.",
        metadata: {
          agentId: config.agentId,
          sourceId: config.sourceId,
          taskId: config.taskId,
        },
      } satisfies DeckConnection;
    }

    if (taskRunId) {
      return this.mapTaskRunToConnection(
        connectionId,
        await this.pollTaskRun(taskRunId)
      );
    }

    const run = await this.request<DeckTaskRun>(`/tasks/${config.taskId}/run`, {
      method: "POST",
      body: JSON.stringify({
        credential_id: config.credentialId,
        input: {
          agent_id: config.agentId,
          source_id: config.sourceId,
          source_url:
            "https://secure6.i-doxs.net/RegionOfDurham/Secure/ViewBill.aspx",
          provider: "Durham Water",
          category: "Water",
        },
      }),
    });

    return this.mapTaskRunToConnection(connectionId, await this.pollTaskRun(run.id));
  }

  private async pollTaskRun(
    taskRunId: string,
    options: { stopOnInteraction?: boolean } = {}
  ) {
    const terminalStatuses = new Set([
      "completed",
      "failed",
      "canceled",
      ...(options.stopOnInteraction === false ? [] : ["interaction_required"]),
    ]);
    let latestRun: DeckTaskRun | null = null;

    for (let attempt = 0; attempt < 36; attempt += 1) {
      const run = await this.request<DeckTaskRun>(
        `/task-runs/${taskRunId}?include=storage`
      );
      latestRun = run;

      if (terminalStatuses.has(run.status)) {
        return run;
      }

      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }

    if (latestRun) {
      return latestRun;
    }

    throw new Error("Deck task run could not be checked. Try syncing again.");
  }

  async createConnectionSession(input: {
    providerId: string;
    providerName: string;
    category: string;
  }): Promise<DeckConnectionSession> {
    const config = this.getDurhamWaterConfig();

    if (!isDurhamWaterProvider(input.providerName, input.category)) {
      return {
        connectionId: `deck_unsupported_${input.providerId}`,
        providerName: input.providerName,
        status: "needs_attention",
        userActionMessage:
          "Real Deck mode is currently configured only for Durham Water.",
        metadata: { source: "deck", supportedProvider: "Durham Water" },
      };
    }

    return {
      connectionId: this.connectionIdFor(input.providerId),
      providerName: "Durham Water",
      status: config.credentialId ? "created" : "requires_user_action",
      userActionMessage: config.credentialId
        ? "Durham Water is ready to sync through Deck."
        : "Add DECK_DURHAM_WATER_CREDENTIAL_ID after storing Durham Water credentials in Deck Vault.",
      metadata: {
        agentId: config.agentId,
        sourceId: config.sourceId,
        taskId: config.taskId,
      },
    };
  }

  async createCredential(input: {
    providerId: string;
    providerName: string;
    category: string;
    userId: string;
    username: string;
    password: string;
  }): Promise<DeckCredential> {
    const config = this.getDurhamWaterConfig();

    if (!isDurhamWaterProvider(input.providerName, input.category)) {
      throw new Error(
        "Real Deck credential flow is currently configured only for Durham Water."
      );
    }

    const credential = await this.request<DeckCredentialResponse>(
      "/credentials",
      {
        method: "POST",
        body: JSON.stringify({
          auth_method: "username_password",
          auth_credentials: {
            username: input.username,
            password: input.password,
          },
          source_id: config.sourceId,
          external_id: `${input.userId}:${input.providerId}`,
        }),
      }
    );

    return {
      credentialId: credential.id,
      status: credential.status,
      sourceId: credential.source_id,
      metadata: {
        agentId: config.agentId,
        sourceId: config.sourceId,
        taskId: config.taskId,
      },
    };
  }

  async getConnection(connectionId: string): Promise<DeckConnection> {
    return {
      connectionId,
      providerName: connectionId.includes("durham_water")
        ? "Durham Water"
        : "Deck provider",
      status: "connected",
      metadata: { source: "deck" },
    };
  }

  async syncConnection(
    connectionId: string,
    input?: { credentialId?: string; taskRunId?: string }
  ): Promise<DeckConnection> {
    if (!connectionId.includes("durham_water")) {
      return {
        connectionId,
        providerName: "Deck provider",
        status: "needs_attention",
        userActionMessage:
          "Real Deck mode is currently configured only for Durham Water.",
        metadata: { source: "deck" },
      };
    }

    return this.runDurhamWaterTask(
      connectionId,
      input?.credentialId,
      input?.taskRunId
    );
  }

  async submitInteraction(input: {
    connectionId: string;
    taskRunId: string;
    values: Record<string, string>;
  }): Promise<DeckConnection> {
    await this.request<DeckTaskRun>(
      `/task-runs/${input.taskRunId}/interaction`,
      {
        method: "POST",
        body: JSON.stringify({ input: input.values }),
      }
    );

    return this.mapTaskRunToConnection(
      input.connectionId,
      await this.pollTaskRun(input.taskRunId, { stopOnInteraction: false })
    );
  }

  async listBills(connectionId: string): Promise<DeckBill[]> {
    return this.billsByConnection.get(connectionId) ?? [];
  }

  async getBillPdf(): Promise<DeckBillPdf | null> {
    return null;
  }

  async disconnectConnection(connectionId: string): Promise<DeckConnection> {
    this.billsByConnection.delete(connectionId);

    return {
      connectionId,
      providerName: "Durham Water",
      status: "disconnected",
      metadata: { source: "deck" },
    };
  }
}

type DeckTaskRun = {
  id: string;
  status: string;
  result?: string | null;
  output?: unknown;
  errors?: Array<{ message?: string; code?: string; type?: string }> | null;
  interaction?: {
    fields?: Array<{ label?: string; name?: string; type?: string }>;
    message?: string;
    type?: string;
  } | null;
  request_id?: string;
  session_id?: string | null;
  storage?: Array<{
    id?: string;
    file_name?: string;
    file_type?: string;
    file_size?: number | string;
    url?: string | null;
  }>;
};

type DeckCredentialResponse = {
  id: string;
  status: string;
  source_id: string;
};

type DurhamWaterBillOutput = {
  bill_url?: unknown;
  due_date?: unknown;
  bill_date?: unknown;
  amount_due?: unknown;
  account_number?: unknown;
  billing_period?: unknown;
  payment_status?: unknown;
};

function isDurhamWaterProvider(providerName: string, category: string) {
  const text = `${providerName} ${category}`.toLowerCase();
  return text.includes("durham") || text.includes("water");
}

function getDeckErrorMessage(data: unknown, status: number) {
  if (isRecord(data)) {
    const errors = data.errors;

    if (Array.isArray(errors)) {
      const message = errors
        .map((error) =>
          isRecord(error) && typeof error.message === "string"
            ? error.message
            : null
        )
        .filter(Boolean)
        .join(" ");

      if (message) return message;
    }
  }

  return `Deck API request failed with status ${status}.`;
}

function getTaskRunFailureMessage(run: DeckTaskRun) {
  const message = run.errors
    ?.map((error) => error.message)
    .filter(Boolean)
    .join(" ");

  return message || "Deck could not retrieve the Durham Water bill.";
}

function safeTaskRunMetadata(run: DeckTaskRun) {
  return {
    interaction: sanitizeInteraction(run.interaction),
    requestId: run.request_id,
    sessionId: run.session_id,
    status: run.status,
    result: run.result,
    taskRunId: run.id,
  };
}

function sanitizeInteraction(interaction: DeckTaskRun["interaction"]) {
  if (!interaction) return null;

  return {
    fields: Array.isArray(interaction.fields)
      ? interaction.fields
          .map((field, index) => ({
            label: field.label ?? field.name ?? "Security answer",
            name: field.name ?? (index === 0 ? "answer" : `answer_${index + 1}`),
            type: field.type ?? "string",
          }))
          .filter((field) => field.name)
      : [{ label: "Security answer", name: "answer", type: "string" }],
    message: interaction.message ?? "Additional verification is required.",
    type: interaction.type ?? "verification",
  };
}

function deckStatusForInteraction(interaction: DeckTaskRun["interaction"]) {
  return interaction?.type === "mfa" ? "mfa_required" : "requires_user_action";
}

function isActiveTaskRunStatus(status: string) {
  return status === "queued" || status === "running";
}

function mapDurhamWaterOutputToBills(output: unknown): DeckBill[] {
  const candidates = extractBillCandidates(output);

  return candidates.flatMap((candidate) => {
    const bill = candidate as DurhamWaterBillOutput;
    const amountDue = toNumber(bill.amount_due);
    const dueDate = toDateString(bill.due_date);
    const issueDate = toDateString(bill.bill_date) ?? dueDate;

    if (amountDue === null || !dueDate || !issueDate) {
      return [];
    }

    const accountNumber = toStringValue(bill.account_number);
    const [billingPeriodStart, billingPeriodEnd] = parseBillingPeriod(
      toStringValue(bill.billing_period)
    );

    return [
      {
        externalBillId: [
          "durham-water",
          maskAccountNumber(accountNumber).replaceAll(" ", ""),
          issueDate,
          dueDate,
        ].join("-"),
        providerName: "Durham Water",
        category: "Water",
        amountDue,
        currency: "CAD",
        dueDate,
        issueDate,
        billingPeriodStart: billingPeriodStart ?? issueDate,
        billingPeriodEnd: billingPeriodEnd ?? dueDate,
        accountNumberMasked: maskAccountNumber(accountNumber),
        pdfAvailable: false,
        lineItems: [{ label: "Water utility bill", amount: amountDue }],
        detectedFees: [],
        rawData: {
          billUrl: toStringValue(bill.bill_url),
          paymentStatus: toStringValue(bill.payment_status),
          billingPeriod: toStringValue(bill.billing_period),
        },
      },
    ];
  });
}

function extractBillCandidates(output: unknown): unknown[] {
  if (Array.isArray(output)) return output;
  if (!isRecord(output)) return [];

  if (Array.isArray(output.bills)) return output.bills;
  if (Array.isArray(output.water_bills)) return output.water_bills;

  return [output];
}

function parseBillingPeriod(period: string | null) {
  if (!period) return [null, null] as const;

  const [start, end] = period.split(/\s+to\s+/i);
  return [toDateString(start), toDateString(end)] as const;
}

function maskAccountNumber(accountNumber: string | null) {
  if (!accountNumber) return "****";
  const visible = accountNumber.slice(-4);
  return `**** ${visible}`;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toDateString(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createDeckClient(): DeckClient {
  const mockMode = process.env.DECK_MOCK_MODE !== "false";

  if (mockMode) {
    return new MockDeckClient();
  }

  return new RealDeckClient();
}

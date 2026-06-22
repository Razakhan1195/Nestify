import Link from "next/link";
import {
  AlertCircle,
  BadgeCheck,
  FileText,
  FolderOpen,
  Hammer,
  Landmark,
  PackageCheck,
  ReceiptText,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { redirect } from "next/navigation";

import { createDocumentRecord } from "@/app/actions";
import { ActionFeedbackToast } from "@/components/product/action-feedback-toast";
import { AttentionActionMenu } from "@/components/product/attention-action-menu";
import { OpenDetailsOnHash } from "@/components/product/open-details-on-hash";
import { SubmitButton } from "@/components/submit-button";
import {
  EmptyState,
  InsightCard,
  MetricCard,
  PageHeader,
  PageSection,
  PageShell,
  PrimaryCTA,
  ProductCard,
  SecondaryCTA,
  SectionHeader,
} from "@/components/product/design-system";
import { Badge } from "@/components/ui/badge";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireCurrentUserHome } from "@/lib/homes";
import { createClient } from "@/lib/supabase/server";

type ProviderRelation =
  | { display_name: string | null; name: string }
  | { display_name: string | null; name: string }[]
  | null;

type DocumentRow = {
  id: string;
  title: string;
  document_type: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  issued_on: string | null;
  expires_on: string | null;
  source: string | null;
  created_at: string;
  providers: ProviderRelation;
};

type DocumentsPageProps = {
  searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }>;
};

function providerName(value: ProviderRelation) {
  if (!value) return "Household record";
  if (Array.isArray(value)) return providerName(value[0] ?? null);
  return value.display_name ?? value.name;
}

function formatDate(value: string | null) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

const vaultCategories = [
  { icon: ScrollText, key: "lease", label: "Lease / rental", description: "Lease terms and rental proof" },
  { icon: ShieldCheck, key: "insurance", label: "Insurance", description: "Policies and renewals" },
  { icon: ReceiptText, key: "bill", label: "Bills & PDFs", description: "Bill records and synced PDFs" },
  { icon: BadgeCheck, key: "warranty", label: "Warranties", description: "Coverage and expiry dates" },
  { icon: FileText, key: "receipt", label: "Receipts", description: "Proof of purchase" },
  { icon: ScrollText, key: "manual", label: "Manuals", description: "Model and care info" },
  { icon: Hammer, key: "invoice", label: "Contractor / service invoices", description: "Work history and costs" },
  { icon: Landmark, key: "property_tax", label: "Property tax", description: "Installments and notices" },
  { icon: PackageCheck, key: "inventory", label: "Inventory", description: "Appliances and household items" },
];

function categoryCount(documents: DocumentRow[], key: string) {
  if (key === "inventory") return null;

  return documents.filter((document) => {
    const haystack = [
      document.document_type,
      document.source,
      document.file_name,
      document.title,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(key.replace("_", " "));
  }).length;
}

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const [{ error: pageError, notice }, supabase] = await Promise.all([
    searchParams,
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const home = await requireCurrentUserHome(user.id);
  const { data: documents, error } = await supabase
    .from("documents")
    .select(
      "id,title,document_type,storage_path,file_name,mime_type,issued_on,expires_on,source,created_at,providers(display_name,name)"
    )
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("created_at", { ascending: false });

  const documentRows = (documents ?? []) as unknown as DocumentRow[];
  const expiringDocuments = documentRows.filter((document) => {
    if (!document.expires_on) return false;
    const daysUntil =
      (new Date(`${document.expires_on}T00:00:00`).getTime() -
        new Date().getTime()) /
      86_400_000;
    return daysUntil <= 60;
  });

  return (
    <PageShell>
      <PageHeader
        eyebrow="Home records"
        title="Store proof and find it in seconds"
        description="Policies, receipts, manuals, warranties, bill PDFs, property tax notices, and household records organized by category."
        actions={
          <PrimaryCTA asChild>
            <a href="#add-record">Add record</a>
          </PrimaryCTA>
        }
      />

      {typeof pageError === "string" ? (
        <InsightCard
          description={pageError}
          icon={AlertCircle}
          severity="critical"
          title="Could not save record"
        />
      ) : null}

      <ActionFeedbackToast message={typeof notice === "string" ? notice : null} />
      <OpenDetailsOnHash ids={["add-record"]} />

      {error ? (
        <InsightCard
          description={error.message}
          icon={AlertCircle}
          severity="critical"
          title="Could not load documents"
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard icon={FileText} title={documentRows.length.toString()} description="Saved records" />
        <MetricCard icon={ShieldCheck} title={expiringDocuments.length.toString()} description="Renewals soon" />
        <MetricCard
          icon={FolderOpen}
          title={documentRows.filter((document) => document.source === "deck").length.toString()}
          description="From providers"
        />
      </div>

      <PageSection>
        <SectionHeader
          title="Record categories"
          description="Records grouped by the way households need to find proof later."
        />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {vaultCategories.map((item) => {
            const count = categoryCount(documentRows, item.key);

            return (
              <ProductCard className="shadow-none transition-colors hover:bg-muted/25" key={item.label} variant="compact">
                <CardHeader className="p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-primary/8 text-primary">
                      <item.icon className="size-4" />
                    </div>
                    {count === null ? (
                      <Badge variant="outline">Linked</Badge>
                    ) : (
                      <Badge variant="outline">{count}</Badge>
                    )}
                  </div>
                  <CardTitle className="text-sm">{item.label}</CardTitle>
                  <CardDescription className="text-xs">{item.description}</CardDescription>
                </CardHeader>
              </ProductCard>
            );
          })}
        </div>
      </PageSection>

      <ProductCard variant="record">
        <CardHeader>
          <CardTitle>Records become household history</CardTitle>
          <CardDescription>
            Provider PDFs, receipts, policies, warranties, manuals, and invoices are
            more useful when they live beside bills and care reminders.
          </CardDescription>
        </CardHeader>
      </ProductCard>

      <PageSection>
        <SectionHeader title="Recent records" description="The latest proof, policies, bills, and household files." />
        {documentRows.length ? (
          <div className="grid gap-0">
            {documentRows.map((document) => (
              <div className="border-b border-border/60 py-3 last:border-b-0" key={document.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{document.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {providerName(document.providers)} ·{" "}
                        {document.file_name ?? document.mime_type ?? "Document"}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {document.document_type ?? document.source ?? "Record"}
                    </Badge>
                  </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <SecondaryCTA asChild size="sm">
                    <Link href="/app/documents">View record</Link>
                  </SecondaryCTA>
                  <AttentionActionMenu
                    context={{
                      attentionKey: `document-review-${document.id}`,
                      eventType: "document_review",
                      relatedId: document.id,
                      relatedTable: "documents",
                      returnPath: "/app/documents",
                    }}
                  />
                </div>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-muted-foreground">Issued</p>
                    <p className="font-medium">{formatDate(document.issued_on)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Expires</p>
                    <p className="font-medium">{formatDate(document.expires_on)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Source</p>
                    <p className="font-medium">
                      {document.source === "deck"
                        ? "Provider sync"
                        : document.source ?? "Manual"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="Your Vault is empty"
            description="Vault is where important records live before you need them."
            action={
              <SecondaryCTA asChild>
                <a href="#add-record">Add document</a>
              </SecondaryCTA>
            }
          />
        )}
      </PageSection>

      <details className="rounded-2xl border bg-muted/20 p-4" id="add-record">
        <summary className="cursor-pointer font-medium">Add document</summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Save a document manually when a provider PDF or upload is not available yet.
        </p>
        <form action={createDocumentRecord} className="mt-4 grid gap-4 lg:grid-cols-4">
          <div className="grid gap-2 lg:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="Home insurance policy" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <select
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
              id="category"
              name="category"
              required
            >
              <option value="">Choose</option>
              <option value="lease">Lease / rental</option>
              <option value="tenant_insurance">Tenant insurance</option>
              <option value="home_insurance">Home insurance</option>
              <option value="property_tax">Property tax</option>
              <option value="warranty">Warranty</option>
              <option value="bill_pdf">Bill PDF</option>
              <option value="contractor_invoice">Contractor invoice</option>
              <option value="manual">Manual</option>
              <option value="receipt">Receipt</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="issued_on">Date optional</Label>
            <Input id="issued_on" name="issued_on" type="date" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="expires_on">Renewal/expiry</Label>
            <Input id="expires_on" name="expires_on" type="date" />
          </div>
          <div className="grid gap-2 lg:col-span-4">
            <Label htmlFor="notes">Notes optional</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Policy number, renewal detail, or where the file lives."
              rows={3}
            />
          </div>
          <SubmitButton
            className="lg:col-span-4 lg:w-fit"
            label="Save document"
            pendingLabel="Saving document..."
            variant="outline"
          />
        </form>
      </details>
    </PageShell>
  );
}

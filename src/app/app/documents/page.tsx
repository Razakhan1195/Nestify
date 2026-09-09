import { isOwnedDocumentPath } from "@/lib/documents";
import Link from "next/link";
import { FilterLinks } from "@/components/product/filter-links";
import { SubmitButton } from "@/components/submit-button";
import {
  Calendar,
  FileText,
  FolderOpen,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { redirect } from "next/navigation";

import { createDocumentRecord } from "@/app/actions";
import { ScanCard } from "@/components/ai/scan-card";
import { EmptyState } from "@/components/empty-state";
import { ActionFeedbackToast } from "@/components/product/action-feedback-toast";
import { DeleteRecordButton } from "@/components/product/delete-record-button";
import { PageHeader, PageShell } from "@/components/product/design-system";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  created_at: string;
  document_type: string | null;
  expires_on: string | null;
  file_name: string | null;
  id: string;
  issued_on: string | null;
  mime_type: string | null;
  providers: ProviderRelation;
  source: string | null;
  storage_path: string | null;
  title: string;
  notes: string | null;
  provider_id: string | null;
};

type DocumentsPageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    provider?: string;
    error?: string | string[];
    notice?: string | string[];
  }>;
};

const docCategories = [
  "Insurance",
  "Warranty",
  "Manual",
  "Receipt",
  "Tax",
  "Contract",
  "Lease",
  "Other",
] as const;

const missingDocs = [
  "Lease or ownership record",
  "Appliance receipts for warranty claims",
  "Home or tenant insurance policy",
  "Important service agreement",
];

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value.includes("T") ? value : `${value}T00:00:00`));
}

function documentCategory(document: DocumentRow) {
  const haystack = [
    document.document_type,
    document.title,
    document.file_name,
    document.source,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("insurance")) return "Insurance";
  if (haystack.includes("warranty")) return "Warranty";
  if (haystack.includes("manual")) return "Manual";
  if (haystack.includes("receipt") || haystack.includes("invoice"))
    return "Receipt";
  if (haystack.includes("tax")) return "Tax";
  if (haystack.includes("lease")) return "Lease";
  if (haystack.includes("contract")) return "Contract";
  return "Other";
}

function sizeLabel(document: DocumentRow) {
  return document.file_name
    ? "Saved file"
    : document.source === "deck"
      ? "Provider record"
      : "Record";
}

export default async function DocumentsPage({
  searchParams,
}: DocumentsPageProps) {
  const [
    { error: pageError, notice, q = "", category = "all", provider },
    supabase,
  ] = await Promise.all([searchParams, createClient()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const home = await requireCurrentUserHome(user.id);
  const { data: documents, error } = await supabase
    .from("documents")
    .select(
      "id,title,notes,provider_id,document_type,storage_path,file_name,mime_type,issued_on,expires_on,source,created_at,providers(display_name,name)",
    )
    .eq("user_id", user.id)
    .eq("home_id", home.id)
    .order("created_at", { ascending: false });

  const documentRows = (documents ?? []) as unknown as DocumentRow[];
  const categoryCounts = docCategories.map((category) => ({
    category,
    count: documentRows.filter(
      (document) => documentCategory(document) === category,
    ).length,
  }));

  const selectedCategory = docCategories.some((value) => value === category)
    ? category
    : "all";
  const query = q.trim().slice(0, 200);
  const visibleDocuments = documentRows.filter(
    (document) =>
      (selectedCategory === "all" ||
        documentCategory(document) === selectedCategory) &&
      (!provider || document.provider_id === provider) &&
      [
        document.title,
        document.document_type,
        document.file_name,
        document.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <PageShell>
      <PageHeader
        eyebrow="Keep"
        title="Vault"
        description="Your household memory. Keep the details and proof you will want later."
        actions={
          <Button asChild size="sm">
            <a href="#add-document">
              <Upload className="size-4" />
              Add document
            </a>
          </Button>
        }
      />

      {typeof pageError === "string" || error ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Document issue</CardTitle>
            <CardDescription className="text-destructive">
              {typeof pageError === "string"
                ? pageError
                : "We could not load these records. Please try again shortly."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <ActionFeedbackToast
        message={typeof notice === "string" ? notice : null}
      />

      <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <form action="/app/documents" className="flex gap-2" role="search">
            <Label htmlFor="document-search" className="sr-only">
              Search Vault
            </Label>
            <Input
              id="document-search"
              name="q"
              defaultValue={query}
              placeholder="Search titles, categories, and notes"
            />
            <Button type="submit" variant="outline">
              <Search className="size-4" />
              <span className="sr-only">Search</span>
            </Button>
          </form>
          <FilterLinks
            basePath="/app/documents"
            param="category"
            selected={selectedCategory}
            query={query}
            options={[
              { value: "all", label: "All", count: documentRows.length },
              ...categoryCounts.map(({ category, count }) => ({
                value: category,
                label: category,
                count,
              })),
            ]}
          />
          {provider ? (
            <p className="text-sm text-muted-foreground">
              Showing records for this provider.{" "}
              <Link href="/app/documents" className="underline">
                Show all records
              </Link>
            </p>
          ) : null}
          <SectionCard
            description="Policies, receipts, manuals, and proof — all in one place"
            icon={FileText}
            title="Your records"
          >
            {visibleDocuments.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleDocuments.map((document) => (
                  <div
                    className="flex flex-col gap-3 rounded-xl border bg-card p-4"
                    key={document.id}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <FileText className="size-5" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <p className="font-medium leading-tight text-pretty">
                          {document.title}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {documentCategory(document)} · {sizeLabel(document)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3.5" />
                        Added {formatDate(document.created_at)}
                      </span>
                      {document.expires_on ? (
                        <span>Expires {formatDate(document.expires_on)}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 border-t pt-3">
                      <details className="min-w-0 flex-1">
                        <summary className="cursor-pointer py-2 text-sm font-medium text-primary">
                          Record details
                        </summary>
                        <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                          <p>{document.notes || "No notes saved."}</p>
                          <p>Issued: {formatDate(document.issued_on)}</p>
                          <p>
                            {document.file_name
                              ? `File: ${document.file_name}`
                              : "No original file attached. Keep your original copy."}
                          </p>
                          {document.storage_path &&
                          isOwnedDocumentPath(
                            document.storage_path,
                            user.id,
                            home.id,
                          ) ? (
                            <Link
                              className="inline-flex min-h-11 items-center font-medium text-primary underline"
                              href={`/api/documents/${document.id}/download`}
                            >
                              Open saved file
                            </Link>
                          ) : null}
                          <Link
                            className="block py-2 text-primary underline"
                            href="/app/assistant"
                          >
                            Ask about your household records
                          </Link>
                        </div>
                      </details>
                      <DeleteRecordButton
                        iconOnly
                        id={document.id}
                        kind="document"
                        label={`Delete ${document.title}`}
                        returnPath="/app/documents"
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FolderOpen}
                title="No records in this view"
                description="Try another search or category, or save your first household record below."
              />
            )}
          </SectionCard>

          <SectionCard
            className="scroll-mt-24"
            description="Save a policy, receipt, manual, or any home record so it is easy to find later."
            icon={Plus}
            title="Add a document"
          >
            <div className="mb-5">
              <ScanCard kind="document" />
            </div>
            <span id="add-record" />
            <form
              action={createDocumentRecord}
              className="grid gap-4 lg:grid-cols-4"
              id="add-document"
            >
              <div className="grid gap-2 lg:col-span-2">
                <Label htmlFor="title">Document name</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Home insurance policy"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  name="category"
                  placeholder="Insurance, warranty"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expires_on">Expiry date</Label>
                <Input id="expires_on" name="expires_on" type="date" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="issued_on">Issue date</Label>
                <Input id="issued_on" name="issued_on" type="date" />
              </div>
              <div className="grid gap-2 lg:col-span-4">
                <Label htmlFor="record_file">Original file (optional)</Label>
                <Input
                  id="record_file"
                  name="record_file"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                />
                <p className="text-xs text-muted-foreground">
                  PDF, JPG, PNG, or WebP up to 10 MB. A scan extracts details;
                  attach the original here if you want to keep it.
                </p>
              </div>
              <div className="grid gap-2 lg:col-span-4">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="Anything to remember about this document"
                />
              </div>
              <SubmitButton
                className="lg:col-span-4 lg:w-fit"
                label="Save record"
                pendingLabel="Saving..."
              />
            </form>
          </SectionCard>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-1">
          <SectionCard
            description="Common records worth keeping safe"
            icon={Plus}
            title="Suggested to add"
          >
            <div className="flex flex-col gap-2">
              {missingDocs.map((document) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                  key={document}
                >
                  <span className="text-sm leading-snug">{document}</span>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs"
                  >
                    <a href="#add-document">
                      <Plus className="size-3.5" />
                      Add
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </PageShell>
  );
}

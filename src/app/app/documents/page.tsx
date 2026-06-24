import {
  Calendar,
  Download,
  FileText,
  FolderOpen,
  Plus,
  Search,
  Sparkles,
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
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
};

type DocumentsPageProps = {
  searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }>;
};

const docCategories = [
  "Insurance",
  "Warranty",
  "Manual",
  "Receipt",
  "Tax",
  "Contract",
] as const;

const missingDocs = [
  "Home warranty document",
  "Appliance receipts for warranty claims",
  "Mortgage statement",
  "Property tax notice",
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
  const haystack = [document.document_type, document.title, document.file_name, document.source]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("insurance")) return "Insurance";
  if (haystack.includes("warranty")) return "Warranty";
  if (haystack.includes("manual")) return "Manual";
  if (haystack.includes("receipt") || haystack.includes("invoice")) return "Receipt";
  if (haystack.includes("tax")) return "Tax";
  if (haystack.includes("contract")) return "Contract";
  return "Receipt";
}

function sizeLabel(document: DocumentRow) {
  return document.file_name ? "Saved file" : document.source === "deck" ? "Provider record" : "Record";
}

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const [{ error: pageError, notice }, supabase] = await Promise.all([
    searchParams,
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

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
  const categoryCounts = docCategories.map((category) => ({
    category,
    count: documentRows.filter((document) => documentCategory(document) === category).length,
  }));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Documents"
        title="Documents"
        description="Policies, receipts, manuals, and proof — all in one place."
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
              {typeof pageError === "string" ? pageError : error?.message}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <ActionFeedbackToast message={typeof notice === "string" ? notice : null} />

      <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search documents..." readOnly />
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                All <span className="ml-1 opacity-70">{documentRows.length}</span>
              </span>
              {categoryCounts.map(({ category, count }) => (
                <span
                  className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
                  key={category}
                >
                  {category}
                  <span className="ml-1 opacity-70">{count}</span>
                </span>
              ))}
            </div>
          </div>

          <SectionCard
            action={
              <Button asChild size="sm">
                <a href="#add-document">
                  <Upload className="size-4" />
                  Add document
                </a>
              </Button>
            }
            description="Policies, receipts, manuals, and proof — all in one place"
            icon={FileText}
            title="Your documents"
          >
            {documentRows.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {documentRows.map((document) => (
                  <div className="flex flex-col gap-3 rounded-xl border bg-card p-4" key={document.id}>
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <FileText className="size-5" />
                      </span>
                      <div className="flex flex-1 flex-col gap-0.5">
                        <p className="font-medium leading-tight text-pretty">{document.title}</p>
                        <span className="text-xs text-muted-foreground">
                          {documentCategory(document)} · {sizeLabel(document)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-x-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3.5" />
                        Added {formatDate(document.created_at)}
                      </span>
                      {document.expires_on ? <span>Expires {formatDate(document.expires_on)}</span> : null}
                    </div>
                    <div className="flex items-center gap-2 border-t pt-3">
                      <Button variant="outline" size="sm" className="h-7 flex-1 gap-1 text-xs">
                        <Sparkles className="size-3.5" />
                        AI summary
                      </Button>
                      <DeleteRecordButton
                        iconOnly
                        id={document.id}
                        kind="document"
                        label={`Delete ${document.title}`}
                        returnPath="/app/documents"
                      />
                      <Button variant="ghost" size="icon-sm" aria-label="Download">
                        <Download className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FolderOpen}
                title="Nothing here yet"
                description="Add a policy, receipt, manual, or bill PDF so it is easy to find later."
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
            <form action={createDocumentRecord} className="grid gap-4 lg:grid-cols-4" id="add-document">
              <div className="grid gap-2 lg:col-span-2">
                <Label htmlFor="title">Document name</Label>
                <Input id="title" name="title" placeholder="Home insurance policy" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Input id="category" name="category" placeholder="Insurance, warranty" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expires_on">Expiry date</Label>
                <Input id="expires_on" name="expires_on" type="date" />
              </div>
              <div className="grid gap-2 lg:col-span-4">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" placeholder="Anything to remember about this document" />
              </div>
              <Button className="lg:col-span-4 lg:w-fit" type="submit">
                Save document
              </Button>
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
                  <Button asChild size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs">
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

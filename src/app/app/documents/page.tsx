import Link from "next/link";
import { FileText, FolderOpen, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { createDocumentRecord } from "@/app/actions";
import { EmptyState } from "@/components/product/empty-state";
import { PageHeader } from "@/components/product/page-header";
import { StatCard } from "@/components/product/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  searchParams: Promise<{ error?: string | string[] }>;
};

function providerName(value: ProviderRelation) {
  if (!value) return "Home record";
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

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const [{ error: pageError }, supabase] = await Promise.all([
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
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Home records"
        title="Home Vault"
        description="The place for policies, property tax bills, warranties, provider PDFs, receipts, manuals, and renewal records."
        actions={
        <Button asChild variant="outline">
          <Link href="/app/providers">Connect providers</Link>
        </Button>
        }
      />

      {typeof pageError === "string" ? (
        <Card className="rounded-lg border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Could not save record</CardTitle>
            <CardDescription className="text-destructive">{pageError}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {error ? (
        <Card className="rounded-lg border-destructive/30 bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">
              Could not load documents
            </CardTitle>
            <CardDescription className="text-destructive">
              {error.message}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={FileText} title={documentRows.length.toString()} description="Saved records" />
        <StatCard icon={ShieldCheck} title={expiringDocuments.length.toString()} description="Renewals soon" />
        <StatCard
          icon={FolderOpen}
          title={documentRows.filter((document) => document.source === "deck").length.toString()}
          description="From providers"
        />
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Add a vault record</CardTitle>
          <CardDescription>
            Save the existence of an important document now. File upload and AI
            extraction can come later without losing the reminder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createDocumentRecord} className="grid gap-4 lg:grid-cols-4">
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="title">Document</Label>
              <Input id="title" name="title" placeholder="Home insurance policy" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <select className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm" id="category" name="category">
                <option value="">Choose</option>
                <option value="insurance">Insurance</option>
                <option value="property_tax">Property tax</option>
                <option value="warranty">Warranty</option>
                <option value="manual">Manual</option>
                <option value="receipt">Receipt</option>
                <option value="permit">Permit</option>
                <option value="quote">Quote</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expires_on">Renewal/expiry</Label>
              <Input id="expires_on" name="expires_on" type="date" />
            </div>
            <Button className="lg:col-span-4 lg:w-fit" type="submit">Save record</Button>
          </form>
        </CardContent>
      </Card>

      {documentRows.length ? (
        <div className="grid gap-4">
          {documentRows.map((document) => (
            <Card className="rounded-lg" key={document.id}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>{document.title}</CardTitle>
                    <CardDescription>
                      {providerName(document.providers)} ·{" "}
                      {document.file_name ?? document.mime_type ?? "Document"}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    {document.document_type ?? document.source ?? "Record"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
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
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="Your Home Vault is empty"
          description="Add insurance, warranty, property tax, manuals, permits, and renovation records so important home details stop living in scattered folders."
        />
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
type Snapshot = {
  rows: {
    id: string;
    email: string;
    status: string;
    slot: number | null;
    created_at: string;
    confirmed_at: string | null;
    delivery_status: string;
    email_verified_at: string | null;
  }[];
  page: number;
  pageSize: number;
  total: number;
  allocated: number;
  heldBack: number;
  remaining: number;
  pending: number;
  confirmed: number;
  unsubscribed: number;
  updatedAt: string;
};
export function WaitlistDashboard() {
  const router = useRouter(),
    [page, setPage] = useState(0),
    [revision, setRevision] = useState(0),
    [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/admin/waitlist?page=" + page, {
      cache: "no-store",
      signal: c.signal,
    })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          router.replace("/admin/access");
          return;
        }
        if (!r.ok) throw Error();
        const snapshot = await r.json();
        if (!c.signal.aborted) {
          setData(snapshot);
          setError("");
        }
      })
      .catch(() => {
        if (!c.signal.aborted)
          setError(
            "Could not update the list. Any previous results below may be out of date.",
          );
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [page, revision, router]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") setRevision((v) => v + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  const changePage = (n: number) => {
    setBusy(true);
    setData(null);
    setPage(n);
  };
  return (
    <main className="mx-auto max-w-5xl space-y-7 px-5 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <a href="/admin" className="text-sm text-primary">
            Rezlee control center
          </a>
          <h1 className="mt-3 text-3xl font-semibold">Founding members</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Public waitlist reservations and campaign allocations are tracked separately.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setRevision((v) => v + 1);
          }}
        >
          {busy ? "Refreshing…" : "Refresh list"}
        </Button>
      </header>
      {error ? (
        <p role="alert" className="rounded-xl border border-destructive p-4">
          {error}
        </p>
      ) : null}
      {!data && !error ? <p role="status">Loading signups…</p> : null}
      {data ? (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Reserved by people", data.allocated],
              ["Held back from public signup", data.heldBack],
              ["Public places remaining", data.remaining],
              ["Joined", data.confirmed],
              ["Legacy pending", data.pending],
              ["Unsubscribed", data.unsubscribed],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-3xl font-semibold">
                  {value.toLocaleString()}
                </p>
              </div>
            ))}
          </section>
          <p className="text-sm text-muted-foreground">
            Updated {new Date(data.updatedAt).toLocaleString()}. Refreshes every
            minute while this page is visible. Unsubscribing stops emails; an
            existing lifetime reservation remains.
          </p>
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full min-w-[650px] text-left text-sm">
              <caption className="sr-only">
                Waitlist signups, newest first
              </caption>
              <thead className="border-b">
                <tr>
                  {[
                    "Email",
                    "Status",
                    "Lifetime place",
                    "Email ownership",
                    "Joined",
                  ].map((x) => (
                    <th key={x} scope="col" className="p-4">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="p-4">{row.email}</td>
                    <td className="p-4">{row.status === "confirmed" ? "Joined" : row.status}</td>
                    <td className="p-4">{row.slot ? "#" + row.slot : "—"}</td>
                    <td className="p-4">
                      {row.email_verified_at ? "Verified" : "Not verified — signup complete"}
                    </td>
                    <td className="p-4">
                      {new Date(row.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.rows.length ? (
              <p className="p-8 text-center text-muted-foreground">
                No signups yet. New and existing signups will appear here.
              </p>
            ) : null}
          </div>
          <footer className="flex items-center justify-between gap-3">
            <p className="text-sm">
              Page {page + 1} · {data.total} signups
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busy || page === 0}
                onClick={() => changePage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={busy || (page + 1) * data.pageSize >= data.total}
                onClick={() => changePage(page + 1)}
              >
                Next
              </Button>
            </div>
          </footer>
          <p className="text-xs text-muted-foreground">
            Joining does not verify email ownership. Respect recorded consent,
            unsubscribe status and delivery suppression before sending updates. Access to this list is
            restricted and logged.
          </p>
        </>
      ) : null}
    </main>
  );
}

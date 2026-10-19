import { useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ShieldAlert, X } from "lucide-react";
import { useListRisks, getListRisksQueryKey } from "@workspace/api-client-react";
import type { ListRisksParams, RiskSeverity, RiskStatus } from "@workspace/api-client-react";
import { PageHeader, Skel, EmptyState, ErrorState, SeverityChip, StatusChip, SEVERITIES, STATUSES, sevStyle, ago, btnGhost } from "@/components/kit";
import { cn } from "@/lib/utils";

function Seg<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value?: T; onChange: (v?: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <div className="inline-flex overflow-hidden rounded-sm border border-border bg-card">
        <button onClick={() => onChange(undefined)} data-testid={`filter-${label}-all`} className={cn("px-2.5 py-1 text-xs transition-colors", !value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>All</button>
        {options.map((o) => (
          <button key={o} onClick={() => onChange(o)} data-testid={`filter-${label}-${o}`} className={cn("flex items-center gap-1.5 border-l border-border px-2.5 py-1 text-xs capitalize transition-colors", value === o ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {sevStyle[o] && <span className={cn("size-1.5 rounded-full", sevStyle[o].dot)} />}{o}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Risks() {
  const [, navigate] = useLocation();
  const qs = new URLSearchParams(useSearch());
  const sevQ = qs.get("severity"); const stQ = qs.get("status");
  const severity = (SEVERITIES as readonly string[]).includes(sevQ ?? "") ? (sevQ as RiskSeverity) : undefined;
  const status = (STATUSES as readonly string[]).includes(stQ ?? "") ? (stQ as RiskStatus) : undefined;
  const params = useMemo<ListRisksParams>(() => ({ ...(severity && { severity }), ...(status && { status }) }), [severity, status]);
  const risks = useListRisks(params, { query: { queryKey: getListRisksQueryKey(params) } });

  const setFilter = (k: "severity" | "status", v?: string) => {
    const n = new URLSearchParams({ ...(severity && { severity }), ...(status && { status }) });
    if (v) n.set(k, v); else n.delete(k);
    const s = n.toString(); navigate(s ? `/risks?${s}` : "/risks");
  };
  const filtered = !!(severity || status);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Risk register" title="Risks" meta={risks.data ? `${risks.data.length} ${filtered ? "matching" : "total"}` : " "} />
      <div className="flex flex-col gap-2.5 rise">
        <Seg label="severity" options={SEVERITIES} value={severity} onChange={(v) => setFilter("severity", v)} />
        <Seg label="status" options={STATUSES} value={status} onChange={(v) => setFilter("status", v)} />
      </div>

      {risks.isError ? <ErrorState error={risks.error} onRetry={() => risks.refetch()} /> : (
        <div className="overflow-hidden rounded-md border border-card-border bg-card">
          <div className="hidden grid-cols-[90px_1fr_110px_70px_70px_100px] gap-4 border-b border-border px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground md:grid">
            <span>Severity</span><span>Risk</span><span>Status</span><span className="text-right">Quotes</span><span className="text-right">Actions</span><span>Updated</span>
          </div>
          {risks.isLoading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="border-b border-border px-4 py-3.5"><Skel className="h-4" /></div>)
            : !risks.data?.length ? (filtered
              ? <EmptyState testId="empty-risks-filtered" icon={<X className="size-5" />} title="Nothing matches these filters" body="No risks carry this combination of severity and status." action={<button className={btnGhost} onClick={() => navigate("/risks")} data-testid="button-clear-filters">Clear filters</button>} />
              : <EmptyState testId="empty-risks" icon={<ShieldAlert className="size-5" />} title="The register is empty" body="Risks are identified from documents, each one backed by verbatim quotes. None have been recorded yet." action={<Link href="/documents" className={btnGhost} data-testid="link-go-documents">Go to documents</Link>} />)
            : risks.data.map((r, i) => (
              <Link key={r.id} href={`/risks/${r.id}`} data-testid={`row-risk-${r.id}`} className="relative grid grid-cols-1 gap-1.5 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-muted/40 md:grid-cols-[90px_1fr_110px_70px_70px_100px] md:items-center md:gap-4 rise" style={{ animationDelay: `${i * 20}ms` }}>
                <span className={cn("absolute inset-y-0 left-0 w-[3px]", sevStyle[r.severity]?.bar)} />
                <span><SeverityChip severity={r.severity} /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">{r.title}</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">{r.category} · {r.documentTitle}</span>
                </span>
                <span><StatusChip status={r.status} /></span>
                <span className="font-mono text-sm tabular md:text-right">{r.evidenceCount}<span className="md:hidden text-muted-foreground"> quotes</span></span>
                <span className="font-mono text-sm tabular md:text-right">{r.openActionCount}<span className="md:hidden text-muted-foreground"> open actions</span></span>
                <span className="font-mono text-[11px] text-muted-foreground">{ago(r.updatedAt)}</span>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}

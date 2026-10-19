import { useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ShieldAlert, X, Flag } from "lucide-react";
import { useListRisks, useListDocuments, getListRisksQueryKey, getListDocumentsQueryKey } from "@workspace/api-client-react";
import type { ListRisksParams, RiskSeverity, RiskStatus, EvidenceStatus } from "@workspace/api-client-react";
import {
  PageHeader, Skel, EmptyState, ErrorState, SeverityChip, StatusChip, EvidenceStatusBadge,
  SEVERITIES, STATUSES, EVIDENCE_STATUSES, evidenceStatusLabel, sevStyle, stamp, riskCode, btnGhost,
} from "@/components/kit";
import { cn } from "@/lib/utils";

function Seg<T extends string>({ label, options, value, onChange, fmt }: { label: string; options: readonly T[]; value?: T; onChange: (v?: T) => void; fmt?: (v: T) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <div className="inline-flex flex-wrap overflow-hidden rounded-sm border border-border bg-card">
        <button onClick={() => onChange(undefined)} data-testid={`filter-${label.replace(/\s/g, "-")}-all`} className={cn("px-2.5 py-1 text-xs transition-colors", !value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>All</button>
        {options.map((o) => (
          <button key={o} onClick={() => onChange(o)} data-testid={`filter-${label.replace(/\s/g, "-")}-${o}`} className={cn("flex items-center gap-1.5 border-l border-border px-2.5 py-1 text-xs transition-colors", !fmt && "capitalize", value === o ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {sevStyle[o] && <span className={cn("size-1.5 rounded-full", sevStyle[o].dot)} />}{fmt ? fmt(o) : o}
          </button>
        ))}
      </div>
    </div>
  );
}

const pick = <T extends string>(v: string | null, opts: readonly T[]) => (opts as readonly string[]).includes(v ?? "") ? (v as T) : undefined;
const th = "px-3 py-2 text-left font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-muted-foreground whitespace-nowrap";
const clamp2 = "line-clamp-2 text-[12.5px] leading-snug";

export default function Risks() {
  const [, navigate] = useLocation();
  const qs = new URLSearchParams(useSearch());
  const severity = pick<RiskSeverity>(qs.get("severity"), SEVERITIES);
  const status = pick<RiskStatus>(qs.get("status"), STATUSES);
  const evidenceStatus = pick<EvidenceStatus>(qs.get("evidenceStatus"), EVIDENCE_STATUSES);
  const docRaw = Number(qs.get("documentId"));
  const documentId = Number.isInteger(docRaw) && docRaw > 0 ? docRaw : undefined;
  const reviewRequired = qs.get("reviewRequired") === "true" ? true : undefined;

  const params = useMemo<ListRisksParams>(() => ({
    ...(severity && { severity }), ...(status && { status }), ...(evidenceStatus && { evidenceStatus }),
    ...(documentId && { documentId }), ...(reviewRequired && { reviewRequired }),
  }), [severity, status, evidenceStatus, documentId, reviewRequired]);
  const risks = useListRisks(params, { query: { queryKey: getListRisksQueryKey(params) } });
  const docs = useListDocuments({ query: { queryKey: getListDocumentsQueryKey() } });

  const setFilter = (k: keyof ListRisksParams, v?: string) => {
    const n = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => n.set(key, String(val)));
    if (v) n.set(k, v); else n.delete(k);
    const s = n.toString(); navigate(s ? `/risks?${s}` : "/risks");
  };
  const filtered = Object.keys(params).length > 0;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Risk register" title="Risks" meta={<span data-testid="text-result-count">{risks.data ? `${risks.data.length} ${filtered ? "matching filters" : "total"}` : " "}</span>}>
        {filtered && <button className={btnGhost} onClick={() => navigate("/risks")} data-testid="button-clear-filters-header"><X className="size-3.5" /> Clear filters</button>}
      </PageHeader>
      <div className="flex flex-col gap-2.5 rise">
        <Seg label="severity" options={SEVERITIES} value={severity} onChange={(v) => setFilter("severity", v)} />
        <Seg label="status" options={STATUSES} value={status} onChange={(v) => setFilter("status", v)} />
        <Seg label="evidence" options={EVIDENCE_STATUSES} value={evidenceStatus} onChange={(v) => setFilter("evidenceStatus", v)} fmt={(v) => evidenceStatusLabel[v]} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">document</span>
          <select data-testid="select-document" value={documentId ?? ""} onChange={(e) => setFilter("documentId", e.target.value || undefined)}
            className="h-7 max-w-[320px] rounded-sm border border-border bg-card px-2 text-xs outline-none focus:border-ring">
            <option value="">All documents</option>
            {docs.data?.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
          <button data-testid="toggle-needs-review" aria-pressed={!!reviewRequired} onClick={() => setFilter("reviewRequired", reviewRequired ? undefined : "true")}
            className={cn("ml-1 inline-flex h-7 items-center gap-1.5 rounded-sm border px-2.5 text-xs transition-colors", reviewRequired ? "border-[hsl(28_85%_45%)] bg-[hsl(28_85%_52%/0.12)] text-[hsl(28_85%_32%)]" : "border-border bg-card hover:bg-muted")}>
            <Flag className="size-3" /> Needs review
          </button>
        </div>
      </div>

      {risks.isError ? <ErrorState error={risks.error} onRetry={() => risks.refetch()} /> : (
        <div className="overflow-hidden rounded-md border border-card-border bg-card">
          {risks.isLoading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="border-b border-border px-4 py-3.5"><Skel className="h-4" /></div>)
            : !risks.data?.length ? (filtered
              ? <EmptyState testId="empty-risks-filtered" icon={<X className="size-5" />} title="Nothing matches these filters" body="No risks match this combination of filters." action={<button className={btnGhost} onClick={() => navigate("/risks")} data-testid="button-clear-filters">Clear filters</button>} />
              : <EmptyState testId="empty-risks" icon={<ShieldAlert className="size-5" />} title="The register is empty" body="Risks are identified from documents, each one backed by verbatim quotes. None have been recorded yet." action={<Link href="/documents" className={btnGhost} data-testid="link-go-documents">Go to documents</Link>} />)
            : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1280px] border-collapse">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={th}>ID</th><th className={th}>Risk</th><th className={th}>Severity</th><th className={th}>Likelihood</th>
                      <th className={th}>Business impact</th><th className={th}>Source document</th><th className={th}>Evidence</th>
                      <th className={th}>Recommended mitigation</th><th className={th}>Status</th><th className={th}>Last assessed</th><th className={th}>Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risks.data.map((r, i) => (
                      <tr key={r.id} data-testid={`row-risk-${r.id}`} onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) navigate(`/risks/${r.id}`); }}
                        className="relative cursor-pointer border-b border-border align-top transition-colors last:border-0 hover:bg-muted/40 rise" style={{ animationDelay: `${i * 15}ms` }}>
                        <td className="relative px-3 py-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          <span className={cn("absolute inset-y-0 left-0 w-[3px]", sevStyle[r.severity]?.bar)} />{riskCode(r.id)}
                        </td>
                        <td className="max-w-[260px] px-3 py-3">
                          <Link href={`/risks/${r.id}`} data-testid={`link-risk-${r.id}`} className="block text-[13.5px] font-medium leading-snug hover:underline decoration-accent decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">{r.title}</Link>
                          <span className="mt-0.5 block font-mono text-[10.5px] text-muted-foreground">{r.category}</span>
                        </td>
                        <td className="px-3 py-3"><SeverityChip severity={r.severity} /></td>
                        <td className="px-3 py-3 font-mono text-[11px] uppercase tracking-wider">{r.likelihood ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="max-w-[220px] px-3 py-3"><span className={clamp2}>{r.businessImpact ?? <span className="text-muted-foreground">—</span>}</span></td>
                        <td className="max-w-[180px] px-3 py-3"><Link href={`/documents/${r.documentId}`} data-testid={`link-risk-document-${r.id}`} className="line-clamp-2 text-[12.5px] underline decoration-border underline-offset-4 hover:decoration-foreground">{r.documentTitle}</Link></td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <EvidenceStatusBadge status={r.evidenceStatus} testId={`status-evidence-${r.id}`} />
                          <div className="mt-1 font-mono text-[10.5px] tabular text-muted-foreground">{r.verifiedEvidenceCount}/{r.evidenceCount} verified</div>
                        </td>
                        <td className="max-w-[240px] px-3 py-3"><span className={clamp2}>{r.recommendedMitigation ?? <span className="text-muted-foreground">—</span>}</span></td>
                        <td className="px-3 py-3"><StatusChip status={r.status} /></td>
                        <td className="px-3 py-3 font-mono text-[10.5px] text-muted-foreground whitespace-nowrap">{r.lastAssessedAt ? stamp(r.lastAssessedAt) : "—"}</td>
                        <td className="px-3 py-3">{r.reviewRequired && <span data-testid={`flag-review-${r.id}`} title={r.reviewReasons.join("; ")} className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[hsl(28_85%_36%)]"><Flag className="size-3" />Review</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

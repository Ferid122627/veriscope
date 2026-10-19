import { useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ShieldAlert, X, Flag, ChevronRight } from "lucide-react";
import { useListRisks, useListDocuments, getListRisksQueryKey, getListDocumentsQueryKey } from "@workspace/api-client-react";
import type { ListRisksParams, RiskSeverity, RiskStatus, EvidenceStatus } from "@workspace/api-client-react";
import {
  PageHeader, Skel, EmptyState, ErrorState, SeverityChip, StatusChip, EvidenceStatusBadge,
  SEVERITIES, STATUSES, EVIDENCE_STATUSES, evidenceStatusLabel, severityLabel, riskStatusLabel, sevStyle, stamp, riskCode, btnGhost,
} from "@/components/kit";
import { cn } from "@/lib/utils";

function FilterSelect<T extends string>({ label, id, options, value, onChange, fmt }: { label: string; id: string; options: readonly T[]; value?: T; onChange: (v?: T) => void; fmt: (v: T) => string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <select data-testid={`select-filter-${id}`} value={value ?? ""} onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
        className={cn("h-9 w-full min-w-0 rounded-md border bg-card px-2.5 text-[13.5px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20", value ? "border-primary/60 font-medium" : "border-input")}>
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{fmt(o)}</option>)}
      </select>
    </label>
  );
}

const pick = <T extends string>(v: string | null, opts: readonly T[]) => (opts as readonly string[]).includes(v ?? "") ? (v as T) : undefined;
const th = "px-3 py-2.5 text-left text-[12.5px] font-medium text-muted-foreground whitespace-nowrap";

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
      <PageHeader title="Risks to fix" description="Every risk found in your documents, with its priority and whether its quotes were confirmed. Select a risk to see what to do next."
        meta={<span data-testid="text-result-count">{risks.data ? `${risks.data.length} ${risks.data.length === 1 ? "risk" : "risks"}${filtered ? " match your filters" : " in total"}` : " "}</span>} />
      <div className="rounded-lg border border-card-border bg-card p-3 shadow-sm md:p-4" data-testid="panel-filters" role="group" aria-label="Filter risks">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.6fr)_auto] md:items-end">
          <FilterSelect label="Priority" id="severity" options={SEVERITIES} value={severity} onChange={(v) => setFilter("severity", v)} fmt={(v) => severityLabel[v]} />
          <FilterSelect label="Status" id="status" options={STATUSES} value={status} onChange={(v) => setFilter("status", v)} fmt={(v) => riskStatusLabel[v]} />
          <FilterSelect label="Quote check" id="evidence" options={EVIDENCE_STATUSES} value={evidenceStatus} onChange={(v) => setFilter("evidenceStatus", v)} fmt={(v) => evidenceStatusLabel[v]} />
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[12px] font-medium text-muted-foreground">Document</span>
            <select data-testid="select-document" value={documentId ?? ""} onChange={(e) => setFilter("documentId", e.target.value || undefined)}
              className={cn("h-9 w-full min-w-0 rounded-md border bg-card px-2.5 text-[13.5px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20", documentId ? "border-primary/60 font-medium" : "border-input")}>
              <option value="">All documents</option>
              {docs.data?.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </label>
          <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1">
            <button data-testid="toggle-needs-review" aria-pressed={!!reviewRequired} onClick={() => setFilter("reviewRequired", reviewRequired ? undefined : "true")}
              className={cn("inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-[13.5px] font-medium transition-colors", reviewRequired ? "border-[hsl(28_85%_45%)] bg-[hsl(28_85%_52%/0.12)] text-[hsl(28_85%_28%)]" : "border-input bg-card hover:bg-muted")}>
              <Flag className="size-3.5" aria-hidden /> Needs your review
            </button>
            {filtered && <button className={cn(btnGhost, "border-transparent text-muted-foreground")} onClick={() => navigate("/risks")} data-testid="button-clear-filters-header"><X className="size-3.5" aria-hidden /> Clear</button>}
          </div>
        </div>
      </div>

      {risks.isError ? <ErrorState error={risks.error} onRetry={() => risks.refetch()} /> : (
        <div className="overflow-hidden rounded-lg border border-card-border bg-card shadow-sm">
          {risks.isLoading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="border-b border-border px-4 py-3.5"><Skel className="h-4" /></div>)
            : !risks.data?.length ? (filtered
              ? <EmptyState testId="empty-risks-filtered" icon={<X className="size-5" />} title="No risks match these filters" body="Try removing a filter to see more risks." action={<button className={btnGhost} onClick={() => navigate("/risks")} data-testid="button-clear-filters">Clear filters</button>} />
              : <EmptyState testId="empty-risks" icon={<ShieldAlert className="size-5" />} title="No risks yet" body="Check a contract, policy or report and any risks it contains will be listed here, each backed by a quote from the document." action={<Link href="/documents?add=1" className={btnGhost} data-testid="link-go-documents">Check a document</Link>} />)
            : (
              <>
              <ul className="divide-y divide-border md:hidden" data-testid="list-risks-mobile">
                {risks.data.map((r) => (
                  <li key={r.id} className="relative">
                    <span className={cn("absolute inset-y-0 left-0 w-[3px]", sevStyle[r.severity]?.bar)} />
                    <Link href={`/risks/${r.id}`} data-testid={`card-risk-${r.id}`} className="block px-4 py-3.5 hover:bg-muted/40">
                      <div className="text-[14.5px] font-semibold leading-snug">{r.title}</div>
                      {r.businessImpact && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">{r.businessImpact}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <SeverityChip severity={r.severity} />
                        <StatusChip status={r.status} />
                        {r.reviewRequired && <span className="inline-flex items-center gap-1 rounded-[5px] bg-[hsl(28_85%_52%/0.12)] px-2 py-0.5 text-[11.5px] font-medium text-[hsl(28_85%_30%)]"><Flag className="size-3" aria-hidden />Needs your review</span>}
                        <EvidenceStatusBadge status={r.evidenceStatus} />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-muted-foreground"><span className="truncate">{r.category} · {r.documentTitle}</span><ChevronRight className="size-4 shrink-0" aria-hidden /></div>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead className="border-b border-border bg-muted/40">
                    <tr>
                      <th className={th}>Risk</th><th className={th}>Priority</th><th className={th}>Status</th>
                      <th className={th}>Quote check</th><th className={th}>Found in</th><th className={th}>Last checked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risks.data.map((r) => (
                      <tr key={r.id} data-testid={`row-risk-${r.id}`} onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) navigate(`/risks/${r.id}`); }}
                        className="relative cursor-pointer border-b border-border align-top transition-colors last:border-0 hover:bg-muted/40">
                        <td className="relative w-[44%] py-3.5 pl-4 pr-3">
                          <span className={cn("absolute inset-y-0 left-0 w-[3px]", sevStyle[r.severity]?.bar)} aria-hidden />
                          <Link href={`/risks/${r.id}`} data-testid={`link-risk-${r.id}`} className="block text-[14px] font-semibold leading-snug hover:underline decoration-primary decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">{r.title}</Link>
                          {r.businessImpact && <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-muted-foreground" title={r.businessImpact}>{r.businessImpact}</p>}
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                            <span>{r.category}</span><span aria-hidden>·</span><span>{riskCode(r.id)}</span>
                            {r.reviewRequired && <span data-testid={`flag-review-${r.id}`} title={r.reviewReasons.join("; ")} className="inline-flex items-center gap-1 rounded-[5px] bg-[hsl(28_85%_52%/0.12)] px-1.5 py-[1px] text-[11.5px] font-medium text-[hsl(28_85%_30%)]"><Flag className="size-3" aria-hidden />Needs your review</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <SeverityChip severity={r.severity} />
                          {r.likelihood && <div className="mt-1 text-[12px] text-muted-foreground">Likelihood: {r.likelihood}</div>}
                        </td>
                        <td className="px-3 py-3.5"><StatusChip status={r.status} /></td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <EvidenceStatusBadge status={r.evidenceStatus} testId={`status-evidence-${r.id}`} />
                          <div className="mt-1 text-[12px] tabular text-muted-foreground">{r.verifiedEvidenceCount} of {r.evidenceCount} confirmed</div>
                        </td>
                        <td className="max-w-[200px] px-3 py-3.5"><Link href={`/documents/${r.documentId}`} data-testid={`link-risk-document-${r.id}`} className="line-clamp-2 text-[13px] underline decoration-border underline-offset-4 hover:decoration-foreground">{r.documentTitle}</Link></td>
                        <td className="px-3 py-3.5 text-[12.5px] text-muted-foreground whitespace-nowrap">{r.lastAssessedAt ? stamp(r.lastAssessedAt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
        </div>
      )}
    </div>
  );
}

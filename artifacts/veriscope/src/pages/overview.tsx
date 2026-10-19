import { Link } from "wouter";
import { FileText, ShieldAlert, ClipboardCheck, Activity, Quote, Flag, ScanSearch, BadgeCheck, RefreshCcw, UserCheck, Plus, ChevronRight, CircleDot, Files } from "lucide-react";
import {
  useGetDashboardSummary, useGetRecentActivity, useGetSystemStatus, useListRisks,
  getGetDashboardSummaryQueryKey, getGetRecentActivityQueryKey, getGetSystemStatusQueryKey, getListRisksQueryKey,
} from "@workspace/api-client-react";
import type { ActivityItem, ListRisksParams } from "@workspace/api-client-react";
import {
  PageHeader, Panel, Skel, EmptyState, ErrorState, Disclosure, SEVERITIES, STATUSES, sevStyle, severityLabel, riskStatusLabel,
  ago, num, btnPrimary, stamp, SeverityChip, StatusChip, EvidenceStatusBadge,
} from "@/components/kit";
import { cn } from "@/lib/utils";

function Stat({ label, value, href, testId, icon: Icon, alert }: { label: string; value: string; href: string; testId: string; icon: typeof FileText; alert?: boolean }) {
  return (
    <Link href={href} data-testid={testId}
      className={cn("group flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3.5 shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
        alert ? "border-[hsl(28_85%_52%/0.45)] hover:bg-[hsl(32_100%_97%)]" : "border-card-border hover:border-primary/40")}>
      <div className="min-w-0">
        <div className={cn("text-[13px] font-medium", alert ? "text-[hsl(28_85%_30%)]" : "text-muted-foreground")}>{label}</div>
        <div className="mt-1 text-[1.75rem] font-semibold leading-none tracking-tight tabular">{value}</div>
      </div>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-md", alert ? "bg-[hsl(28_85%_52%/0.12)] text-[hsl(28_85%_36%)]" : "bg-primary/10 text-primary")}><Icon className="size-4" aria-hidden /></span>
    </Link>
  );
}

const steps = [
  { icon: ScanSearch, t: "Find risks", d: "AI reads your contract or policy and lists possible business risks." },
  { icon: BadgeCheck, t: "Check the quotes", d: "Every quote is matched word for word against your document." },
  { icon: RefreshCcw, t: "Check again", d: "Add new evidence later. The AI suggests whether the risk is fixed." },
  { icon: UserCheck, t: "You decide", d: "Only a named person can close a risk, with a written reason." },
];

function HowItWorks() {
  return (
    <Disclosure summary="How Veriscope works" hint="Four steps from document to decision" testId="list-workflow-steps">
      <ol className="divide-y divide-border">
        {steps.map((s, i) => (
          <li key={s.t} className="flex gap-3 px-4 py-3">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><s.icon className="size-3.5" aria-hidden /></span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold">{i + 1}. {s.t}</div>
              <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
    </Disclosure>
  );
}

const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const openParams: ListRisksParams = { status: "open" };

function PriorityRisks() {
  const q = useListRisks(openParams, { query: { queryKey: getListRisksQueryKey(openParams) } });
  const list = q.data ? [...q.data].sort((a, b) => (sevOrder[a.severity] - sevOrder[b.severity]) || (Number(b.reviewRequired) - Number(a.reviewRequired)) || a.id - b.id) : [];
  const top = list.slice(0, 5);
  return (
    <Panel title="Most important open risks" subtitle="Sorted by priority. Open a risk to see the evidence and what to do next." bodyClass="p-0"
      aside={q.data && list.length > 0 && <Link href="/risks?status=open" data-testid="link-all-open-risks" className="whitespace-nowrap text-[13px] font-medium text-primary hover:underline underline-offset-4">View all {list.length}</Link>}>
      {q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
        : q.isLoading ? <div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skel key={i} className="h-14" />)}</div>
        : !top.length ? <EmptyState testId="empty-priority" icon={<ShieldAlert className="size-5" />} title="No open risks" body="When you check a document, the risks it finds will be listed here by priority." />
        : (
          <ul data-testid="list-priority-risks" className="divide-y divide-border">
            {top.map((r) => (
              <li key={r.id}>
                <Link href={`/risks/${r.id}`} data-testid={`link-priority-risk-${r.id}`} className="group relative flex items-start gap-3 px-4 py-3.5 hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                  <span className={cn("absolute inset-y-0 left-0 w-[3px]", sevStyle[r.severity]?.bar)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-semibold leading-snug">{r.title}</div>
                    {r.businessImpact && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">{r.businessImpact}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <SeverityChip severity={r.severity} />
                      <StatusChip status={r.status} />
                      {r.reviewRequired && <span className="inline-flex items-center gap-1 rounded-[5px] bg-[hsl(28_85%_52%/0.12)] px-2 py-0.5 text-[11.5px] font-medium text-[hsl(28_85%_30%)]"><Flag className="size-3" aria-hidden />Needs your review</span>}
                      <EvidenceStatusBadge status={r.evidenceStatus} />
                    </div>
                  </div>
                  <span className="mt-1 hidden shrink-0 items-center gap-0.5 text-[13px] font-medium text-primary sm:inline-flex">View <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </Panel>
  );
}

function AttentionBanner({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[hsl(28_85%_52%/0.45)] bg-[hsl(32_100%_97%)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between" data-testid="banner-needs-review">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[hsl(28_85%_52%/0.15)] text-[hsl(28_85%_34%)]"><Flag className="size-4" aria-hidden /></span>
        <div>
          <div className="text-[14.5px] font-semibold text-[hsl(28_85%_24%)]">{count} {count === 1 ? "risk needs" : "risks need"} your review</div>
          <p className="mt-0.5 text-[13px] text-[hsl(28_40%_28%)]">The AI was unsure, or a quote could not be confirmed. Please take a look before relying on these.</p>
        </div>
      </div>
      <Link href="/risks?reviewRequired=true" data-testid="link-review-now" className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-md border border-[hsl(28_85%_45%/0.5)] bg-card px-3.5 text-[13.5px] font-medium text-[hsl(28_85%_26%)] hover:bg-[hsl(32_100%_95%)]">Review now <ChevronRight className="size-4" aria-hidden /></Link>
    </div>
  );
}

const ACTIVITY_LIMIT = 8;

const actIcon = { document_added: FileText, risk_identified: ShieldAlert, assessment_recorded: ClipboardCheck };
function actHref(a: ActivityItem) {
  if (a.riskId) return `/risks/${a.riskId}`;
  if (a.documentId) return `/documents/${a.documentId}`;
  return null;
}

const statusBar = ["bg-foreground", "bg-[hsl(230_38%_55%)]", "bg-[hsl(150_35%_40%)]"];

export default function Overview() {
  const summary = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const activity = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });
  const sys = useGetSystemStatus({ query: { queryKey: getGetSystemStatusQueryKey(), refetchInterval: 30000 } });
  const s = summary.data;
  const pct = s && s.totalEvidence > 0 ? (s.verifiedEvidence / s.totalEvidence) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Your business risks" description="See what needs attention, open a risk to understand it, or check a new document.">
        <Link href="/documents?add=1" className={btnPrimary} data-testid="button-check-document"><Plus className="size-4" aria-hidden /> Check a document</Link>
      </PageHeader>

      {summary.isError ? <ErrorState testId="error-summary" error={summary.error} onRetry={() => summary.refetch()} /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {!s ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="rounded-lg border border-card-border bg-card p-4"><Skel className="h-3 w-20" /><Skel className="mt-3 h-7 w-12" /></div>) : <>
            <Stat testId="stat-documents" href="/documents" label="Documents" value={num(s.totalDocuments)} icon={Files} />
            <Stat testId="stat-risks" href="/risks" label="Total risks" value={num(s.totalRisks)} icon={ShieldAlert} />
            <Stat testId="stat-open" href="/risks?status=open" label="Open risks" value={num(s.risksByStatus.open)} icon={CircleDot} />
            <Stat testId="stat-review" href="/risks?reviewRequired=true" label="Needs your review" value={num(s.risksRequiringReview)} icon={Flag} alert={s.risksRequiringReview > 0} />
          </>}
        </div>
      )}

      {s && <AttentionBanner count={s.risksRequiringReview} />}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-6">
          <PriorityRisks />

          <Disclosure summary="More details" hint="Risks by priority and status, quote checks, and system status" testId="details-analytics">
            <div className="space-y-6 p-4">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-[13.5px] font-semibold">By priority</h3>
                  {!s ? <div className="space-y-3">{SEVERITIES.map((k) => <Skel key={k} className="h-5" />)}</div> : (
                    <div className="space-y-2.5">
                      {SEVERITIES.map((k) => {
                        const v = s.risksBySeverity[k]; const w = s.totalRisks ? (v / s.totalRisks) * 100 : 0;
                        return (
                          <Link key={k} href={`/risks?severity=${k}`} data-testid={`link-severity-${k}`} className="group grid grid-cols-[72px_1fr_32px] items-center gap-3 text-[13px]">
                            <span className="text-muted-foreground group-hover:text-foreground">{severityLabel[k]}</span>
                            <span className="h-2 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full origin-left rounded-full transition-transform duration-700", sevStyle[k].bar)} style={{ transform: `scaleX(${w / 100})` }} /></span>
                            <span className="text-right font-medium tabular" data-testid={`text-severity-${k}`}>{v}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="mb-3 text-[13.5px] font-semibold">By status</h3>
                  {!s ? <Skel className="h-20" /> : (
                    <>
                      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                        {s.totalRisks > 0 && STATUSES.map((k, i) => <span key={k} style={{ width: `${(s.risksByStatus[k] / s.totalRisks) * 100}%` }} className={statusBar[i]} />)}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {STATUSES.map((k, i) => (
                          <Link key={k} href={`/risks?status=${k}`} data-testid={`link-status-${k}`} className="-m-1 rounded-md p-1 hover:bg-muted/60">
                            <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><span className={cn("size-1.5 rounded-full", statusBar[i])} aria-hidden />{riskStatusLabel[k]}</div>
                            <div className="mt-0.5 text-xl font-semibold tabular" data-testid={`text-status-${k}`}>{s.risksByStatus[k]}</div>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-5">
                <h3 className="text-[13.5px] font-semibold">Quote checks</h3>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">Each quote the AI uses is compared word for word with your document.</p>
                {!s ? <Skel className="mt-3 h-10" /> : s.totalEvidence === 0 ? (
                  <div className="mt-3 flex items-center gap-3 text-[13px] text-muted-foreground"><Quote className="size-4 shrink-0" aria-hidden />No quotes yet. They will be counted here once a document has been checked.</div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
                    <div className="text-2xl font-semibold tabular" data-testid="text-verified-evidence">{num(s.verifiedEvidence)}<span className="text-lg text-muted-foreground"> of {num(s.totalEvidence)} verified</span></div>
                    <div className="min-w-[200px] flex-1">
                      <div className="mb-1.5 flex justify-between text-[12px]"><span>{pct.toFixed(0)}% verified</span><span className="text-muted-foreground">{num(s.totalEvidence - s.verifiedEvidence)} not found</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full origin-left rounded-full bg-primary transition-transform duration-700" style={{ transform: `scaleX(${pct / 100})` }} /></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[13.5px] font-semibold">System status</h3>
                  {sys.data && <span className="text-[12px] text-muted-foreground">Checked {stamp(sys.data.checkedAt)}</span>}
                </div>
                {sys.isError ? <div className="mt-3"><ErrorState error={sys.error} title="Could not reach the status check" onRetry={() => sys.refetch()} /></div> : !sys.data ? <Skel className="mt-3 h-10" /> : (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="status-system">
                    {[
                      { l: "App server", ok: sys.data.api === "ok", v: sys.data.api === "ok" ? "Working" : sys.data.api },
                      { l: "Database", ok: sys.data.database === "ok", v: sys.data.database === "ok" ? "Working" : sys.data.database },
                      { l: "AI checking", ok: sys.data.aiProvider === "configured", v: sys.data.aiProvider === "configured" ? "Ready" : "Not set up", warn: true },
                    ].map((r) => (
                      <div key={r.l} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <span className="text-[13px]">{r.l}</span>
                        <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-medium", r.ok ? "text-[hsl(150_40%_26%)]" : r.warn ? "text-[hsl(28_85%_32%)]" : "text-destructive")}>
                          <span className={cn("size-1.5 rounded-full", r.ok ? "bg-[hsl(150_40%_38%)]" : r.warn ? "bg-[hsl(28_85%_52%)]" : "bg-destructive")} aria-hidden />{r.v}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Disclosure>
        </div>

        <div className="min-w-0 space-y-6 self-start">
          <Panel title="Recent activity" bodyClass="p-0"
            aside={activity.data && activity.data.length > ACTIVITY_LIMIT ? <span className="text-[12px] text-muted-foreground" data-testid="text-activity-count">Latest {ACTIVITY_LIMIT} of {activity.data.length}</span> : <Activity className="size-4 text-muted-foreground" aria-hidden />}>
            {activity.isError ? <div className="p-4"><ErrorState error={activity.error} onRetry={() => activity.refetch()} /></div>
              : activity.isLoading ? <div className="space-y-4 p-4">{Array.from({ length: 6 }).map((_, i) => <Skel key={i} className="h-8" />)}</div>
              : !activity.data?.length ? (
                <EmptyState testId="empty-activity" icon={<Activity className="size-5" />} title="Nothing here yet"
                  body="Check your first document. New documents, risks and checks will appear here."
                  action={<Link href="/documents?add=1" data-testid="link-add-first-document" className={btnPrimary}><Plus className="size-4" aria-hidden /> Check a document</Link>} />
              ) : (
                <ol className="divide-y divide-border">
                  {activity.data.slice(0, ACTIVITY_LIMIT).map((a) => {
                    const I = actIcon[a.type] ?? Activity; const href = actHref(a);
                    const body = (<><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><I className="size-3.5" aria-hidden /></span><div className="min-w-0 flex-1"><div className="text-[13px] leading-snug">{a.message}</div><div className="mt-0.5 text-[12px] text-muted-foreground">{ago(a.createdAt)}</div></div></>);
                    return (
                      <li key={a.id}>
                        {href ? <Link href={href} data-testid={`link-activity-${a.id}`} className="flex gap-3 px-4 py-3 hover:bg-muted/50">{body}</Link> : <div className="flex gap-3 px-4 py-3">{body}</div>}
                      </li>
                    );
                  })}
                </ol>
              )}
          </Panel>
          <HowItWorks />
        </div>
      </div>
    </div>
  );
}

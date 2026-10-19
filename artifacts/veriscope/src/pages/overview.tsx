import { Link } from "wouter";
import { FileText, ShieldAlert, ClipboardCheck, ArrowUpRight, Activity, Quote } from "lucide-react";
import {
  useGetDashboardSummary, useGetRecentActivity, useGetSystemStatus,
  getGetDashboardSummaryQueryKey, getGetRecentActivityQueryKey, getGetSystemStatusQueryKey,
} from "@workspace/api-client-react";
import type { ActivityItem } from "@workspace/api-client-react";
import { PageHeader, Panel, Skel, EmptyState, ErrorState, SEVERITIES, STATUSES, sevStyle, ago, num, btnPrimary, stamp } from "@/components/kit";
import { cn } from "@/lib/utils";

function Stat({ label, value, sub, href, testId }: { label: string; value: string; sub: string; href: string; testId: string }) {
  return (
    <Link href={href} data-testid={testId} className="group block bg-card px-4 py-4 transition-colors hover:bg-muted/50">
      <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}<ArrowUpRight className="size-3.5 opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100" />
      </div>
      <div className="mt-2 font-serif text-[2.6rem] leading-none tabular">{value}</div>
      <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>
    </Link>
  );
}

const actIcon = { document_added: FileText, risk_identified: ShieldAlert, assessment_recorded: ClipboardCheck };
function actHref(a: ActivityItem) {
  if (a.riskId) return `/risks/${a.riskId}`;
  if (a.documentId) return `/documents/${a.documentId}`;
  return null;
}

export default function Overview() {
  const summary = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const activity = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });
  const sys = useGetSystemStatus({ query: { queryKey: getGetSystemStatusQueryKey(), refetchInterval: 30000 } });
  const s = summary.data;
  const pct = s && s.totalEvidence > 0 ? (s.verifiedEvidence / s.totalEvidence) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Portfolio overview" title="Every risk, traced to its source." meta={s ? `${num(s.totalDocuments)} documents under review` : " "} />

      {summary.isError ? <ErrorState testId="error-summary" error={summary.error} onRetry={() => summary.refetch()} /> : (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-card-border bg-border lg:grid-cols-4 rise">
          {!s ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-card p-4"><Skel className="h-3 w-20" /><Skel className="mt-3 h-10 w-16" /><Skel className="mt-2 h-3 w-24" /></div>) : <>
            <Stat testId="stat-documents" href="/documents" label="Documents" value={num(s.totalDocuments)} sub="Source texts on file" />
            <Stat testId="stat-risks" href="/risks" label="Risks" value={num(s.totalRisks)} sub={`${num(s.risksByStatus.open)} open`} />
            <Stat testId="stat-actions" href="/risks?status=mitigating" label="Open actions" value={num(s.openActions)} sub="Mitigations not done" />
            <Stat testId="stat-assessments" href="/risks" label="Assessments" value={num(s.totalAssessments)} sub="Recorded verdicts" />
          </>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Panel title="By severity">
              {!s ? <div className="space-y-3">{SEVERITIES.map((k) => <Skel key={k} className="h-5" />)}</div> : (
                <div className="space-y-2.5">
                  {SEVERITIES.map((k) => {
                    const v = s.risksBySeverity[k]; const w = s.totalRisks ? (v / s.totalRisks) * 100 : 0;
                    return (
                      <Link key={k} href={`/risks?severity=${k}`} data-testid={`link-severity-${k}`} className="group grid grid-cols-[72px_1fr_32px] items-center gap-3 text-sm">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground group-hover:text-foreground">{k}</span>
                        <span className="h-2 overflow-hidden rounded-[1px] bg-muted"><span className={cn("block h-full origin-left transition-transform duration-700", sevStyle[k].bar)} style={{ transform: `scaleX(${w / 100})` }} /></span>
                        <span className="text-right font-mono tabular" data-testid={`text-severity-${k}`}>{v}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Panel>
            <Panel title="By status">
              {!s ? <Skel className="h-24" /> : (
                <>
                  <div className="flex h-2 overflow-hidden rounded-[1px] bg-muted">
                    {s.totalRisks > 0 && STATUSES.map((k, i) => <span key={k} style={{ width: `${(s.risksByStatus[k] / s.totalRisks) * 100}%` }} className={["bg-foreground", "bg-[hsl(230_38%_55%)]", "bg-[hsl(150_35%_40%)]"][i]} />)}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {STATUSES.map((k, i) => (
                      <Link key={k} href={`/risks?status=${k}`} data-testid={`link-status-${k}`} className="rounded-sm p-1 -m-1 hover:bg-muted/60">
                        <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground"><span className={cn("size-1.5 rounded-full", ["bg-foreground", "bg-[hsl(230_38%_55%)]", "bg-[hsl(150_35%_40%)]"][i])} />{k}</div>
                        <div className="mt-1 font-serif text-2xl tabular" data-testid={`text-status-${k}`}>{s.risksByStatus[k]}</div>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </Panel>
          </div>

          <Panel title="Evidence verification" aside={<span className="font-mono text-[10.5px] text-muted-foreground">quote = source, char for char</span>}>
            {!s ? <Skel className="h-16" /> : s.totalEvidence === 0 ? (
              <div className="flex items-center gap-4 text-sm text-muted-foreground"><Quote className="size-5 shrink-0" />No evidence quotes yet. Each quote attached to a risk will be checked verbatim against its source document and counted here.</div>
            ) : (
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                <div><div className="font-serif text-[2.6rem] leading-none tabular" data-testid="text-verified-evidence">{num(s.verifiedEvidence)}<span className="text-muted-foreground text-2xl"> / {num(s.totalEvidence)}</span></div><div className="mt-1 text-xs text-muted-foreground">quotes verified against source</div></div>
                <div className="min-w-[200px] flex-1">
                  <div className="mb-1.5 flex justify-between font-mono text-[11px]"><span>{pct.toFixed(1)}% verified</span><span className="text-muted-foreground">{num(s.totalEvidence - s.verifiedEvidence)} unverified</span></div>
                  <div className="h-2.5 overflow-hidden rounded-[1px] bg-[repeating-linear-gradient(135deg,hsl(var(--muted))_0_4px,hsl(var(--border))_4px_5px)]"><div className="h-full origin-left bg-accent transition-transform duration-700 border-r-2 border-foreground" style={{ transform: `scaleX(${pct / 100})` }} /></div>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="System status" aside={sys.data && <span className="font-mono text-[10.5px] text-muted-foreground">checked {stamp(sys.data.checkedAt)}</span>}>
            {sys.isError ? <ErrorState error={sys.error} title="Status endpoint unreachable" onRetry={() => sys.refetch()} /> : !sys.data ? <Skel className="h-12" /> : (
              <div className="grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-3" data-testid="status-system">
                {[
                  { l: "API", ok: sys.data.api === "ok", v: sys.data.api },
                  { l: "Database", ok: sys.data.database === "ok", v: sys.data.database },
                  { l: "AI provider", ok: sys.data.aiProvider === "configured", v: sys.data.aiProvider.replace("_", " "), warn: true },
                ].map((r) => (
                  <div key={r.l} className="flex items-center justify-between bg-card px-3 py-2.5">
                    <span className="text-sm">{r.l}</span>
                    <span className={cn("inline-flex items-center gap-1.5 font-mono text-[11px] uppercase", r.ok ? "text-[hsl(150_40%_28%)]" : r.warn ? "text-[hsl(28_85%_38%)]" : "text-destructive")}>
                      <span className={cn("size-1.5 rounded-full", r.ok ? "bg-[hsl(150_40%_38%)]" : r.warn ? "bg-[hsl(28_85%_52%)]" : "bg-destructive")} />{r.v}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Recent activity" aside={<Activity className="size-3.5 text-muted-foreground" />} bodyClass="p-0">
          {activity.isError ? <div className="p-4"><ErrorState error={activity.error} onRetry={() => activity.refetch()} /></div>
            : activity.isLoading ? <div className="space-y-4 p-4">{Array.from({ length: 6 }).map((_, i) => <Skel key={i} className="h-8" />)}</div>
            : !activity.data?.length ? (
              <EmptyState testId="empty-activity" icon={<Activity className="size-5" />} title="The ledger is blank"
                body="Add a document to begin. Every document added, risk identified, and verdict recorded will be logged here in order."
                action={<Link href="/documents" data-testid="link-add-first-document" className={btnPrimary}>Add a document</Link>} />
            ) : (
              <ol className="relative">
                {activity.data.map((a, i) => {
                  const I = actIcon[a.type] ?? Activity; const href = actHref(a);
                  const body = (<><I className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="text-[13px] leading-snug">{a.message}</div><div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{ago(a.createdAt)}</div></div></>);
                  return (
                    <li key={a.id} className="rise border-b border-border last:border-0" style={{ animationDelay: `${i * 30}ms` }}>
                      {href ? <Link href={href} data-testid={`link-activity-${a.id}`} className="flex gap-3 px-4 py-3 hover:bg-muted/50">{body}</Link> : <div className="flex gap-3 px-4 py-3">{body}</div>}
                    </li>
                  );
                })}
              </ol>
            )}
        </Panel>
      </div>
    </div>
  );
}

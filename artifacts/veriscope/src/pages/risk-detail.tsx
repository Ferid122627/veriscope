import { Link, useParams } from "wouter";
import { ArrowLeft, ShieldAlert, BadgeCheck, MessageSquareWarning, Briefcase, CircleAlert, ArrowUpRight, ListTodo, History, Quote } from "lucide-react";
import { format } from "date-fns";
import { useGetRisk, getGetRiskQueryKey } from "@workspace/api-client-react";
import { PageHeader, Panel, Skel, EmptyState, ErrorState, SeverityChip, StatusChip, Chip, stamp, btnGhost } from "@/components/kit";
import { cn } from "@/lib/utils";

const verdictStyle: Record<string, string> = {
  identified: "border-foreground/25",
  resolved: "border-[hsl(150_35%_35%/0.4)] text-[hsl(150_40%_26%)] bg-[hsl(150_35%_35%/0.08)]",
  partially_resolved: "border-[hsl(48_85%_50%/0.4)] text-[hsl(42_80%_30%)] bg-[hsl(48_85%_50%/0.12)]",
  not_resolved: "border-destructive/40 text-destructive bg-destructive/5",
  insufficient_evidence: "border-foreground/20 text-muted-foreground border-dashed",
};

export default function RiskDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const q = useGetRisk(id, { query: { enabled: valid, queryKey: getGetRiskQueryKey(id) } });
  const r = q.data;

  if (!valid || (q.isError && (q.error as { status?: number })?.status === 404)) {
    return <EmptyState testId="empty-risk-missing" icon={<ShieldAlert className="size-5" />} title="Risk not found" body="It may have been removed when its source document was deleted." action={<Link href="/risks" className={btnGhost}>Back to register</Link>} />;
  }

  const verified = r?.evidence.filter((e) => e.verified).length ?? 0;
  const assessments = r ? [...r.assessments].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)) : [];

  return (
    <div className="space-y-6">
      <Link href="/risks" data-testid="link-back-risks" className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Risk register</Link>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !r ? (
        <div className="space-y-4"><Skel className="h-3 w-28" /><Skel className="h-10 w-3/4" /><Skel className="h-24" /><Skel className="h-40" /></div>
      ) : <>
        <PageHeader eyebrow={`Risk · R-${String(r.id).padStart(4, "0")} · ${r.category}`} title={<span data-testid="text-risk-title">{r.title}</span>}
          meta={<span className="flex flex-wrap items-center gap-2"><SeverityChip severity={r.severity} testId="status-severity" />{r.likelihood && <Chip className="border-border text-muted-foreground" testId="status-likelihood">likelihood {r.likelihood}</Chip>}<StatusChip status={r.status} testId="status-risk" /><span className="font-mono text-xs">from <Link href={`/documents/${r.documentId}`} className="underline decoration-accent decoration-2 underline-offset-4 hover:text-foreground" data-testid="link-source-document">{r.documentTitle}</Link></span><span className="font-mono text-xs">updated {stamp(r.updatedAt)}</span></span>} />

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6 min-w-0">
            <p className="font-serif text-[18px] leading-relaxed text-foreground/90 rise" data-testid="text-risk-description">{r.description}</p>

            {r.reviewNotes && (
              <div className="flex gap-3 rounded-sm border border-dashed border-[hsl(28_85%_52%/0.6)] bg-[hsl(28_85%_52%/0.06)] px-4 py-3" data-testid="text-review-notes">
                <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-[hsl(28_85%_40%)]" />
                <div><div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[hsl(28_85%_36%)]">Reviewer notes · uncertainty</div><p className="mt-1 text-[13.5px] leading-relaxed">{r.reviewNotes}</p></div>
              </div>
            )}

            {r.businessImpact && (
              <Panel title="Business impact" aside={<Briefcase className="size-3.5 text-muted-foreground" />}>
                <p className="text-[14px] leading-relaxed" data-testid="text-business-impact">{r.businessImpact}</p>
              </Panel>
            )}

            <Panel title="Evidence" aside={r.evidence.length > 0 && <span className="font-mono text-[11px]" data-testid="text-evidence-verified">{verified}/{r.evidence.length} verified</span>} bodyClass="p-0">
              {!r.evidence.length ? <EmptyState icon={<Quote className="size-5" />} title="No quotes attached" body="A risk without a source quote cannot be trusted. Evidence will appear here once extracted from a document." />
                : r.evidence.map((e) => {
                  const hasOffsets = e.startOffset != null && e.endOffset != null;
                  const href = hasOffsets ? `/documents/${e.documentId}?start=${e.startOffset}&end=${e.endOffset}` : `/documents/${e.documentId}`;
                  return (
                    <figure key={e.id} className="group border-b border-border px-4 py-4 last:border-0" data-testid={`card-evidence-${e.id}`}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        {e.verified
                          ? <Chip className="border-foreground/20 bg-accent text-accent-foreground" testId={`status-evidence-${e.id}`}><BadgeCheck className="size-3" />verified verbatim</Chip>
                          : <Chip className="border-dashed border-[hsl(28_85%_52%/0.6)] text-[hsl(28_85%_36%)]" testId={`status-evidence-${e.id}`}><CircleAlert className="size-3" />unverified</Chip>}
                        <Link href={href} data-testid={`link-evidence-${e.id}`} className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground">
                          {e.pageNumber != null && `p. ${e.pageNumber} · `}{hasOffsets ? `chars ${e.startOffset}–${e.endOffset}` : "open source"}<ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </Link>
                      </div>
                      <blockquote className={cn("border-l-2 pl-4 font-serif text-[16px] italic leading-relaxed", e.verified ? "border-accent text-foreground" : "border-dashed border-[hsl(28_85%_52%)] text-foreground/70")}>"{e.quote}"</blockquote>
                      <figcaption className="mt-2 pl-4 font-mono text-[10.5px] text-muted-foreground">{e.documentTitle}{!e.verified && " · quote not found in source text; treat with caution"}</figcaption>
                    </figure>
                  );
                })}
            </Panel>

            <Panel title="Mitigation actions" aside={<ListTodo className="size-3.5 text-muted-foreground" />} bodyClass="p-0">
              {!r.actions.length ? <EmptyState icon={<ListTodo className="size-5" />} title="No mitigation actions" body="No actions have been planned against this risk yet." />
                : r.actions.map((a) => (
                  <div key={a.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-border px-4 py-3 last:border-0" data-testid={`row-action-${a.id}`}>
                    <div className={cn("text-[14px]", a.status === "done" && "text-muted-foreground line-through decoration-foreground/30")}>{a.description}</div>
                    <StatusChip status={a.status} />
                    <div className="col-span-2 font-mono text-[11px] text-muted-foreground">{a.owner ?? "Unassigned"} · {a.dueDate ? `due ${format(new Date(a.dueDate), "dd MMM yyyy")}` : "no due date"}</div>
                  </div>
                ))}
            </Panel>
          </div>

          <Panel title="Assessment history" aside={<History className="size-3.5 text-muted-foreground" />} className="self-start">
            {!assessments.length ? <EmptyState icon={<History className="size-5" />} title="No verdicts recorded" body="Initial and follow-up assessments will form a timeline here." />
              : <ol className="relative space-y-5 border-l border-border pl-5">
                {assessments.map((a) => (
                  <li key={a.id} className="relative rise" data-testid={`item-assessment-${a.id}`}>
                    <span className={cn("absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-card", a.kind === "initial" ? "bg-foreground" : "bg-accent ring-1 ring-foreground/40")} />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip className={verdictStyle[a.verdict]}>{a.verdict.replace(/_/g, " ")}</Chip>
                      <span className="font-mono text-[10.5px] uppercase text-muted-foreground">{a.kind}</span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed">{a.rationale}</p>
                    <div className="mt-1 font-mono text-[10.5px] text-muted-foreground">
                      {stamp(a.createdAt)}{a.confidence != null && ` · ${Math.round(a.confidence * (a.confidence <= 1 ? 100 : 1))}% conf.`}{a.model && ` · ${a.model}`}
                    </div>
                    {a.evidenceDocumentId != null && <Link href={`/documents/${a.evidenceDocumentId}`} className="mt-1 inline-block font-mono text-[10.5px] underline underline-offset-4" data-testid={`link-assessment-doc-${a.id}`}>view evidence document</Link>}
                  </li>
                ))}
              </ol>}
          </Panel>
        </div>
      </>}
    </div>
  );
}

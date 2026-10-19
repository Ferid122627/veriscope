import { useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, ShieldAlert, BadgeCheck, MessageSquareWarning, Briefcase, CircleAlert, ArrowUpRight, ListTodo, History, Quote, Flag, FileText, Wrench, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { useGetRisk, getGetRiskQueryKey } from "@workspace/api-client-react";
import type { Evidence, Assessment, AssessmentKind, AssessmentVerdict, EvidenceBasis } from "@workspace/api-client-react";
import { PageHeader, Panel, Skel, EmptyState, ErrorState, SeverityChip, StatusChip, Chip, EvidenceStatusBadge, stamp, riskCode, btnGhost } from "@/components/kit";
import { cn } from "@/lib/utils";

const verdictStyle: Record<AssessmentVerdict, string> = {
  identified: "border-foreground/25",
  resolved: "border-[hsl(150_35%_35%/0.4)] text-[hsl(150_40%_26%)] bg-[hsl(150_35%_35%/0.08)]",
  partially_resolved: "border-[hsl(48_85%_50%/0.4)] text-[hsl(42_80%_30%)] bg-[hsl(48_85%_50%/0.12)]",
  not_resolved: "border-destructive/40 text-destructive bg-destructive/5",
  insufficient_evidence: "border-foreground/20 text-muted-foreground border-dashed",
  not_detected: "border-dashed border-[hsl(28_85%_52%/0.6)] text-[hsl(28_85%_36%)]",
};
const verdictLabel: Record<AssessmentVerdict, string> = {
  identified: "Identified", resolved: "Resolved", partially_resolved: "Partially resolved", not_resolved: "Not resolved",
  insufficient_evidence: "Insufficient evidence", not_detected: "Not detected in re-analysis",
};
const kindLabel: Record<AssessmentKind, string> = { initial: "Initial", reanalysis: "Re-analysis", reassessment: "Reassessment" };
const basisLabel: Record<EvidenceBasis, string> = {
  direct: "Direct quotation",
  inferred: "Interpretation of several passages — not a direct quotation",
  none: "No direct supporting quotation",
};

function EvidenceItem({ e, compact }: { e: Evidence; compact?: boolean }) {
  const located = e.matchType !== "not_found" && e.startOffset != null && e.endOffset != null;
  const href = located ? `/documents/${e.documentId}?start=${e.startOffset}&end=${e.endOffset}` : `/documents/${e.documentId}`;
  const isVerified = e.verified === true && e.matchType !== "not_found";
  const claimDiffers = e.claimedQuote != null && e.claimedQuote !== e.quote;
  return (
    <figure className={cn("group", compact ? "py-2" : "border-b border-border px-4 py-4 last:border-0")} data-testid={`card-evidence-${e.id}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {isVerified
          ? <Chip className="border-foreground/20 bg-accent text-accent-foreground" testId={`status-evidence-${e.id}`}><BadgeCheck className="size-3" />{e.matchType === "exact" ? "Verified exact match" : "Verified after normalization"}</Chip>
          : <Chip className="border-dashed border-destructive/60 bg-destructive/5 text-destructive" testId={`status-evidence-${e.id}`}><CircleAlert className="size-3" />Not found in source</Chip>}
        <Link href={href} data-testid={`link-evidence-${e.id}`} className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground">
          {e.pageNumber != null && `p. ${e.pageNumber} · `}{located ? `chars ${e.startOffset}–${e.endOffset}` : "open source"}<ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </div>
      {isVerified ? (
        <blockquote className={cn("border-l-2 border-accent pl-4 font-serif italic leading-relaxed text-foreground", compact ? "text-[14px]" : "text-[16px]")}>"{e.quote}"</blockquote>
      ) : (
        <>
          <blockquote className={cn("border-l-2 border-dashed border-destructive/60 pl-4 font-serif italic leading-relaxed text-foreground/60 line-through decoration-destructive/50", compact ? "text-[14px]" : "text-[16px]")}>"{e.claimedQuote ?? e.quote}"</blockquote>
          <div className="mt-1.5 pl-4 text-[12px] font-medium text-destructive">Not found in the source document — do not rely on this quotation.</div>
        </>
      )}
      <div className="mt-2 space-y-0.5 pl-4 font-mono text-[10.5px] text-muted-foreground">
        {isVerified && e.matchType === "normalized" && e.normalizations.length > 0 && <div data-testid={`text-normalized-${e.id}`}>Normalized: {e.normalizations.join(", ")}</div>}
        {isVerified && claimDiffers && <div>AI quoted: <span className="font-serif text-[12px] italic">"{e.claimedQuote}"</span></div>}
        {e.matchCount > 1 && <div className="text-[hsl(28_85%_36%)]" data-testid={`text-ambiguous-${e.id}`}>Appears {e.matchCount} times in the document — location ambiguous</div>}
        {!compact && <div>{e.documentTitle}</div>}
      </div>
    </figure>
  );
}

function AssessmentItem({ a }: { a: Assessment }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="relative rise" data-testid={`item-assessment-${a.id}`}>
      <span className={cn("absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-card", a.kind === "initial" ? "bg-foreground" : "bg-accent ring-1 ring-foreground/40")} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-wider">{kindLabel[a.kind]}</span>
        <Chip className={verdictStyle[a.verdict]}>{verdictLabel[a.verdict]}</Chip>
      </div>
      {(a.severity || a.likelihood || a.evidenceBasis) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {a.severity && <SeverityChip severity={a.severity} />}
          {a.likelihood && <Chip className="border-border text-muted-foreground">lkl {a.likelihood}</Chip>}
          {a.evidenceBasis && <Chip className="border-border text-muted-foreground">{a.evidenceBasis}</Chip>}
        </div>
      )}
      <p className="mt-1.5 text-[13px] leading-relaxed">{a.rationale}</p>
      <div className="mt-1 font-mono text-[10.5px] text-muted-foreground">
        {stamp(a.createdAt)}{a.confidence != null && ` · ${Math.round(a.confidence * (a.confidence <= 1 ? 100 : 1))}% conf.`}{a.model && ` · ${a.model}`}{a.analysisRunId != null && ` · run #${a.analysisRunId}`}
      </div>
      {a.evidenceDocumentId != null && <Link href={`/documents/${a.evidenceDocumentId}`} className="mt-1 inline-block font-mono text-[10.5px] underline underline-offset-4" data-testid={`link-assessment-doc-${a.id}`}>view evidence document</Link>}
      {a.evidence.length > 0 && (
        <div className="mt-1.5">
          <button onClick={() => setOpen((o) => !o)} data-testid={`button-toggle-quotes-${a.id}`} aria-expanded={open} className="inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
            <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />{a.evidence.length} quote{a.evidence.length > 1 && "s"} cited · {a.evidence.filter((e) => e.verified).length} verified
          </button>
          {open && <div className="mt-1 divide-y divide-border border-l border-border pl-3">{a.evidence.map((e) => <EvidenceItem key={e.id} e={e} compact />)}</div>}
        </div>
      )}
    </li>
  );
}

export default function RiskDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const q = useGetRisk(id, { query: { enabled: valid, queryKey: getGetRiskQueryKey(id) } });
  const r = q.data;

  if (!valid || (q.isError && (q.error as { status?: number })?.status === 404)) {
    return <EmptyState testId="empty-risk-missing" icon={<ShieldAlert className="size-5" />} title="Risk not found" body="It may have been removed when its source document was deleted." action={<Link href="/risks" className={btnGhost}>Back to register</Link>} />;
  }

  const assessments = r ? [...r.assessments].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)) : [];
  const src = r?.sourceDocument;

  return (
    <div className="space-y-6">
      <Link href="/risks" data-testid="link-back-risks" className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Risk register</Link>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !r ? (
        <div className="space-y-4"><Skel className="h-3 w-28" /><Skel className="h-10 w-3/4" /><Skel className="h-24" /><Skel className="h-40" /></div>
      ) : <>
        <PageHeader eyebrow={`Risk · ${riskCode(r.id)} · ${r.category}`} title={<span data-testid="text-risk-title">{r.title}</span>}
          meta={<span className="flex flex-wrap items-center gap-2">
            <SeverityChip severity={r.severity} testId="status-severity" />
            {r.likelihood && <Chip className="border-border text-muted-foreground" testId="status-likelihood">likelihood {r.likelihood}</Chip>}
            <StatusChip status={r.status} testId="status-risk" />
            <EvidenceStatusBadge status={r.evidenceStatus} testId="status-evidence-overall" />
            <span className="font-mono text-xs">updated {stamp(r.updatedAt)}</span>
          </span>} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border border-border bg-card px-4 py-3 rise">
          <FileText className="size-4 text-muted-foreground" />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">Source document</span>
          <Link href={`/documents/${r.documentId}`} data-testid="link-source-document" className="font-serif text-[17px] underline decoration-accent decoration-2 underline-offset-4 hover:decoration-foreground">{src?.title ?? r.documentTitle}</Link>
          {src && <span className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <Chip className="border-border text-muted-foreground">{src.sourceType}</Chip>
            {src.filename && <span>{src.filename}</span>}
            {src.pageCount != null && <span>{src.pageCount} pages</span>}
          </span>}
        </div>

        {r.reviewRequired && (
          <div className="flex gap-3 rounded-sm border border-[hsl(28_85%_45%)] bg-[hsl(28_85%_52%/0.08)] px-4 py-3" data-testid="callout-review-required">
            <Flag className="mt-0.5 size-4 shrink-0 text-[hsl(28_85%_40%)]" />
            <div>
              <div className="text-sm font-semibold text-[hsl(28_85%_28%)]">Human review required</div>
              {r.reviewReasons.length > 0
                ? <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13.5px] leading-relaxed">{r.reviewReasons.map((x, i) => <li key={i} data-testid={`text-review-reason-${i}`}>{x}</li>)}</ul>
                : <p className="mt-1 text-[13.5px]">This risk has been flagged for review.</p>}
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
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

            <Panel title="Evidence" aside={<span className="font-mono text-[11px]" data-testid="text-evidence-verified">{r.verifiedEvidenceCount}/{r.evidenceCount} verified</span>} bodyClass="p-0">
              {r.evidenceBasis && (
                <div className={cn("border-b border-border px-4 py-3", r.evidenceBasis !== "direct" && "bg-[hsl(28_85%_52%/0.05)]")} data-testid="text-evidence-basis">
                  <div className="text-[13px] font-medium">{basisLabel[r.evidenceBasis]}</div>
                  {r.evidenceBasis === "inferred" && r.interpretationNote && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{r.interpretationNote}</p>}
                  {r.evidenceBasis === "none" && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">No passage in the source states this risk directly. A human must review the document before relying on it.</p>}
                </div>
              )}
              {!r.evidence.length ? <EmptyState icon={<Quote className="size-5" />} title="No quotes attached" body="A risk without a source quote cannot be trusted on its own. Review the source document directly." />
                : r.evidence.map((e) => <EvidenceItem key={e.id} e={e} />)}
            </Panel>

            <Panel title="Recommended mitigation" aside={<Wrench className="size-3.5 text-muted-foreground" />}>
              {r.recommendedMitigation
                ? <p className="text-[14px] leading-relaxed" data-testid="text-recommended-mitigation">{r.recommendedMitigation}</p>
                : <p className="text-sm text-muted-foreground">No mitigation was recommended for this risk.</p>}
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
              : <>
                <p className="mb-4 text-xs leading-relaxed text-muted-foreground">Newest first. Every assessment is preserved; later runs append to this record and never overwrite it.</p>
                <ol className="relative space-y-5 border-l border-border pl-5">
                  {assessments.map((a) => <AssessmentItem key={a.id} a={a} />)}
                </ol>
              </>}
          </Panel>
        </div>
      </>}
    </div>
  );
}

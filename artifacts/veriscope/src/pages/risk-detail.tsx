import { useState } from "react";
import { Link, useParams } from "wouter";
import { ShieldAlert, BadgeCheck, MessageSquareWarning, Briefcase, CircleAlert, ArrowUpRight, Quote, Flag, FileText, Wrench, ChevronRight } from "lucide-react";
import type { Evidence, Assessment, AssessmentKind, EvidenceBasis } from "@workspace/api-client-react";
import { PageHeader, Panel, Skel, EmptyState, ErrorState, SeverityChip, StatusChip, Chip, EvidenceStatusBadge, BackLink, Disclosure, stamp, riskCode, btnGhost, verdictStyle, verdictLabel } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useRiskQuery, ActionsSection, ReassessPanel, StatusControl, StatusHistory, ClosureProgress } from "@/components/risk-workflow";

export const kindLabel: Record<AssessmentKind, string> = { initial: "First check", reanalysis: "Document checked again", reassessment: "Checked with new evidence" };
const basisLabel: Record<EvidenceBasis, string> = {
  direct: "The document states this directly.",
  inferred: "This is an interpretation of several passages, not a single direct quote.",
  none: "No passage states this risk directly.",
};

export function EvidenceItem({ e, compact }: { e: Evidence; compact?: boolean }) {
  const located = e.matchType !== "not_found" && e.startOffset != null && e.endOffset != null;
  const href = located ? `/documents/${e.documentId}?start=${e.startOffset}&end=${e.endOffset}` : `/documents/${e.documentId}`;
  const isVerified = e.verified === true && e.matchType !== "not_found";
  const claimDiffers = e.claimedQuote != null && e.claimedQuote !== e.quote;
  return (
    <figure className={cn("group", compact ? "py-2" : "border-b border-border px-4 py-4 last:border-0")} data-testid={`card-evidence-${e.id}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {isVerified
          ? <Chip className="border-accent/35 bg-accent/10 text-accent" testId={`status-evidence-${e.id}`}><BadgeCheck className="size-3" aria-hidden />{e.matchType === "exact" ? "Exact match in document" : "Matches document (minor spacing differences)"}</Chip>
          : <Chip className="border-dashed border-destructive/60 bg-destructive/5 text-destructive" testId={`status-evidence-${e.id}`}><CircleAlert className="size-3" aria-hidden />Not found in document</Chip>}
        <Link href={href} data-testid={`link-evidence-${e.id}`} title={located ? `Characters ${e.startOffset}–${e.endOffset}` : undefined} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline underline-offset-4">
          {e.pageNumber != null && `Page ${e.pageNumber} · `}{located ? "Show in document" : "Open document"}<ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
        </Link>
      </div>
      {isVerified ? (
        <blockquote className={cn("border-l-2 border-accent pl-4 font-quote italic leading-relaxed text-foreground", compact ? "text-[14px]" : "text-[16px]")}>"{e.quote}"</blockquote>
      ) : (
        <>
          <blockquote className={cn("border-l-2 border-dashed border-destructive/60 pl-4 font-quote italic leading-relaxed text-foreground/60 line-through decoration-destructive/50", compact ? "text-[14px]" : "text-[16px]")}>"{e.claimedQuote ?? e.quote}"</blockquote>
          <div className="mt-1.5 pl-4 text-[12.5px] font-medium text-destructive">This text could not be found in the document. Do not rely on it.</div>
        </>
      )}
      <div className="mt-2 space-y-0.5 pl-4 text-[12px] text-muted-foreground">
        {isVerified && e.matchType === "normalized" && e.normalizations.length > 0 && <div data-testid={`text-normalized-${e.id}`}>Differences ignored: {e.normalizations.join(", ")}</div>}
        {isVerified && claimDiffers && <div>The AI wrote: <span className="font-quote text-[13px] italic">"{e.claimedQuote}"</span> (shown above as it appears in the document)</div>}
        {e.matchCount > 1 && <div className="text-[hsl(28_85%_32%)]" data-testid={`text-ambiguous-${e.id}`}>This text appears {e.matchCount} times in the document, so the exact location is uncertain.</div>}
        {!compact && <div>{e.documentTitle}</div>}
      </div>
    </figure>
  );
}

export function AssessmentItem({ a, riskId }: { a: Assessment; riskId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="relative rise" data-testid={`item-assessment-${a.id}`}>
      <span className={cn("absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-card", a.kind === "initial" ? "bg-foreground" : "bg-accent ring-1 ring-foreground/40")} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] font-semibold">{kindLabel[a.kind]}</span>
        <Chip className={verdictStyle[a.verdict]}>{a.kind === "reassessment" && "AI suggests: "}{verdictLabel[a.verdict]}</Chip>
      </div>
      {a.kind === "reassessment" && (
        <div className="mt-1.5 space-y-0.5 text-[12px]">
          {a.evidenceDocumentTitle && <div>Evidence: {a.evidenceDocumentId != null ? <Link href={`/documents/${a.evidenceDocumentId}`} className="underline underline-offset-4">{a.evidenceDocumentTitle}</Link> : a.evidenceDocumentTitle}</div>}
          <div data-testid={`text-decision-${a.id}`} className={cn(a.decision ? "font-medium" : "text-[hsl(28_85%_36%)]")}>
            {a.decision ? `${a.decision === "accepted" ? "Accepted" : "Rejected"} by ${a.decidedBy ?? "unknown"}${a.decidedAt ? ` · ${stamp(a.decidedAt)}` : ""}` : "Waiting for your decision"}
          </div>
          <Link href={`/risks/${riskId}/reassessments/${a.id}`} data-testid={`link-compare-${a.id}`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary underline underline-offset-4">See before and after</Link>
        </div>
      )}
      {(a.severity || a.likelihood || a.evidenceBasis) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {a.severity && <SeverityChip severity={a.severity} />}
          {a.likelihood && <Chip className="border-border text-muted-foreground">Likelihood {a.likelihood}</Chip>}
          {a.evidenceBasis && <Chip className="border-border text-muted-foreground">{a.evidenceBasis === "direct" ? "Direct quote" : a.evidenceBasis === "inferred" ? "Interpretation" : "No quote"}</Chip>}
        </div>
      )}
      <p className="mt-1.5 text-[13px] leading-relaxed">{a.rationale}</p>
      <div className="mt-1 text-[12px] text-muted-foreground">
        {stamp(a.createdAt)}{a.confidence != null && ` · ${Math.round(a.confidence * (a.confidence <= 1 ? 100 : 1))}% confidence`}{a.model && ` · ${a.model}`}{a.analysisRunId != null && ` · run #${a.analysisRunId}`}
      </div>
            {a.evidence.length > 0 && (
        <div className="mt-1.5">
          <button onClick={() => setOpen((o) => !o)} data-testid={`button-toggle-quotes-${a.id}`} aria-expanded={open} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden />{a.evidence.length} quote{a.evidence.length > 1 && "s"} · {a.evidence.filter((e) => e.verified).length} verified
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
  const q = useRiskQuery(id, valid);
  const r = q.data;

  if (!valid || (q.isError && (q.error as { status?: number })?.status === 404)) {
    return <EmptyState testId="empty-risk-missing" icon={<ShieldAlert className="size-5" />} title="Risk not found" body="It may have been removed when its source document was deleted." action={<Link href="/risks" className={btnGhost}>Back to risks</Link>} />;
  }

  const assessments = r ? [...r.assessments].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)) : [];
  const src = r?.sourceDocument;

  return (
    <div className="space-y-6">
      <BackLink href="/risks" testId="link-back-risks">Risks to fix</BackLink>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !r ? (
        <div className="space-y-4"><Skel className="h-3 w-28" /><Skel className="h-10 w-3/4" /><Skel className="h-24" /><Skel className="h-40" /></div>
      ) : <>
        {/* 1. The problem */}
        <PageHeader eyebrow={<span>{r.category} · {riskCode(r.id)}</span>} title={<span data-testid="text-risk-title">{r.title}</span>}
          meta={<div className="space-y-2.5">
            <span className="flex flex-wrap items-center gap-2">
              <SeverityChip severity={r.severity} testId="status-severity" />
              {r.likelihood && <Chip className="border-border text-muted-foreground" testId="status-likelihood">Likelihood {r.likelihood}</Chip>}
              <StatusChip status={r.status} testId="status-risk" />
              <EvidenceStatusBadge status={r.evidenceStatus} testId="status-evidence-overall" />
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              <FileText className="size-4 text-muted-foreground" aria-hidden />
              <span>Found in</span>
              <Link href={`/documents/${r.documentId}`} data-testid="link-source-document" className="font-medium text-foreground underline decoration-primary/60 decoration-2 underline-offset-4 hover:decoration-primary">{src?.title ?? r.documentTitle}</Link>
              {src && <span className="text-muted-foreground">({[src.sourceType.toUpperCase(), src.pageCount != null ? `${src.pageCount} pages` : null].filter(Boolean).join(", ")})</span>}
              <span className="text-muted-foreground">· Updated {stamp(r.updatedAt)}</span>
            </span>
          </div>} />

        {r.reviewRequired && (
          <div className="flex gap-3 rounded-lg border border-[hsl(28_85%_45%/0.6)] bg-[hsl(32_100%_97%)] px-4 py-3" data-testid="callout-review-required" role="note">
            <Flag className="mt-0.5 size-4 shrink-0 text-[hsl(28_85%_36%)]" aria-hidden />
            <div>
              <div className="text-[14px] font-semibold text-[hsl(28_85%_24%)]">Needs your review</div>
              {r.reviewReasons.length > 0
                ? <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13.5px] leading-relaxed">{r.reviewReasons.map((x, i) => <li key={i} data-testid={`text-review-reason-${i}`}>{x}</li>)}</ul>
                : <p className="mt-1 text-[13.5px]">This risk has been flagged for a person to check.</p>}
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="order-2 min-w-0 space-y-6 lg:order-1">
            {/* 2. Why it matters */}
            <Panel title="Why it matters" aside={<Briefcase className="size-4 text-muted-foreground" aria-hidden />} testId="section-why">
              <p className="text-[15px] leading-relaxed" data-testid="text-risk-description">{r.description}</p>
              {r.businessImpact && (
                <div className="mt-3 rounded-md bg-muted/60 px-3 py-2.5">
                  <div className="text-[12.5px] font-semibold text-muted-foreground">Impact on your business</div>
                  <p className="mt-0.5 text-[14px] leading-relaxed" data-testid="text-business-impact">{r.businessImpact}</p>
                </div>
              )}
              {r.severityReason && (
                <div className="mt-3 rounded-md bg-muted/60 px-3 py-2.5" data-testid="text-severity-reason">
                  <div className="text-[12.5px] font-semibold text-muted-foreground">Why this priority</div>
                  <p className="mt-0.5 text-[14px] leading-relaxed">{r.severityReason}</p>
                </div>
              )}
              {r.reviewNotes && (
                <div className="mt-3 flex gap-3 rounded-md border border-dashed border-[hsl(28_85%_52%/0.6)] bg-[hsl(28_85%_52%/0.06)] px-3 py-2.5" data-testid="text-review-notes">
                  <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-[hsl(28_85%_36%)]" aria-hidden />
                  <div><div className="text-[12.5px] font-semibold text-[hsl(28_85%_28%)]">What to double-check</div><p className="mt-0.5 text-[13.5px] leading-relaxed">{r.reviewNotes}</p></div>
                </div>
              )}
            </Panel>

            {/* 3. Evidence */}
            <Panel title="Text found in your document" subtitle="Each quote is checked word for word against the original document."
              aside={<span className="text-[12.5px] font-medium text-muted-foreground" data-testid="text-evidence-verified">{r.verifiedEvidenceCount} of {r.evidenceCount} verified</span>} bodyClass="p-0">
              {r.evidenceBasis && (
                <div className={cn("border-b border-border px-4 py-3", r.evidenceBasis !== "direct" && "bg-[hsl(28_85%_52%/0.05)]")} data-testid="text-evidence-basis">
                  <div className="text-[13.5px] font-medium">{basisLabel[r.evidenceBasis]}</div>
                  {r.evidenceBasis === "inferred" && r.interpretationNote && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{r.interpretationNote}</p>}
                  {r.evidenceBasis === "none" && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">A person should read the document before relying on this risk.</p>}
                </div>
              )}
              {!r.evidence.length ? <EmptyState icon={<Quote className="size-5" />} title="No quotes attached" body="Without a quote from the document, this risk should not be relied on by itself. Read the document directly." />
                : r.evidence.map((e) => <EvidenceItem key={e.id} e={e} />)}
            </Panel>

            {/* 4. What to do next */}
            <section className="space-y-3" data-testid="section-next">
              <h2 className="text-[17px] font-semibold">What to do next</h2>
              <Panel title="Suggested fix" aside={<Wrench className="size-4 text-muted-foreground" aria-hidden />}>
                {r.recommendedMitigation
                  ? <p className="text-[14px] leading-relaxed" data-testid="text-recommended-mitigation">{r.recommendedMitigation}</p>
                  : <p className="text-[13.5px] text-muted-foreground">No fix was suggested for this risk.</p>}
              </Panel>
              <ActionsSection risk={r} />
            </section>

            {/* 5. Check again */}
            <ReassessPanel risk={r} />

            {/* 6. Decision and history */}
            <section className="space-y-3" data-testid="section-decision">
              <h2 className="text-[17px] font-semibold">Decision and history</h2>
              <StatusControl risk={r} />
              <Disclosure summary={`All checks (${assessments.length})`} hint="Every check is kept. Newer checks never overwrite older ones." testId="details-assessment-history">
                <div className="p-4">
                  {!assessments.length ? <p className="text-[13px] text-muted-foreground">No checks recorded yet.</p>
                    : <ol className="relative ml-1.5 space-y-5 border-l border-border pl-5">{assessments.map((a) => <AssessmentItem key={a.id} a={a} riskId={r.id} />)}</ol>}
                </div>
              </Disclosure>
              <StatusHistory changes={r.statusChanges} riskId={r.id} />
            </section>
          </div>

          <aside className="order-1 space-y-6 self-start lg:sticky lg:top-[88px] lg:order-2" aria-label="Progress">
            <ClosureProgress risk={r} />
          </aside>
        </div>
      </>}
    </div>
  );
}

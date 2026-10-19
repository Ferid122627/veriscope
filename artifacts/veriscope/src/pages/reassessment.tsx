import { useState } from "react";
import { Link, useParams } from "wouter";
import { format, parseISO } from "date-fns";
import { ShieldAlert, AlertTriangle, CheckCircle2, CircleDashed, ArrowRight, ShieldCheck, FileText } from "lucide-react";
import {
  PageHeader, Panel, Skel, EmptyState, ErrorState, SeverityChip, StatusChip, Chip, AiRecommendation, BackLink, Disclosure,
  verdictStyle, verdictLabel, evidenceTypeLabel, riskCode, stamp, btnGhost, btnPrimary, labelCls,
} from "@/components/kit";
import { useRiskQuery, DecisionForm, CloseRiskDialog, StatusHistory } from "@/components/risk-workflow";
import { EvidenceItem, AssessmentItem } from "@/pages/risk-detail";
import { cn } from "@/lib/utils";

function List({ title, items, icon, testId }: { title: string; items: string[] | null; icon: React.ReactNode; testId: string }) {
  return (
    <div data-testid={testId}>
      <div className={labelCls}>{title}</div>
      {!items?.length ? <p className="mt-1 text-[13px] text-muted-foreground">None listed.</p> : (
        <ul className="mt-1 space-y-1">{items.map((x, i) => <li key={i} className="flex gap-2 text-[13px] leading-snug">{icon}<span>{x}</span></li>)}</ul>
      )}
    </div>
  );
}

export default function Reassessment() {
  const params = useParams<{ id: string; assessmentId: string }>();
  const id = Number(params.id); const aid = Number(params.assessmentId);
  const valid = Number.isInteger(id) && id > 0 && Number.isInteger(aid) && aid > 0;
  const q = useRiskQuery(id, valid);
  const [closing, setClosing] = useState(false);
  const r = q.data;
  const a = r?.assessments.find((x) => x.id === aid);

  if (!valid || (q.isError && (q.error as { status?: number })?.status === 404) || (r && !a)) {
    return <EmptyState testId="empty-reassessment-missing" icon={<ShieldAlert className="size-5" />} title="Check not found" body="This check does not exist for this risk." action={<Link href={valid ? `/risks/${id}` : "/risks"} className={btnGhost}>Back to risk</Link>} />;
  }

  const action = r && a?.actionId != null ? r.actions.find((x) => x.id === a.actionId) : undefined;
  const history = r ? [...r.assessments].sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt)) : [];
  const adjusted = !!a?.guardrailNotes?.length;

  return (
    <div className="space-y-6">
      <BackLink href={`/risks/${id}`} testId="link-back-risk">Back to risk</BackLink>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !r || !a ? (
        <div className="space-y-4"><Skel className="h-10 w-2/3" /><div className="grid gap-6 lg:grid-cols-2"><Skel className="h-80" /><Skel className="h-80" /></div></div>
      ) : <>
        <PageHeader eyebrow={`Evidence check #${a.id} · ${riskCode(r.id)}`} title={<span data-testid="text-reassessment-title">{r.title}</span>}
          description="Compare the original problem with the new evidence, read the AI's suggestion, then record your decision."
          meta={<span className="flex flex-wrap items-center gap-2"><StatusChip status={r.status} testId="status-risk" /><span className="text-[12.5px]">Checked {stamp(a.createdAt)}{a.model && ` · ${a.model}`}</span></span>}>
          {r.status !== "closed" && <button className={btnGhost} onClick={() => setClosing(true)} data-testid="button-close-risk"><ShieldCheck className="size-3.5" aria-hidden /> Close risk…</button>}
        </PageHeader>

        {adjusted && (
          <div className="rounded-lg border-2 border-[hsl(28_85%_45%)] bg-[hsl(32_100%_97%)] px-4 py-3" data-testid="callout-guardrail" role="note">
            <div className="flex items-start gap-2 text-[14px] font-semibold text-[hsl(28_85%_24%)]"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Our safety rules changed the AI's answer. The AI said "{a.aiVerdict ? verdictLabel[a.aiVerdict] : "unknown"}"; it is recorded as "{verdictLabel[a.verdict]}".</span>
            </div>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-10 text-[13px]">{a.guardrailNotes!.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* BEFORE */}
          <section className="space-y-4 min-w-0" data-testid="column-before">
            <div className="flex items-baseline gap-2 border-b-2 border-foreground/70 pb-1.5"><h2 className="text-lg font-semibold">Before</h2><span className="text-[13px] text-muted-foreground">the original problem</span></div>
            <Panel title="The problem">
              <div className="flex flex-wrap gap-1.5"><SeverityChip severity={r.severity} />{r.likelihood && <Chip className="border-border text-muted-foreground">likelihood {r.likelihood}</Chip>}</div>
              <p className="mt-2 text-[15px] leading-relaxed">{r.description}</p>
              {r.businessImpact && <div className="mt-3"><div className={labelCls}>Impact on your business</div><p className="mt-0.5 text-[13.5px] leading-relaxed">{r.businessImpact}</p></div>}
              <div className="mt-3 text-[12.5px] text-muted-foreground">Found in: <Link href={`/documents/${r.documentId}`} className="text-foreground underline underline-offset-4">{r.sourceDocument?.title ?? r.documentTitle}</Link></div>
            </Panel>
            <Panel title="Text found in the original document" aside={<span className="text-[12.5px] text-muted-foreground">{r.verifiedEvidenceCount} of {r.evidenceCount} verified</span>} bodyClass="p-0">
              {!r.evidence.length ? <p className="p-4 text-[13px] text-muted-foreground">No quotes were recorded for this risk.</p> : r.evidence.map((e) => <EvidenceItem key={e.id} e={e} />)}
            </Panel>
            <Panel title="Action this evidence relates to">
              {!action ? <p className="text-[13px] text-muted-foreground">{a.actionId != null ? "The linked action no longer exists." : "This check was not linked to a specific action."}</p> : (
                <div data-testid="card-evaluated-action">
                  <div className="flex items-start justify-between gap-2"><p className="text-[14px] leading-snug">{action.description}</p><StatusChip status={action.status} /></div>
                  <div className="mt-1 text-[12.5px] text-muted-foreground">Owner: {action.owner ?? "Not assigned"} · {action.dueDate ? `Due ${format(parseISO(action.dueDate), "dd MMM yyyy")}` : "No due date"}</div>
                  {(action.evidenceNote || action.evidenceDocumentId) && <div className="mt-2 border-l-2 border-border pl-3 text-[12.5px]">
                    <span className={labelCls}>Proof it was done</span>
                    {action.evidenceNote && <p className="mt-0.5">{action.evidenceNote}</p>}
                    {action.evidenceDocumentId && <Link href={`/documents/${action.evidenceDocumentId}`} className="underline underline-offset-4">{action.evidenceDocumentTitle ?? `Document ${action.evidenceDocumentId}`}</Link>}
                  </div>}
                </div>
              )}
            </Panel>
          </section>

          {/* AFTER */}
          <section className="space-y-4 min-w-0" data-testid="column-after">
            <div className="flex items-baseline gap-2 border-b-2 border-primary pb-1.5"><h2 className="text-lg font-semibold">After</h2><span className="text-[13px] text-muted-foreground">the new evidence</span></div>
            <Panel title="New evidence">
              {a.evidenceDocumentId != null
                ? <Link href={`/documents/${a.evidenceDocumentId}`} data-testid="link-evidence-document" className="inline-flex items-center gap-2 text-[15px] font-medium underline decoration-primary/60 decoration-2 underline-offset-4 hover:decoration-primary"><FileText className="size-4" aria-hidden />{a.evidenceDocumentTitle ?? `Document ${a.evidenceDocumentId}`}</Link>
                : <p className="text-[13px] text-muted-foreground">No evidence document was recorded.</p>}
              {a.evidenceType && (
                <div className="mt-3" data-testid="text-evidence-type">
                  <Chip className={a.evidenceType === "operating_evidence" ? "border-accent/35 bg-accent/10 text-accent" : "border-dashed border-foreground/30"}>{evidenceTypeLabel[a.evidenceType].label}</Chip>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{evidenceTypeLabel[a.evidenceType].explain}</p>
                </div>
              )}
            </Panel>
            <Panel title="Text found in the new evidence" aside={<span className="text-[12.5px] text-muted-foreground">{a.evidence.filter((e) => e.verified).length} of {a.evidence.length} verified</span>} bodyClass="p-0">
              {!a.evidence.length ? <p className="p-4 text-[13px] text-muted-foreground">The AI did not quote any text from the new evidence.</p> : a.evidence.map((e) => <EvidenceItem key={e.id} e={e} />)}
            </Panel>
            <AiRecommendation testId="box-ai-recommendation">
              <div className="flex flex-wrap items-center gap-2">
                <Chip className={cn("text-[11.5px]", verdictStyle[a.verdict])} testId="status-ai-outcome">{verdictLabel[a.verdict]}</Chip>
                {a.confidence != null && <span className="text-[12px] text-muted-foreground">{Math.round(a.confidence * (a.confidence <= 1 ? 100 : 1))}% confidence</span>}
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed" data-testid="text-rationale">{a.rationale}</p>
              <div className="mt-3 grid gap-3">
                <List title="What is now in place" items={a.requirementsMet} icon={<CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[hsl(150_40%_32%)]" />} testId="list-requirements-met" />
                <List title="What is still missing" items={a.remainingGaps} icon={<CircleDashed className="mt-0.5 size-3.5 shrink-0 text-destructive" />} testId="list-remaining-gaps" />
                <List title="Suggested next steps" items={a.nextSteps} icon={<ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />} testId="list-next-steps" />
              </div>
            </AiRecommendation>
            <DecisionForm assessment={a} riskId={r.id} />
            {r.status !== "closed" ? (
              <div className="flex flex-col gap-3 rounded-lg border border-card-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div><div className="text-[14px] font-semibold">Ready to close this risk?</div><p className="mt-0.5 text-[12.5px] text-muted-foreground">Closing is a separate approval, recorded with your name and reason.</p></div>
                <button className={`${btnPrimary} shrink-0 whitespace-nowrap`} onClick={() => setClosing(true)} data-testid="button-close-risk-bottom"><ShieldCheck className="size-3.5" aria-hidden /> Close risk…</button>
              </div>
            ) : <p className="text-[13px] text-muted-foreground">This risk is closed. See the status history below.</p>}
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <Disclosure className="self-start" summary={`All checks for this risk (${history.length})`} hint="Newest first. Every check is kept for comparison." testId="details-assessment-history">
            <div className="p-4"><ol className="relative ml-1.5 space-y-5 border-l border-border pl-5">{history.map((x) => <AssessmentItem key={x.id} a={x} riskId={r.id} />)}</ol></div>
          </Disclosure>
          <StatusHistory changes={r.statusChanges} riskId={r.id} />
        </div>

        <CloseRiskDialog risk={r} open={closing} onOpenChange={setClosing} assessmentId={a.id} verdict={a.verdict} />
      </>}
    </div>
  );
}

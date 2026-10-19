import { useState } from "react";
import { Link, useParams } from "wouter";
import { format, parseISO } from "date-fns";
import { ArrowLeft, ShieldAlert, AlertTriangle, CheckCircle2, CircleDashed, ArrowRight, ShieldCheck, FileText } from "lucide-react";
import {
  PageHeader, Panel, Skel, EmptyState, ErrorState, SeverityChip, StatusChip, Chip, AiRecommendation,
  verdictStyle, verdictLabel, evidenceTypeLabel, riskCode, stamp, btnGhost, btnPrimary, labelCls,
} from "@/components/kit";
import { useRiskQuery, DecisionForm, CloseRiskDialog, StatusHistory } from "@/components/risk-workflow";
import { EvidenceItem, AssessmentItem } from "@/pages/risk-detail";
import { cn } from "@/lib/utils";

function List({ title, items, icon, testId }: { title: string; items: string[] | null; icon: React.ReactNode; testId: string }) {
  return (
    <div data-testid={testId}>
      <div className={labelCls}>{title}</div>
      {!items?.length ? <p className="mt-1 text-[12.5px] text-muted-foreground">None listed.</p> : (
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
    return <EmptyState testId="empty-reassessment-missing" icon={<ShieldAlert className="size-5" />} title="Reassessment not found" body="This assessment does not exist for this risk." action={<Link href={valid ? `/risks/${id}` : "/risks"} className={btnGhost}>Back to risk</Link>} />;
  }

  const action = r && a?.actionId != null ? r.actions.find((x) => x.id === a.actionId) : undefined;
  const history = r ? [...r.assessments].sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt)) : [];
  const adjusted = !!a?.guardrailNotes?.length;

  return (
    <div className="space-y-6">
      <Link href={`/risks/${id}`} data-testid="link-back-risk" className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Back to risk</Link>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !r || !a ? (
        <div className="space-y-4"><Skel className="h-10 w-2/3" /><div className="grid gap-6 lg:grid-cols-2"><Skel className="h-80" /><Skel className="h-80" /></div></div>
      ) : <>
        <PageHeader eyebrow={`Reassessment #${a.id} · ${riskCode(r.id)}`} title={<span data-testid="text-reassessment-title">{r.title}</span>}
          meta={<span className="flex flex-wrap items-center gap-2"><StatusChip status={r.status} testId="status-risk" /><span className="font-mono text-xs">recorded {stamp(a.createdAt)}{a.model && ` · ${a.model}`}</span></span>}>
          {r.status !== "closed" && <button className={btnPrimary} onClick={() => setClosing(true)} data-testid="button-close-risk"><ShieldCheck className="size-3.5" /> Close risk</button>}
        </PageHeader>

        {adjusted && (
          <div className="rounded-sm border-2 border-[hsl(28_85%_45%)] bg-[hsl(28_85%_52%/0.08)] px-4 py-3" data-testid="callout-guardrail">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-[hsl(28_85%_28%)]"><AlertTriangle className="size-4" />
              Outcome adjusted by verification rules: AI said {a.aiVerdict ? verdictLabel[a.aiVerdict] : "unknown"}, recorded as {verdictLabel[a.verdict]}
            </div>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-10 text-[13px]">{a.guardrailNotes!.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* BEFORE */}
          <section className="space-y-4 min-w-0" data-testid="column-before">
            <div className="flex items-baseline gap-3 border-b-2 border-foreground/80 pb-1.5"><span className="font-serif text-2xl">Before</span><span className={labelCls}>the risk as identified</span></div>
            <Panel title="Original risk">
              <div className="flex flex-wrap gap-1.5"><SeverityChip severity={r.severity} />{r.likelihood && <Chip className="border-border text-muted-foreground">likelihood {r.likelihood}</Chip>}</div>
              <p className="mt-2 font-serif text-[16px] leading-relaxed">{r.description}</p>
              {r.businessImpact && <div className="mt-3"><div className={labelCls}>Business impact</div><p className="mt-0.5 text-[13.5px] leading-relaxed">{r.businessImpact}</p></div>}
              <div className="mt-3 font-mono text-[11px] text-muted-foreground">Source: <Link href={`/documents/${r.documentId}`} className="text-foreground underline underline-offset-4">{r.sourceDocument?.title ?? r.documentTitle}</Link></div>
            </Panel>
            <Panel title="Source evidence" aside={<span className="font-mono text-[11px]">{r.verifiedEvidenceCount}/{r.evidenceCount} verified</span>} bodyClass="p-0">
              {!r.evidence.length ? <p className="p-4 text-[13px] text-muted-foreground">No source quotations recorded for this risk.</p> : r.evidence.map((e) => <EvidenceItem key={e.id} e={e} />)}
            </Panel>
            <Panel title="Mitigation action evaluated">
              {!action ? <p className="text-[13px] text-muted-foreground">{a.actionId != null ? "The linked action no longer exists." : "This reassessment was not linked to a specific action."}</p> : (
                <div data-testid="card-evaluated-action">
                  <div className="flex items-start justify-between gap-2"><p className="text-[14px] leading-snug">{action.description}</p><StatusChip status={action.status} /></div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">{action.owner ?? "Unassigned"} · {action.dueDate ? `due ${format(parseISO(action.dueDate), "dd MMM yyyy")}` : "no due date"}</div>
                  {(action.evidenceNote || action.evidenceDocumentId) && <div className="mt-2 border-l-2 border-border pl-3 text-[12.5px]">
                    <span className={labelCls}>Supporting evidence</span>
                    {action.evidenceNote && <p className="mt-0.5">{action.evidenceNote}</p>}
                    {action.evidenceDocumentId && <Link href={`/documents/${action.evidenceDocumentId}`} className="underline underline-offset-4">{action.evidenceDocumentTitle ?? `Document ${action.evidenceDocumentId}`}</Link>}
                  </div>}
                </div>
              )}
            </Panel>
          </section>

          {/* AFTER */}
          <section className="space-y-4 min-w-0" data-testid="column-after">
            <div className="flex items-baseline gap-3 border-b-2 border-accent pb-1.5"><span className="font-serif text-2xl">After</span><span className={labelCls}>new evidence</span></div>
            <Panel title="Evidence document">
              {a.evidenceDocumentId != null
                ? <Link href={`/documents/${a.evidenceDocumentId}`} data-testid="link-evidence-document" className="inline-flex items-center gap-2 font-serif text-[17px] underline decoration-accent decoration-2 underline-offset-4"><FileText className="size-4" />{a.evidenceDocumentTitle ?? `Document ${a.evidenceDocumentId}`}</Link>
                : <p className="text-[13px] text-muted-foreground">No evidence document recorded.</p>}
              {a.evidenceType && (
                <div className="mt-3" data-testid="text-evidence-type">
                  <Chip className={a.evidenceType === "operating_evidence" ? "border-foreground/20 bg-accent text-accent-foreground" : "border-dashed border-foreground/30"}>{evidenceTypeLabel[a.evidenceType].label}</Chip>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{evidenceTypeLabel[a.evidenceType].explain}</p>
                </div>
              )}
            </Panel>
            <Panel title="Quoted passages from new evidence" aside={<span className="font-mono text-[11px]">{a.evidence.filter((e) => e.verified).length}/{a.evidence.length} verified</span>} bodyClass="p-0">
              {!a.evidence.length ? <p className="p-4 text-[13px] text-muted-foreground">The AI cited no passages from the new document.</p> : a.evidence.map((e) => <EvidenceItem key={e.id} e={e} />)}
            </Panel>
            <AiRecommendation testId="box-ai-recommendation">
              <div className="flex flex-wrap items-center gap-2">
                <Chip className={cn("text-[11.5px]", verdictStyle[a.verdict])} testId="status-ai-outcome">{verdictLabel[a.verdict]}</Chip>
                {a.confidence != null && <span className="font-mono text-[11px] text-muted-foreground">{Math.round(a.confidence * (a.confidence <= 1 ? 100 : 1))}% confidence</span>}
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed" data-testid="text-rationale">{a.rationale}</p>
              <div className="mt-3 grid gap-3">
                <List title="Requirements met" items={a.requirementsMet} icon={<CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[hsl(150_40%_32%)]" />} testId="list-requirements-met" />
                <List title="Remaining gaps" items={a.remainingGaps} icon={<CircleDashed className="mt-0.5 size-3.5 shrink-0 text-destructive" />} testId="list-remaining-gaps" />
                <List title="Recommended next steps" items={a.nextSteps} icon={<ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />} testId="list-next-steps" />
              </div>
            </AiRecommendation>
            <DecisionForm assessment={a} riskId={r.id} />
            {r.status !== "closed" ? (
              <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-card p-3">
                <p className="text-[12.5px] text-muted-foreground">Closing the risk is a separate approval and is recorded in the status history.</p>
                <button className={`${btnGhost} shrink-0 whitespace-nowrap`} onClick={() => setClosing(true)} data-testid="button-close-risk-bottom"><ShieldCheck className="size-3.5" /> Close risk</button>
              </div>
            ) : <p className="text-[12.5px] text-muted-foreground">This risk is closed. See the status history below.</p>}
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <Panel title="Full assessment history">
            <p className="mb-4 text-xs text-muted-foreground">Newest first. Every assessment is preserved for comparison.</p>
            <ol className="relative space-y-5 border-l border-border pl-5">{history.map((x) => <AssessmentItem key={x.id} a={x} riskId={r.id} />)}</ol>
          </Panel>
          <StatusHistory changes={r.statusChanges} riskId={r.id} />
        </div>

        <CloseRiskDialog risk={r} open={closing} onOpenChange={setClosing} assessmentId={a.id} verdict={a.verdict} />
      </>}
    </div>
  );
}

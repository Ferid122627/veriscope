import type { ReactNode } from "react";
import { formatDistanceToNowStrict, format } from "date-fns";
import { AlertTriangle, RotateCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BadgeCheck, CircleAlert, CircleDashed, CircleSlash } from "lucide-react";

import { RiskSeverity, RiskStatus, RiskLikelihood, ActionStatus, EvidenceStatus as EvidenceStatusEnum } from "@workspace/api-client-react";
import type { EvidenceStatus, AssessmentVerdict, EvidenceType } from "@workspace/api-client-react";

const sevRank: Record<RiskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export const SEVERITIES = (Object.values(RiskSeverity) as RiskSeverity[]).sort((a, b) => sevRank[a] - sevRank[b]);
export const STATUSES = Object.values(RiskStatus) as RiskStatus[];
export const LIKELIHOODS = Object.values(RiskLikelihood) as RiskLikelihood[];
export const EVIDENCE_STATUSES = Object.values(EvidenceStatusEnum) as EvidenceStatus[];
export const evidenceStatusLabel: Record<EvidenceStatus, string> = {
  verified: "Verified", partially_verified: "Partially verified", unverified: "Unverified", no_evidence: "No quotation",
};

export const sevStyle: Record<string, { dot: string; chip: string; bar: string }> = {
  critical: { dot: "bg-[hsl(4_72%_48%)]", chip: "text-[hsl(4_72%_40%)] bg-[hsl(4_72%_48%/0.1)] border-[hsl(4_72%_48%/0.3)]", bar: "bg-[hsl(4_72%_48%)]" },
  high: { dot: "bg-[hsl(28_85%_52%)]", chip: "text-[hsl(28_85%_36%)] bg-[hsl(28_85%_52%/0.1)] border-[hsl(28_85%_52%/0.3)]", bar: "bg-[hsl(28_85%_52%)]" },
  medium: { dot: "bg-[hsl(48_85%_50%)]", chip: "text-[hsl(42_80%_30%)] bg-[hsl(48_85%_50%/0.14)] border-[hsl(48_85%_50%/0.4)]", bar: "bg-[hsl(48_85%_50%)]" },
  low: { dot: "bg-[hsl(190_40%_45%)]", chip: "text-[hsl(190_45%_30%)] bg-[hsl(190_40%_45%/0.1)] border-[hsl(190_40%_45%/0.3)]", bar: "bg-[hsl(190_40%_45%)]" },
};

export function Chip({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <span data-testid={testId} className={cn("inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-[1px] font-mono text-[10.5px] uppercase tracking-wider whitespace-nowrap", className)}>
      {children}
    </span>
  );
}

export function SeverityChip({ severity, testId }: { severity: string; testId?: string }) {
  const s = sevStyle[severity] ?? sevStyle.low;
  return <Chip testId={testId} className={s.chip}><span className={cn("size-1.5 rounded-full", s.dot)} />{severity}</Chip>;
}

const statusStyle: Record<string, string> = {
  open: "border-foreground/25 text-foreground",
  mitigating: "border-[hsl(230_38%_40%/0.4)] text-[hsl(230_38%_35%)] bg-[hsl(230_38%_40%/0.07)]",
  resolved: "border-[hsl(150_35%_35%/0.4)] text-[hsl(150_40%_26%)] bg-[hsl(150_35%_35%/0.08)]",
  closed: "border-[hsl(150_35%_35%/0.4)] text-[hsl(150_40%_26%)] bg-[hsl(150_35%_35%/0.08)]",
  submitted_for_review: "border-[hsl(150_35%_35%/0.4)] text-[hsl(150_40%_26%)] bg-[hsl(150_35%_35%/0.08)]",
  in_progress: "border-[hsl(230_38%_40%/0.4)] text-[hsl(230_38%_35%)] bg-[hsl(230_38%_40%/0.07)]",
  uploaded: "border-foreground/20 text-muted-foreground",
  analyzing: "border-[hsl(230_38%_40%/0.4)] text-[hsl(230_38%_35%)]",
  analyzed: "border-[hsl(150_35%_35%/0.4)] text-[hsl(150_40%_26%)]",
  failed: "border-destructive/40 text-destructive",
};
export function StatusChip({ status, testId }: { status: string; testId?: string }) {
  return <Chip testId={testId} className={statusStyle[status] ?? statusStyle.open}>{status.replace(/_/g, " ")}</Chip>;
}

export const ago = (d: string) => formatDistanceToNowStrict(new Date(d), { addSuffix: true });
export const stamp = (d: string) => format(new Date(d), "dd MMM yyyy, HH:mm");
export const num = (n: number) => n.toLocaleString("en-US");

export function PageHeader({ eyebrow, title, children, meta }: { eyebrow: string; title: ReactNode; children?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between rise">
      <div className="min-w-0">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</div>
        <h1 className="mt-1.5 font-serif text-[2rem] leading-[1.1] tracking-tight text-foreground md:text-[2.4rem]">{title}</h1>
        {meta && <div className="mt-2 text-sm text-muted-foreground">{meta}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}

export function Panel({ title, aside, children, className, bodyClass }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn("rounded-md border border-card-border bg-card", className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{title}</h2>
          {aside}
        </div>
      )}
      <div className={cn("p-4", bodyClass)}>{children}</div>
    </section>
  );
}

export function Skel({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-sm bg-muted", className)} />;
}

export function EmptyState({ icon, title, body, action, testId }: { icon: ReactNode; title: string; body: ReactNode; action?: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="relative mb-4 grid size-12 place-items-center rounded-full border border-dashed border-foreground/25 text-muted-foreground">
        {icon}
      </div>
      <div className="font-serif text-lg text-foreground">{title}</div>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function apiErrorMessage(err: unknown): string {
  const e = err as { data?: { error?: string }; message?: string } | null;
  return e?.data?.error ?? e?.message ?? "Unknown error";
}

export function ErrorState({ error, onRetry, title = "Could not load this data", testId }: { error: unknown; onRetry?: () => void; title?: string; testId?: string }) {
  return (
    <div data-testid={testId} className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/[0.05] p-4">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="mt-0.5 font-mono text-xs text-muted-foreground break-words">{apiErrorMessage(error)}</div>
      </div>
      {onRetry && (
        <button data-testid="button-retry" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors">
          <RotateCw className="size-3" /> Retry
        </button>
      )}
    </div>
  );
}

export const btn = "inline-flex items-center justify-center gap-2 rounded-sm px-3 h-8 text-[13px] font-medium transition-[transform,background-color] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
export const btnPrimary = cn(btn, "bg-primary text-primary-foreground hover:bg-primary/90");
export const btnGhost = cn(btn, "border border-border bg-card hover:bg-muted");

export function DocStatus({ status }: { status: string }) {
  if (status === "analyzing") return <Chip testId="status-document" className="border-[hsl(230_38%_40%/0.4)] text-[hsl(230_38%_35%)]"><Loader2 className="size-3 animate-spin" />analyzing</Chip>;
  if (status === "failed") return <Chip testId="status-document" className="border-destructive/50 bg-destructive/10 text-destructive">failed</Chip>;
  return <StatusChip status={status} testId="status-document" />;
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function existingDocId(err: unknown): number | null {
  const v = (err as { data?: { existingDocumentId?: number } } | null)?.data?.existingDocumentId;
  return typeof v === "number" ? v : null;
}

export function EvidenceStatusBadge({ status, testId }: { status: EvidenceStatus; testId?: string }) {
  if (status === "verified") return <Chip testId={testId} className="border-foreground/20 bg-accent text-accent-foreground"><BadgeCheck className="size-3" />{evidenceStatusLabel.verified}</Chip>;
  if (status === "partially_verified") return <Chip testId={testId} className="border-[hsl(48_85%_50%/0.5)] text-[hsl(42_80%_30%)] bg-[hsl(48_85%_50%/0.1)]"><CircleDashed className="size-3" />{evidenceStatusLabel.partially_verified}</Chip>;
  if (status === "unverified") return <Chip testId={testId} className="border-dashed border-destructive/60 text-destructive bg-destructive/5"><CircleAlert className="size-3" />{evidenceStatusLabel.unverified}</Chip>;
  return <Chip testId={testId} className="border-border text-muted-foreground"><CircleSlash className="size-3" />{evidenceStatusLabel.no_evidence}</Chip>;
}

export const riskCode = (id: number) => `R-${String(id).padStart(4, "0")}`;

export const ACTION_STATUSES = Object.values(ActionStatus) as ActionStatus[];
export const actionStatusLabel: Record<ActionStatus, string> = { open: "Open", in_progress: "In progress", submitted_for_review: "Submitted for review" };
export const riskStatusLabel: Record<RiskStatus, string> = { open: "Open", mitigating: "Mitigating", closed: "Closed" };

export const verdictStyle: Record<AssessmentVerdict, string> = {
  identified: "border-foreground/25",
  not_detected: "border-dashed border-[hsl(28_85%_52%/0.6)] text-[hsl(28_85%_36%)]",
  resolved: "border-[hsl(150_35%_35%/0.4)] text-[hsl(150_40%_26%)] bg-[hsl(150_35%_35%/0.08)]",
  partially_resolved: "border-[hsl(48_85%_50%/0.4)] text-[hsl(42_80%_30%)] bg-[hsl(48_85%_50%/0.12)]",
  unresolved: "border-destructive/40 text-destructive bg-destructive/5",
  needs_human_review: "border-dashed border-[hsl(28_85%_52%/0.6)] text-[hsl(28_85%_36%)] bg-[hsl(28_85%_52%/0.06)]",
};
export const verdictLabel: Record<AssessmentVerdict, string> = {
  identified: "Identified", not_detected: "Not detected in re-analysis", resolved: "Resolved",
  partially_resolved: "Partially resolved", unresolved: "Unresolved", needs_human_review: "Needs human review",
};
export const evidenceTypeLabel: Record<EvidenceType, { label: string; explain: string }> = {
  operating_evidence: { label: "Operating evidence", explain: "Shows the control actually operating (logs, records, signed artifacts). This is the only kind of evidence that can prove a risk is resolved." },
  policy_or_design: { label: "Policy or design", explain: "Describes how things should work. A policy or design cannot prove that the risk is resolved in practice." },
  plan_or_promise: { label: "Plan or promise", explain: "States an intention or future commitment. A plan cannot prove resolution until it is carried out and evidenced." },
  unrelated: { label: "Unrelated", explain: "The document does not address this risk, so it cannot support resolution." },
  mixed: { label: "Mixed", explain: "Contains some operating evidence alongside policies or plans. Only the operating-evidence parts can support resolution." },
};

export const inputCls = "h-8 w-full rounded-sm border border-input bg-background px-2.5 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";
export const labelCls = "font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground";

export function AiRecommendation({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div data-testid={testId} className={cn("rounded-sm border border-dashed border-foreground/35 bg-background/60 px-3 py-2.5", className)}>
      <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">AI recommendation — not a decision</div>
      {children}
    </div>
  );
}

export function HumanDecisionBox({ children, by, at, className, testId }: { children: ReactNode; by: string; at: string | null; className?: string; testId?: string }) {
  return (
    <div data-testid={testId} className={cn("rounded-sm border border-primary bg-primary/[0.04] px-3 py-2.5 shadow-[inset_3px_0_0_hsl(var(--primary))]", className)}>
      <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-foreground">Human decision · {by}{at && ` · ${stamp(at)}`}</div>
      {children}
    </div>
  );
}

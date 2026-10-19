import type { ComplianceBreakdown } from "@workspace/api-client-react";
import { severityLabel } from "@/components/kit";
import { cn } from "@/lib/utils";

/** Colour band for a 0–100 score. */
export function scoreTone(score: number) {
  if (score >= 80) return { text: "text-[hsl(150_40%_28%)]", ring: "hsl(150 40% 34%)", chip: "border-[hsl(150_35%_35%/0.4)] bg-[hsl(150_35%_35%/0.07)] text-[hsl(150_40%_26%)]", label: "Few open issues" };
  if (score >= 50) return { text: "text-[hsl(32_85%_32%)]", ring: "hsl(32 85% 44%)", chip: "border-[hsl(32_85%_44%/0.45)] bg-[hsl(32_85%_44%/0.08)] text-[hsl(32_85%_30%)]", label: "Several issues to fix" };
  return { text: "text-destructive", ring: "hsl(var(--destructive))", chip: "border-destructive/45 bg-destructive/5 text-destructive", label: "Serious issues to fix" };
}

export function ScoreBadge({ score, testId }: { score: number | null; testId?: string }) {
  if (score == null) return <span className="text-[12.5px] text-muted-foreground" data-testid={testId}>—</span>;
  return (
    <span data-testid={testId} title="Compliance score out of 100"
      className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-semibold tabular", scoreTone(score).chip)}>
      {score}
    </span>
  );
}

export function ComplianceScoreCard({ c }: { c: ComplianceBreakdown }) {
  const tone = scoreTone(c.score);
  const deducted = c.deductions.filter((d) => d.count > 0);
  const R = 26; const L = 2 * Math.PI * R;
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="card-compliance-score">
      <div className="flex items-center gap-3.5">
        <svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90" aria-hidden>
          <circle cx="32" cy="32" r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
          <circle cx="32" cy="32" r={R} fill="none" stroke={tone.ring} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${(L * c.score) / 100} ${L}`} className="transition-[stroke-dasharray] duration-700" />
        </svg>
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium text-muted-foreground">Compliance score</div>
          <div className={cn("text-[26px] font-semibold leading-none tabular", tone.text)} data-testid="text-compliance-score">{c.score}<span className="text-[14px] font-medium text-muted-foreground"> / 100</span></div>
          <div className="mt-1 text-[12.5px]">{tone.label}</div>
        </div>
      </div>
      <div className="mt-3 space-y-0.5 border-t border-border pt-2.5 text-[12.5px]" data-testid="text-compliance-breakdown">
        {deducted.length === 0
          ? <div className="text-muted-foreground">No open risks lower the score.</div>
          : deducted.map((d) => (
            <div key={d.severity} className="flex justify-between tabular">
              <span>{d.count} {severityLabel[d.severity]} × {d.pointsEach}</span><span className="font-medium">−{d.points}</span>
            </div>
          ))}
        {c.excludedUnverified > 0 && <div className="text-[hsl(28_85%_32%)]">{c.excludedUnverified} not counted: quote not found, needs your review</div>}
        {c.excludedClosed > 0 && <div className="text-muted-foreground">{c.excludedClosed} closed, not counted</div>}
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">Starts at 100. Each open risk lowers it: Critical 18, High 12, Medium 7, Low 2. Calculated from the risks below, not by the AI.</p>
    </div>
  );
}

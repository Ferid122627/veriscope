import { useState } from "react";
import { ChevronDown, Quote, CheckCircle2, Loader2 } from "lucide-react";
import { useGetRisk, getGetRiskQueryKey } from "@workspace/api-client-react";
import type { Risk } from "@workspace/api-client-react";
import { sevStyle } from "@/components/kit";
import { cn } from "@/lib/utils";

/** Plain-language priority for each severity, in the order a reader should act. */
export const LEVELS: Record<string, { label: string; hint: string; rank: number }> = {
  critical: { label: "Fix now", hint: "This could cause serious harm", rank: 0 },
  high: { label: "Important", hint: "Fix this soon", rank: 1 },
  medium: { label: "Worth fixing", hint: "Not urgent, but should be improved", rank: 2 },
  low: { label: "Minor", hint: "Small improvement", rank: 3 },
};

export function sortProblems<T extends Pick<Risk, "severity" | "status">>(list: T[]): T[] {
  return [...list].sort(
    (a, b) => Number(a.status === "closed") - Number(b.status === "closed") || (LEVELS[a.severity]?.rank ?? 9) - (LEVELS[b.severity]?.rank ?? 9),
  );
}

export function LevelTag({ severity }: { severity: string }) {
  const l = LEVELS[severity] ?? LEVELS.low!;
  const s = sevStyle[severity] ?? sevStyle.low!;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12.5px] font-semibold", s.chip)} title={l.hint}>
      <span className={cn("size-2 rounded-full", s.dot)} aria-hidden />{l.label}
    </span>
  );
}

function Quotes({ riskId }: { riskId: number }) {
  const q = useGetRisk(riskId, { query: { queryKey: getGetRiskQueryKey(riskId) } });
  if (q.isLoading) return <div className="flex items-center gap-2 text-[13.5px] text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Loading…</div>;
  if (q.isError) return <p className="text-[13.5px] text-destructive">Could not load the text. Please try again.</p>;
  const quotes = (q.data?.evidence ?? []).filter((e) => e.verified);
  if (!quotes.length) return <p className="text-[13.5px] text-muted-foreground">This is about something the document does not say. There is no exact sentence to show.</p>;
  return (
    <ul className="space-y-2">
      {quotes.slice(0, 3).map((e) => (
        <li key={e.id} className="border-l-[3px] border-accent/60 bg-muted/40 py-2 pl-3 pr-2 font-quote text-[15px] leading-relaxed text-foreground/90">
          “{e.quote}”{e.pageNumber != null && <span className="ml-1.5 font-sans text-[12px] text-muted-foreground">(page {e.pageNumber})</span>}
        </li>
      ))}
    </ul>
  );
}

/** One problem, written for someone who has never used a risk tool. */
export function ProblemCard({ risk, defaultOpenQuotes = false }: { risk: Risk; defaultOpenQuotes?: boolean }) {
  const [showQuotes, setShowQuotes] = useState(defaultOpenQuotes);
  const fixed = risk.status === "closed";
  return (
    <article className={cn("rounded-xl border bg-card p-5 shadow-sm", fixed ? "border-border opacity-75" : "border-card-border")} data-testid={`card-problem-${risk.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        {fixed
          ? <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(150_35%_35%/0.4)] bg-[hsl(150_35%_35%/0.08)] px-2.5 py-0.5 text-[12.5px] font-semibold text-[hsl(150_40%_26%)]"><CheckCircle2 className="size-3.5" aria-hidden />Already fixed</span>
          : <LevelTag severity={risk.severity} />}
      </div>
      <h3 className="mt-2.5 text-[17px] font-semibold leading-snug text-foreground">{risk.title}</h3>

      <dl className="mt-3 space-y-3 text-[14.5px] leading-relaxed">
        <div>
          <dt className="text-[12.5px] font-semibold uppercase tracking-wide text-muted-foreground">What is the problem</dt>
          <dd className="mt-0.5 text-foreground/90">{risk.description}</dd>
        </div>
        {risk.businessImpact && (
          <div>
            <dt className="text-[12.5px] font-semibold uppercase tracking-wide text-muted-foreground">Why it matters</dt>
            <dd className="mt-0.5 text-foreground/90">{risk.businessImpact}</dd>
          </div>
        )}
        {risk.recommendedMitigation && !fixed && (
          <div className="rounded-lg bg-primary/[0.06] px-3.5 py-2.5">
            <dt className="text-[12.5px] font-semibold uppercase tracking-wide text-primary">What to do</dt>
            <dd className="mt-0.5 text-foreground">{risk.recommendedMitigation}</dd>
          </div>
        )}
      </dl>

      <button type="button" onClick={() => setShowQuotes((v) => !v)} aria-expanded={showQuotes} data-testid={`button-show-quote-${risk.id}`}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md text-[13.5px] font-medium text-primary hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
        <Quote className="size-3.5" aria-hidden />{showQuotes ? "Hide the text from the document" : "Show where the document says this"}
        <ChevronDown className={cn("size-3.5 transition-transform", showQuotes && "rotate-180")} aria-hidden />
      </button>
      {showQuotes && <div className="mt-2.5"><Quotes riskId={risk.id} /></div>}
    </article>
  );
}

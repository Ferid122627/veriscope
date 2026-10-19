import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Loader2, AlertTriangle, CheckCircle2, RotateCw, ScanSearch, MessagesSquare } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetDocument, useListRisks, useAnalyzeDocument, getGetDocumentQueryKey, getListRisksQueryKey } from "@workspace/api-client-react";
import { Skel, ErrorState, Disclosure, btnPrimary, btnGhost, apiErrorMessage } from "@/components/kit";
import { ReportDownloadButton } from "@/components/report-download-button";
import { useInvalidateAll } from "@/hooks/use-invalidate";
import { ProblemCard, sortProblems, LEVELS } from "./problem-card";
import { cn } from "@/lib/utils";

export function BackHome() {
  return (
    <div><Link href="/" data-testid="link-back-home" className="inline-flex items-center gap-1.5 rounded-sm text-[14px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
      <ArrowLeft className="size-4" aria-hidden />My documents
    </Link></div>
  );
}

export default function SimpleDocument() {
  const { id: raw } = useParams<{ id: string }>();
  const id = Number(raw);
  const valid = Number.isInteger(id) && id > 0;
  const doc = useGetDocument(id, { query: { enabled: valid, queryKey: getGetDocumentQueryKey(id), refetchInterval: (q) => (q.state.data?.status === "analyzing" ? 2000 : false) } });
  const rp = { documentId: id };
  const risks = useListRisks(rp, { query: { enabled: valid, queryKey: getListRisksQueryKey(rp) } });
  const analyze = useAnalyzeDocument();
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  const [err, setErr] = useState<string | null>(null);

  // When a running check finishes, reload the problems and the document list.
  const status = doc.data?.status;
  const prev = useRef<string | undefined>(undefined);
  const invRef = useRef(invalidate); invRef.current = invalidate;
  useEffect(() => {
    if (prev.current === "analyzing" && status && status !== "analyzing") invRef.current();
    prev.current = status;
  }, [status]);

  const run = (rerun: boolean) => {
    setErr(null);
    analyze.mutate({ id, data: rerun ? { rerun: true } : {} }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetDocumentQueryKey(id) }),
      onError: (e) => setErr(apiErrorMessage(e)),
    });
  };

  if (!valid || (doc.isError && (doc.error as { status?: number })?.status === 404)) {
    return (
      <div className="space-y-4">
        <BackHome />
        <p className="text-[15px]" data-testid="text-simple-missing">This document no longer exists. It may have been deleted.</p>
      </div>
    );
  }
  if (doc.isError) return <div className="space-y-4"><BackHome /><ErrorState error={doc.error} onRetry={() => doc.refetch()} /></div>;
  const d = doc.data;
  if (!d) return <div className="space-y-4"><BackHome /><Skel className="h-9 w-2/3" /><Skel className="h-40 rounded-xl" /></div>;

  const list = sortProblems(risks.data ?? []);
  const open = list.filter((r) => r.status !== "closed");
  const urgent = open.filter((r) => r.severity === "critical" || r.severity === "high").length;
  const total = d.chunksTotal ?? 0; const done = d.chunksDone ?? 0;

  return (
    <div className="space-y-6">
      <BackHome />
      <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight md:text-[1.85rem]" data-testid="text-document-title">{d.title}</h1>

      {d.status === "analyzing" && (
        <section className="rounded-xl border border-card-border bg-card p-6 shadow-sm" data-testid="status-simple-checking" aria-live="polite">
          <div className="flex items-center gap-3"><Loader2 className="size-6 animate-spin text-primary" aria-hidden /><span className="text-[17px] font-semibold">We are reading your document…</span></div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total || undefined} aria-valuenow={total ? done : undefined}>
            {total > 0 ? <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(8, (done / total) * 100)}%` }} /> : <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/40" />}
          </div>
          <p className="mt-3 text-[14px] text-muted-foreground">This usually takes about a minute. You can leave this page and come back later.</p>
        </section>
      )}

      {(d.status === "uploaded" || d.status === "failed") && (
        <section className="rounded-xl border border-card-border bg-card p-6 shadow-sm">
          {d.status === "failed"
            ? <p className="flex gap-2 text-[15px]" role="alert" data-testid="text-simple-failed"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />The check did not finish. Please try again.</p>
            : <p className="text-[15px]">This document has not been checked yet.</p>}
          <button className={cn(btnPrimary, "mt-4 h-11 px-6 text-[15px]")} disabled={analyze.isPending} onClick={() => run(false)} data-testid="button-simple-check">
            {analyze.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ScanSearch className="size-4" aria-hidden />}{d.status === "failed" ? "Try again" : "Check this document"}
          </button>
        </section>
      )}

      {d.status === "analyzed" && (
        <section className={cn("rounded-xl border p-6 shadow-sm", open.length ? "border-[hsl(28_85%_52%/0.35)] bg-[hsl(32_100%_97%)]" : "border-[hsl(150_35%_35%/0.35)] bg-[hsl(150_35%_35%/0.06)]")} data-testid="summary-simple">
          {open.length === 0 ? (
            <div className="flex gap-3"><CheckCircle2 className="mt-0.5 size-6 shrink-0 text-[hsl(150_40%_30%)]" aria-hidden />
              <div><div className="text-[18px] font-semibold">No open problems found</div><p className="mt-1 text-[14.5px] text-muted-foreground">We did not find anything that needs fixing in this document. For important decisions, still ask a lawyer to review it.</p></div>
            </div>
          ) : (
            <div className="flex gap-3"><AlertTriangle className="mt-0.5 size-6 shrink-0 text-[hsl(28_85%_45%)]" aria-hidden />
              <div>
                <div className="text-[18px] font-semibold">We found {open.length} {open.length === 1 ? "thing" : "things"} to look at</div>
                <p className="mt-1 text-[14.5px] text-muted-foreground">
                  {urgent > 0 ? `${urgent} ${urgent === 1 ? "is" : "are"} important. Start with the ones marked "${LEVELS.critical!.label}" or "${LEVELS.high!.label}".` : "None of them are urgent."} Each one says what to do.
                </p>
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <ReportDownloadButton documentId={d.id} title={d.title} />
            <Link href="/assistant" className={btnGhost} data-testid="link-simple-ask"><MessagesSquare className="size-4" aria-hidden />Ask a question about it</Link>
          </div>
        </section>
      )}

      {err && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[14px] text-destructive">{err}</div>}

      {risks.isError ? <ErrorState error={risks.error} onRetry={() => risks.refetch()} />
        : list.length > 0 && (
          <section className="space-y-3" aria-label="Problems found">
            {list.map((r) => <ProblemCard key={r.id} risk={r} />)}
          </section>
        )}

      <Disclosure summary="Read the document" hint="The full text, exactly as added" testId="disclosure-simple-text">
        <div className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words px-5 py-5 font-quote text-[15.5px] leading-[1.75] text-foreground/90" data-testid="text-document-content">{d.content}</div>
      </Disclosure>

      {d.status === "analyzed" && (
        <button className={cn(btnGhost)} disabled={analyze.isPending} onClick={() => run(true)} data-testid="button-simple-recheck">
          {analyze.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCw className="size-4" aria-hidden />}Check again
        </button>
      )}
    </div>
  );
}

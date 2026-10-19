import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams, useSearch } from "wouter";
import { ArrowLeft, ShieldAlert, Crosshair, Sparkles, RotateCw, Loader2, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDocument, useListRisks, useAnalyzeDocument, getGetDocumentQueryKey, getListRisksQueryKey,
} from "@workspace/api-client-react";
import type { DocumentDetail as Doc } from "@workspace/api-client-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader, Panel, Skel, EmptyState, ErrorState, StatusChip, SeverityChip, DocStatus, Chip, num, stamp, ago, fmtBytes, btnGhost, btnPrimary, apiErrorMessage } from "@/components/kit";
import { useInvalidateAll } from "@/hooks/use-invalidate";

function elapsed(from: string | null, now: number) {
  if (!from) return "";
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function AnalysisPanel({ doc, riskCount }: { doc: Doc; riskCount: number }) {
  const analyze = useAnalyzeDocument();
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (doc.status !== "analyzing") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [doc.status]);

  const run = (rerun: boolean) => {
    if (analyze.isPending) return;
    setErr(null);
    analyze.mutate({ id: doc.id, data: rerun ? { rerun: true } : {} }, {
      onSuccess: (d) => { qc.setQueryData(getGetDocumentQueryKey(doc.id), (old: Doc | undefined) => (old ? { ...old, ...d } : old)); qc.invalidateQueries({ queryKey: getGetDocumentQueryKey(doc.id) }); setConfirm(false); },
      onError: (e) => { setErr(apiErrorMessage(e)); setConfirm(false); },
    });
  };
  const busy = analyze.isPending;
  const total = doc.chunksTotal ?? 0; const doneN = doc.chunksDone ?? 0;

  let body: ReactNode;
  if (doc.status === "analyzing") {
    body = (
      <div data-testid="status-analysis-running">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" />{total > 0 ? <>Analyzing section <span className="font-mono tabular">{Math.min(doneN + 1, total)}</span> of <span className="font-mono tabular">{total}</span></> : "Preparing analysis"}</span>
          <span className="font-mono text-[11px] tabular text-muted-foreground">{elapsed(doc.analysisStartedAt, now)}</span>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-[1px] bg-muted">
          {total > 0
            ? <div className="h-full origin-left bg-foreground transition-transform duration-500" style={{ transform: `scaleX(${doneN / total})` }} />
            : <div className="h-full w-1/3 animate-pulse bg-foreground/40" />}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">You can leave this page; analysis continues in the background.</p>
      </div>
    );
  } else if (doc.status === "analyzed") {
    body = (
      <div>
        <div className="text-sm" data-testid="text-analysis-summary">Analyzed {doc.analyzedAt ? ago(doc.analyzedAt) : ""}{doc.analysisModel && <> · model <span className="font-mono text-xs">{doc.analysisModel}</span></>} · {riskCount} risks</div>
        {riskCount === 0 && <p className="mt-2 rounded-sm border border-border bg-muted/50 px-3 py-2 text-[13px]" data-testid="text-no-risks-found">Analysis complete — no clear risks were identified in this document.</p>}
        <button className={`${btnGhost} mt-3 w-full`} disabled={busy} onClick={() => setConfirm(true)} data-testid="button-rerun-analysis"><RotateCw className="size-3.5" /> Re-run analysis</button>
      </div>
    );
  } else if (doc.status === "failed") {
    body = (
      <div>
        <div className="flex gap-2 rounded-sm border border-destructive/30 bg-destructive/5 p-3 text-sm" data-testid="text-analysis-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" /><span className="break-words">{doc.analysisError ?? "Analysis failed without a reported reason."}</span>
        </div>
        <button className={`${btnPrimary} mt-3 w-full`} disabled={busy} onClick={() => run(false)} data-testid="button-retry-analysis">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />} Retry analysis</button>
      </div>
    );
  } else {
    body = (
      <div>
        <button className={`${btnPrimary} w-full`} disabled={busy} onClick={() => run(false)} data-testid="button-analyze">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Analyze with AI</button>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">The document text is sent to the configured AI provider to identify risks, each backed by quotes checked against this text.</p>
      </div>
    );
  }

  return (
    <Panel title="Analysis" aside={<DocStatus status={doc.status} />}>
      {body}
      {doc.analysisRuns.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Analysis history</div>
          <ol className="space-y-2.5">
            {doc.analysisRuns.map((r) => (
              <li key={r.id} className="text-[12px]" data-testid={`item-run-${r.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono">Run #{r.id}</span>
                  <Chip className={r.status === "failed" ? "border-destructive/50 text-destructive" : r.status === "running" ? "border-[hsl(230_38%_40%/0.4)] text-[hsl(230_38%_35%)]" : "border-[hsl(150_35%_35%/0.4)] text-[hsl(150_40%_26%)]"}>{r.status}</Chip>
                </div>
                <div className="font-mono text-[10.5px] text-muted-foreground">{stamp(r.startedAt)}{r.finishedAt && ` → ${stamp(r.finishedAt)}`} · {r.model}</div>
                {r.status === "failed" ? <div className="mt-0.5 break-words text-destructive">{r.error ?? "Failed without a reported reason."}</div>
                  : r.status === "completed" && <div className="mt-0.5 tabular">{r.risksIdentified ?? 0} identified · {r.risksNew ?? 0} new · {r.risksMatched ?? 0} matched · {r.risksNotDetected ?? 0} not detected</div>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {err && <div data-testid="text-analyze-error" className="mt-3 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{err}</div>}
      <AlertDialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-normal">Re-run analysis?</AlertDialogTitle>
            <AlertDialogDescription>Nothing is deleted. Findings that match existing risks keep their IDs and get a new re-analysis assessment appended to their history. New issues become new risks. Existing risks not found again are kept, marked "not detected", and flagged for human review.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-rerun">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-rerun" disabled={busy} onClick={(e) => { e.preventDefault(); run(true); }}>
              {busy && <Loader2 className="size-3.5 animate-spin" />} Re-run analysis
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

function PageRule({ n }: { n: number }) {
  return (
    <span className="my-4 flex select-none items-center gap-3 font-mono text-[10px] uppercase not-italic tracking-[0.18em] text-muted-foreground/70" aria-label={`Page ${n}`}>
      <span className="h-px flex-1 bg-border" />Page {n}<span className="h-px flex-1 bg-border" />
    </span>
  );
}

function renderText(content: string, pageOffsets: number[] | null, range: { s: number; e: number } | null, markRef: React.Ref<HTMLElement>) {
  const cuts = new Set<number>([0, content.length]);
  const pages = (pageOffsets ?? []).map((o, i) => ({ o, n: i + 1 })).filter((p) => p.o >= 0 && p.o <= content.length);
  pages.forEach((p) => cuts.add(p.o));
  if (range) { cuts.add(range.s); cuts.add(range.e); }
  const pts = [...cuts].sort((a, b) => a - b);
  const pageAt = new Map(pages.map((p) => [p.o, p.n]));
  const out: ReactNode[] = [];
  let markPlaced = false;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (pageAt.has(p) && pages.length > 1) out.push(<PageRule key={`p${p}`} n={pageAt.get(p)!} />);
    if (i === pts.length - 1) break;
    const seg = content.slice(p, pts[i + 1]);
    if (!seg) continue;
    if (range && p >= range.s && p < range.e) {
      out.push(<mark key={`s${p}`} ref={markPlaced ? undefined : markRef} className="mark-hl text-foreground">{seg}</mark>);
      markPlaced = true;
    } else out.push(<span key={`s${p}`}>{seg}</span>);
  }
  return out;
}

export default function DocumentDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const search = new URLSearchParams(useSearch());
  const start = search.get("start") != null ? Number(search.get("start")) : null;
  const end = search.get("end") != null ? Number(search.get("end")) : null;

  const doc = useGetDocument(id, { query: { enabled: valid, queryKey: getGetDocumentQueryKey(id), refetchInterval: (q) => (q.state.data?.status === "analyzing" ? 2000 : false) } });
  const rp = { documentId: id };
  const risks = useListRisks(rp, { query: { enabled: valid, queryKey: getListRisksQueryKey(rp) } });
  const markRef = useRef<HTMLElement>(null);
  const invalidateAll = useInvalidateAll();
  const invRef = useRef(invalidateAll); invRef.current = invalidateAll;

  const status = doc.data?.status;
  const prevStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevStatus.current === "analyzing" && status && status !== "analyzing") invRef.current();
    prevStatus.current = status;
  }, [status]);

  const content = doc.data?.content ?? "";
  const range = useMemo(() => {
    if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end)) return null;
    const s = Math.max(0, Math.min(start, content.length)); const e = Math.max(s, Math.min(end, content.length));
    return e > s ? { s, e } : null;
  }, [start, end, content.length]);

  useEffect(() => {
    if (range && markRef.current) markRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [range, content]);

  const rendered = useMemo(() => renderText(content, doc.data?.pageOffsets ?? null, range, markRef), [content, doc.data?.pageOffsets, range]);

  if (!valid || (doc.isError && (doc.error as { status?: number })?.status === 404)) {
    return <EmptyState testId="empty-document-missing" icon={<ShieldAlert className="size-5" />} title="Document not found" body="It may have been deleted, along with everything derived from it." action={<Link href="/documents" className={btnGhost}>Back to documents</Link>} />;
  }
  const d = doc.data;

  return (
    <div className="space-y-6">
      <Link href="/documents" data-testid="link-back-documents" className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Documents</Link>
      {doc.isError ? <ErrorState error={doc.error} onRetry={() => doc.refetch()} /> : !d ? <div className="space-y-3"><Skel className="h-3 w-24" /><Skel className="h-10 w-2/3" /></div> : (
        <PageHeader eyebrow={`Document · DOC-${String(d.id).padStart(4, "0")}`} title={<span data-testid="text-document-title">{d.title}</span>}
          meta={<span className="flex flex-wrap items-center gap-3">
            <DocStatus status={d.status} />
            <Chip className="border-border text-muted-foreground" testId="text-source-type">{d.sourceType}</Chip>
            {d.pageCount != null && <span className="font-mono text-xs">{d.pageCount} pages</span>}
            {d.fileSize != null && <span className="font-mono text-xs">{fmtBytes(d.fileSize)}</span>}
            <span className="font-mono text-xs">{num(d.charCount)} chars</span>
            <span className="font-mono text-xs">added {stamp(d.createdAt)}</span>
            {d.filename && <span className="font-mono text-xs">{d.filename}</span>}
          </span>} />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {range && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-sm border border-foreground/15 bg-accent/30 px-3 py-2 text-xs" data-testid="banner-highlight">
              <span className="flex items-center gap-2"><Crosshair className="size-3.5" /> Highlighting characters <span className="font-mono">{range.s}–{range.e}</span></span>
              <Link href={`/documents/${id}`} className="font-mono uppercase tracking-wider underline-offset-4 hover:underline" data-testid="link-clear-highlight">Clear</Link>
            </div>
          )}
          <article className="rounded-md border border-card-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground"><span>Source text</span><span>verbatim</span></div>
            {doc.isLoading ? <div className="space-y-2.5 p-6">{Array.from({ length: 12 }).map((_, i) => <Skel key={i} className="h-3.5" />)}</div> : (
              <div data-testid="text-document-content" className="max-h-[75vh] overflow-auto px-5 py-6 md:px-8 whitespace-pre-wrap break-words font-serif text-[16px] leading-[1.75] text-foreground/90">
                {rendered}
              </div>
            )}
          </article>
        </div>

        <div className="space-y-6 self-start lg:sticky lg:top-6">
          {d && <AnalysisPanel doc={d} riskCount={risks.data?.length ?? d.riskCount} />}
          <Panel title="Risks from this document" aside={risks.data && <span className="font-mono text-[11px]">{risks.data.length}</span>} bodyClass="p-0 max-h-[55vh] overflow-auto">
            {risks.isError ? <div className="p-4"><ErrorState error={risks.error} onRetry={() => risks.refetch()} /></div>
              : risks.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skel key={i} className="h-10" />)}</div>
              : !risks.data?.length ? <EmptyState testId="empty-document-risks" icon={<ShieldAlert className="size-5" />} title="No risks identified" body={d?.status === "analyzed" ? "Analysis complete — no clear risks were identified in this document." : d?.status === "analyzing" ? "Analysis is in progress. Risks will appear here when it completes." : "This document has not produced any risks yet. Risks appear here once analysis has run."} />
              : risks.data.map((r) => (
                <Link key={r.id} href={`/risks/${r.id}`} data-testid={`link-risk-${r.id}`} className="block border-b border-border px-4 py-3 last:border-0 hover:bg-muted/50">
                  <div className="flex items-center gap-2"><SeverityChip severity={r.severity} /><StatusChip status={r.status} /></div>
                  <div className="mt-1.5 text-[13.5px] font-medium leading-snug">{r.title}</div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{r.category} · {r.evidenceCount} {r.evidenceCount === 1 ? "quote" : "quotes"}</div>
                </Link>
              ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}

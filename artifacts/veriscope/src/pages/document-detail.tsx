import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams, useSearch } from "wouter";
import { ShieldAlert, Crosshair, Sparkles, RotateCw, Loader2, AlertTriangle, Maximize2, Minimize2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDocument, useListRisks, useAnalyzeDocument, getGetDocumentQueryKey, getListRisksQueryKey,
} from "@workspace/api-client-react";
import type { DocumentDetail as Doc } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader, Panel, Skel, EmptyState, ErrorState, StatusChip, SeverityChip, DocStatus, Chip, BackLink, num, stamp, ago, fmtBytes, btnGhost, btnPrimary, apiErrorMessage } from "@/components/kit";
import { useInvalidateAll } from "@/hooks/use-invalidate";
import { ReportDownloadButton } from "@/components/report-download-button";
import { ComplianceScoreCard } from "@/components/compliance-score";

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
          <span className="flex items-center gap-2 font-medium" aria-live="polite"><Loader2 className="size-3.5 animate-spin" aria-hidden />{total > 0 ? <>Reading part <span className="tabular">{Math.min(doneN + 1, total)}</span> of <span className="tabular">{total}</span></> : "Getting ready…"}</span>
          <span className="text-[12px] tabular text-muted-foreground">{elapsed(doc.analysisStartedAt, now)}</span>
        </div>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total || undefined} aria-valuenow={total ? doneN : undefined}>
          {total > 0
            ? <div className="h-full origin-left rounded-full bg-primary transition-transform duration-500" style={{ transform: `scaleX(${doneN / total})` }} />
            : <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/40" />}
        </div>
        <p className="mt-2 text-[12.5px] text-muted-foreground">You can leave this page. The check keeps running in the background.</p>
      </div>
    );
  } else if (doc.status === "analyzed") {
    body = (
      <div>
        <div className="text-[14px]" data-testid="text-analysis-summary"><b>{riskCount} {riskCount === 1 ? "risk" : "risks"} found</b> <span className="text-muted-foreground">· checked {doc.analyzedAt ? ago(doc.analyzedAt) : ""}</span></div>
        {doc.analysisModel && <div className="mt-0.5 text-[12px] text-muted-foreground">AI model: {doc.analysisModel}</div>}
        <div className="mt-0.5 text-[12px] text-muted-foreground" data-testid="text-compared-rules">
          {doc.analysisRuns.find((r) => r.status === "completed")?.playbookTitle
            ? <>Compared with company rules: <Link href="/playbook" className="font-medium text-foreground underline underline-offset-4">{doc.analysisRuns.find((r) => r.status === "completed")!.playbookTitle}</Link></>
            : <>Not compared with company rules. <Link href="/playbook" className="underline underline-offset-4">Add company rules</Link></>}
        </div>
        {doc.compliance && <div className="mt-3"><ComplianceScoreCard c={doc.compliance} /></div>}
        {riskCount === 0 && <p className="mt-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-[13px]" data-testid="text-no-risks-found">Check complete. No clear risks were found in this document.</p>}
        <button className={`${btnGhost} mt-3 w-full`} disabled={busy} onClick={() => setConfirm(true)} data-testid="button-rerun-analysis"><RotateCw className="size-3.5" aria-hidden /> Check this document again</button>
      </div>
    );
  } else if (doc.status === "failed") {
    body = (
      <div>
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm" data-testid="text-analysis-error" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /><span className="break-words"><b>The check did not finish.</b> {doc.analysisError ?? "No reason was reported."}</span>
        </div>
        <button className={`${btnPrimary} mt-3 w-full`} disabled={busy} onClick={() => run(false)} data-testid="button-retry-analysis">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" aria-hidden />} Try again</button>
      </div>
    );
  } else {
    body = (
      <div>
        <button className={`${btnPrimary} w-full`} disabled={busy} onClick={() => run(false)} data-testid="button-analyze">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" aria-hidden />} Find risks with AI</button>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">The AI reads this document and lists possible risks. Each risk quotes the text it is based on, and every quote is checked against this document.</p>
      </div>
    );
  }

  return (
    <Panel title="AI risk check" aside={<DocStatus status={doc.status} />}>
      {body}
      {doc.analysisRuns.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 text-[12.5px] font-medium text-muted-foreground">Previous checks</div>
          <ol className="space-y-2.5">
            {doc.analysisRuns.map((r) => (
              <li key={r.id} className="text-[12px]" data-testid={`item-run-${r.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Check #{r.id}</span>
                  <Chip className={r.status === "failed" ? "border-destructive/50 text-destructive" : r.status === "running" ? "border-[hsl(230_38%_40%/0.4)] text-[hsl(230_38%_35%)]" : "border-[hsl(150_35%_35%/0.4)] text-[hsl(150_40%_26%)]"}>{r.status === "running" ? "Running" : r.status === "failed" ? "Failed" : "Finished"}</Chip>
                </div>
                <div className="text-[12px] text-muted-foreground">{stamp(r.startedAt)}{r.finishedAt && ` → ${stamp(r.finishedAt)}`} · {r.model}</div>
                {r.status === "failed" ? <div className="mt-0.5 break-words text-destructive">{r.error ?? "Failed without a reported reason."}</div>
                  : r.status === "completed" && <div className="mt-0.5 tabular">{r.risksIdentified ?? 0} found · {r.risksNew ?? 0} new · {r.risksMatched ?? 0} already known · {r.risksNotDetected ?? 0} not found again</div>}
                {r.playbookTitle && <div className="mt-0.5 text-muted-foreground">Company rules: {r.playbookTitle}</div>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {err && <div data-testid="text-analyze-error" role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{err}</div>}
      <AlertDialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold tracking-tight">Check this document again?</AlertDialogTitle>
            <AlertDialogDescription>Nothing is deleted. Risks found again keep their history and get a new check added. New issues become new risks. Risks not found again are kept and marked "Needs your review".</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-rerun">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-rerun" disabled={busy} onClick={(e) => { e.preventDefault(); run(true); }}>
              {busy && <Loader2 className="size-3.5 animate-spin" />} Check again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

function PageRule({ n }: { n: number }) {
  return (
    <span className="my-4 flex select-none items-center gap-3 font-sans text-[11.5px] font-medium not-italic text-muted-foreground" aria-label={`Page ${n}`}>
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
  const [enlarged, setEnlarged] = useState(false);
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
  const renderedLarge = useMemo(() => (enlarged ? renderText(content, doc.data?.pageOffsets ?? null, range, null) : null), [enlarged, content, doc.data?.pageOffsets, range]);

  if (!valid || (doc.isError && (doc.error as { status?: number })?.status === 404)) {
    return <EmptyState testId="empty-document-missing" icon={<ShieldAlert className="size-5" />} title="Document not found" body="It may have been deleted, along with everything derived from it." action={<Link href="/documents" className={btnGhost}>Back to documents</Link>} />;
  }
  const d = doc.data;

  return (
    <div className="space-y-6">
      <BackLink href="/documents" testId="link-back-documents">Documents</BackLink>
      {doc.isError ? <ErrorState error={doc.error} onRetry={() => doc.refetch()} /> : !d ? <div className="space-y-3"><Skel className="h-3 w-24" /><Skel className="h-10 w-2/3" /></div> : (
        <PageHeader eyebrow="Document" title={<span data-testid="text-document-title">{d.title}</span>}
          meta={<span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]">
            <DocStatus status={d.status} />
            <Chip className="border-border text-muted-foreground" testId="text-source-type">{d.sourceType.toUpperCase()}</Chip>
            {d.pageCount != null && <span>{d.pageCount} pages</span>}
            {d.fileSize != null && <span>{fmtBytes(d.fileSize)}</span>}
            <span>{num(d.charCount)} characters</span>
            <span>Added {stamp(d.createdAt)}</span>
            {d.filename && <span className="break-all">{d.filename}</span>}
          </span>} />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {range && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-accent/25 bg-accent/10 px-3 py-2 text-[13px]" data-testid="banner-highlight">
              <span className="flex items-center gap-2" title={`Characters ${range.s}–${range.e}`}><Crosshair className="size-3.5" aria-hidden /> The quoted text is highlighted below.</span>
              <Link href={`/documents/${id}`} className="font-medium text-primary underline-offset-4 hover:underline" data-testid="link-clear-highlight">Remove highlight</Link>
            </div>
          )}
          <article className="rounded-lg border border-card-border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h2 className="text-[15px] font-semibold">Document text</h2>
              <div className="flex items-center gap-3">
                <span className="hidden text-[12.5px] text-muted-foreground sm:inline">Exactly as added</span>
                <button type="button" onClick={() => setEnlarged(true)} data-testid="button-toggle-text-size"
                  className="group inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12.5px] font-medium text-foreground transition-all duration-300 hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-95">
                  <Maximize2 className="size-3.5 transition-transform duration-300 group-hover:scale-110" aria-hidden />
                  Enlarge
                </button>
              </div>
            </div>
            {doc.isLoading ? <div className="space-y-2.5 p-6">{Array.from({ length: 12 }).map((_, i) => <Skel key={i} className="h-3.5" />)}</div> : (
              <div data-testid="text-document-content"
                className="max-h-[75vh] overflow-auto px-5 py-6 md:px-8 whitespace-pre-wrap break-words font-quote text-[16px] leading-[1.75] text-foreground/90">
                {rendered}
              </div>
            )}
          </article>
          <Dialog open={enlarged} onOpenChange={setEnlarged}>
            <DialogContent className="flex h-[92vh] w-[94vw] max-w-[94vw] max-h-[92vh] flex-col gap-0 overflow-hidden p-0 duration-300" data-testid="dialog-document-text">
              <div className="flex items-center gap-3 border-b border-border px-6 py-3.5 pr-14">
                <Minimize2 className="size-4 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <DialogTitle className="truncate text-[15px] font-semibold">Document text{d ? ` · ${d.title}` : ""}</DialogTitle>
                  <DialogDescription className="text-[12.5px] text-muted-foreground">Exactly as added. Press Esc or the × to close.</DialogDescription>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-6 py-8 md:px-16">
                <div className="mx-auto max-w-[960px] whitespace-pre-wrap break-words font-quote text-[18px] leading-[1.85] text-foreground/90" data-testid="text-document-content-large">
                  {renderedLarge}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {d && <div className="min-w-0 lg:col-start-1 lg:row-start-2"><AnalysisPanel doc={d} riskCount={risks.data?.length ?? d.riskCount} /></div>}
        <div className="relative min-h-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Panel className="flex flex-col lg:absolute lg:inset-0" title="Risks found in this document" aside={<span className="flex items-center gap-2.5">{risks.data && <span className="text-[12.5px] font-medium text-muted-foreground">{risks.data.length}</span>}{d && <ReportDownloadButton documentId={d.id} title={d.title} />}</span>} bodyClass="p-0 max-h-[55vh] min-h-0 flex-1 overflow-auto lg:max-h-none">
            {risks.isError ? <div className="p-4"><ErrorState error={risks.error} onRetry={() => risks.refetch()} /></div>
              : risks.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skel key={i} className="h-10" />)}</div>
              : !risks.data?.length ? <EmptyState testId="empty-document-risks" icon={<ShieldAlert className="size-5" />} title="No risks yet" body={d?.status === "analyzed" ? "Check complete. No clear risks were found in this document." : d?.status === "analyzing" ? "The AI is reading this document. Risks will appear here when it finishes." : "Select \"Find risks with AI\" to check this document."} />
              : risks.data.map((r) => (
                <Link key={r.id} href={`/risks/${r.id}`} data-testid={`link-risk-${r.id}`} className="block border-b border-border px-4 py-3 last:border-0 hover:bg-muted/50">
                  <div className="flex items-center gap-2"><SeverityChip severity={r.severity} /><StatusChip status={r.status} /></div>
                  <div className="mt-1.5 text-[13.5px] font-semibold leading-snug">{r.title}</div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">{r.category} · {r.evidenceCount} {r.evidenceCount === 1 ? "quote" : "quotes"}</div>
                </Link>
              ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef } from "react";
import { Link, useParams, useSearch } from "wouter";
import { ArrowLeft, ShieldAlert, Crosshair } from "lucide-react";
import { useGetDocument, useListRisks, getGetDocumentQueryKey, getListRisksQueryKey } from "@workspace/api-client-react";
import { PageHeader, Panel, Skel, EmptyState, ErrorState, StatusChip, SeverityChip, num, stamp, btnGhost } from "@/components/kit";

export default function DocumentDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const search = new URLSearchParams(useSearch());
  const start = search.get("start") != null ? Number(search.get("start")) : null;
  const end = search.get("end") != null ? Number(search.get("end")) : null;

  const doc = useGetDocument(id, { query: { enabled: valid, queryKey: getGetDocumentQueryKey(id) } });
  const rp = { documentId: id };
  const risks = useListRisks(rp, { query: { enabled: valid, queryKey: getListRisksQueryKey(rp) } });
  const markRef = useRef<HTMLElement>(null);

  const content = doc.data?.content ?? "";
  const range = useMemo(() => {
    if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end)) return null;
    const s = Math.max(0, Math.min(start, content.length)); const e = Math.max(s, Math.min(end, content.length));
    return e > s ? { s, e } : null;
  }, [start, end, content.length]);

  useEffect(() => {
    if (range && markRef.current) markRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [range, content]);

  if (!valid || (doc.isError && (doc.error as { status?: number })?.status === 404)) {
    return <EmptyState testId="empty-document-missing" icon={<ShieldAlert className="size-5" />} title="Document not found" body="It may have been deleted, along with everything derived from it." action={<Link href="/documents" className={btnGhost}>Back to documents</Link>} />;
  }

  return (
    <div className="space-y-6">
      <Link href="/documents" data-testid="link-back-documents" className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Documents</Link>
      {doc.isError ? <ErrorState error={doc.error} onRetry={() => doc.refetch()} /> : !doc.data ? <div className="space-y-3"><Skel className="h-3 w-24" /><Skel className="h-10 w-2/3" /></div> : (
        <PageHeader eyebrow={`Document · DOC-${String(doc.data.id).padStart(4, "0")}`} title={<span data-testid="text-document-title">{doc.data.title}</span>}
          meta={<span className="flex flex-wrap items-center gap-3"><StatusChip status={doc.data.status} /><span className="font-mono text-xs">{num(doc.data.charCount)} chars</span><span className="font-mono text-xs">added {stamp(doc.data.createdAt)}</span>{doc.data.filename && <span className="font-mono text-xs">{doc.data.filename}</span>}</span>} />
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
                {range ? <>{content.slice(0, range.s)}<mark ref={markRef} className="mark-hl text-foreground">{content.slice(range.s, range.e)}</mark>{content.slice(range.e)}</> : content}
              </div>
            )}
          </article>
        </div>

        <Panel title="Risks from this document" aside={risks.data && <span className="font-mono text-[11px]">{risks.data.length}</span>} bodyClass="p-0" className="self-start lg:sticky lg:top-6">
          {risks.isError ? <div className="p-4"><ErrorState error={risks.error} onRetry={() => risks.refetch()} /></div>
            : risks.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skel key={i} className="h-10" />)}</div>
            : !risks.data?.length ? <EmptyState testId="empty-document-risks" icon={<ShieldAlert className="size-5" />} title="No risks identified" body="This document has not produced any risks yet. Risks appear here once analysis has run." />
            : risks.data.map((r) => (
              <Link key={r.id} href={`/risks/${r.id}`} data-testid={`link-risk-${r.id}`} className="block border-b border-border px-4 py-3 last:border-0 hover:bg-muted/50">
                <div className="flex items-center gap-2"><SeverityChip severity={r.severity} /><StatusChip status={r.status} /></div>
                <div className="mt-1.5 text-[13.5px] font-medium leading-snug">{r.title}</div>
                <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{r.category} · {r.evidenceCount} quotes</div>
              </Link>
            ))}
        </Panel>
      </div>
    </div>
  );
}

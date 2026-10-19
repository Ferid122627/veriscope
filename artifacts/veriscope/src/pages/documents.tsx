import { useState, useEffect } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { useInvalidateAll } from "@/hooks/use-invalidate";
import { Plus, FileText, Trash2, Loader2 } from "lucide-react";
import { AddDocumentDialog } from "@/components/add-document-dialog";
import {
  useListDocuments, useDeleteDocument,
  getListDocumentsQueryKey,
} from "@workspace/api-client-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, Skel, EmptyState, ErrorState, Chip, DocStatus, ago, num, btnPrimary, btnGhost, apiErrorMessage } from "@/components/kit";

export default function Documents() {
  const docs = useListDocuments({ query: { queryKey: getListDocumentsQueryKey(), refetchInterval: (q) => (q.state.data?.some((d) => d.status === "analyzing") ? 3000 : false) } });
  const search = useSearch(); const [, navigate] = useLocation();
  const del = useDeleteDocument();
  const invalidate = useInvalidateAll();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (new URLSearchParams(search).get("add") === "1") { setAdding(true); navigate("/documents", { replace: true }); } }, [search, navigate]);
  const [pending, setPending] = useState<{ id: number; title: string } | null>(null);

  const confirmDelete = () => {
    if (!pending) return;
    const p = pending;
    del.mutate({ id: p.id }, {
      onSuccess: () => { invalidate(); toast({ title: "Document deleted", description: p.title }); setPending(null); },
      onError: (e) => { toast({ title: "Delete failed", description: apiErrorMessage(e), variant: "destructive" }); setPending(null); },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Source library" title="Documents" meta={docs.data ? `${docs.data.length} on file · newest first` : " "}>
        <button className={btnPrimary} onClick={() => setAdding(true)} data-testid="button-add-document"><Plus className="size-4" /> Add document</button>
      </PageHeader>

      {docs.isError ? <ErrorState error={docs.error} onRetry={() => docs.refetch()} /> : (
        <div className="overflow-hidden rounded-md border border-card-border bg-card rise">
          <div className="hidden grid-cols-[1fr_110px_90px_80px_120px_40px] gap-4 border-b border-border px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground md:grid">
            <span>Title</span><span>Status</span><span className="text-right">Chars</span><span className="text-right">Risks</span><span>Added</span><span />
          </div>
          {docs.isLoading ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="border-b border-border px-4 py-3.5 last:border-0"><Skel className="h-4 w-2/3" /></div>)
            : !docs.data?.length ? (
              <EmptyState testId="empty-documents" icon={<FileText className="size-5" />} title="No documents yet"
                body="Veriscope works from source text. Add a contract, policy or audit report and it becomes the ground truth every risk must quote from."
                action={<button className={btnPrimary} onClick={() => setAdding(true)} data-testid="button-add-first-document"><Plus className="size-4" /> Add your first document</button>} />
            ) : docs.data.map((d, i) => (
              <div key={d.id} className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-muted/40 md:grid-cols-[1fr_170px_90px_80px_120px_40px] rise" style={{ animationDelay: `${i * 25}ms` }} data-testid={`row-document-${d.id}`}>
                <Link href={`/documents/${d.id}`} className="min-w-0" data-testid={`link-document-${d.id}`}>
                  <div className="truncate font-medium text-[14px] group-hover:underline underline-offset-4 decoration-accent decoration-2">{d.title}</div>
                  {d.filename && <div className="truncate font-mono text-[11px] text-muted-foreground">{d.filename}</div>}
                </Link>
                <span className="hidden md:flex items-center gap-1.5"><DocStatus status={d.status} /><Chip className="border-border text-muted-foreground">{d.sourceType}</Chip></span>
                <span className="hidden text-right font-mono text-xs tabular text-muted-foreground md:block">{num(d.charCount)}</span>
                <span className="hidden text-right font-mono text-sm tabular md:block">{d.riskCount}</span>
                <span className="hidden font-mono text-[11px] text-muted-foreground md:block">{ago(d.createdAt)}</span>
                <button onClick={() => setPending({ id: d.id, title: d.title })} data-testid={`button-delete-document-${d.id}`} aria-label="Delete document" className="grid size-7 place-items-center justify-self-end rounded-sm text-muted-foreground opacity-60 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100">
                  <Trash2 className="size-3.5" />
                </button>
                <div className="col-span-2 flex items-center gap-3 font-mono text-[11px] text-muted-foreground md:hidden"><DocStatus status={d.status} />{d.riskCount} risks · {ago(d.createdAt)}</div>
              </div>
            ))}
        </div>
      )}

      <AddDocumentDialog open={adding} onOpenChange={setAdding} />
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-normal">Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>"{pending?.title}" will be removed along with every risk, evidence quote, action and assessment derived from it. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Keep it</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-delete" disabled={del.isPending} onClick={(e) => { e.preventDefault(); confirmDelete(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {del.isPending && <Loader2 className="size-3.5 animate-spin" />} Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

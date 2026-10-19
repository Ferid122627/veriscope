import { useState, useEffect } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { useInvalidateAll } from "@/hooks/use-invalidate";
import { Plus, FileText, Trash2, Loader2 } from "lucide-react";
import { AddDocumentDialog } from "@/components/add-document-dialog";
import { ScoreBadge } from "@/components/compliance-score";
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
      <PageHeader title="Documents" description="Contracts, policies and reports you have added. Open a document to read it or to find risks with AI."
        meta={docs.data ? `${docs.data.length} ${docs.data.length === 1 ? "document" : "documents"} · newest first` : " "}>
        <button className={btnPrimary} onClick={() => setAdding(true)} data-testid="button-add-document"><Plus className="size-4" aria-hidden /> Check a document</button>
      </PageHeader>

      {docs.isError ? <ErrorState error={docs.error} onRetry={() => docs.refetch()} /> : (
        <div className="overflow-hidden rounded-lg border border-card-border bg-card shadow-sm">
          <div className="hidden grid-cols-[1fr_220px_90px_70px_120px_40px] gap-x-4 border-b border-border bg-muted/40 px-4 py-2.5 text-[12.5px] font-medium text-muted-foreground md:grid">
            <span>Document</span><span>Status</span><span className="text-right">Risks found</span><span className="text-center" title="Compliance score out of 100">Score</span><span>Added</span><span className="sr-only">Actions</span>
          </div>
          {docs.isLoading ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="border-b border-border px-4 py-3.5 last:border-0"><Skel className="h-4 w-2/3" /></div>)
            : !docs.data?.length ? (
              <EmptyState testId="empty-documents" icon={<FileText className="size-5" />} title="No documents yet"
                body="Add a contract, policy or report. Veriscope can then find risks in it, and every risk will quote the exact text it is based on."
                action={<button className={btnPrimary} onClick={() => setAdding(true)} data-testid="button-add-first-document"><Plus className="size-4" aria-hidden /> Check your first document</button>} />
            ) : docs.data.map((d) => (
              <div key={d.id} className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-muted/40 md:grid-cols-[1fr_220px_90px_70px_120px_40px]" data-testid={`row-document-${d.id}`}>
                <Link href={`/documents/${d.id}`} className="min-w-0" data-testid={`link-document-${d.id}`}>
                  <div className="truncate text-[14.5px] font-semibold group-hover:underline underline-offset-4 decoration-primary decoration-2">{d.title}</div>
                  <div className="truncate text-[12.5px] text-muted-foreground">{[d.filename, d.sourceType.toUpperCase(), `${num(d.charCount)} characters`].filter(Boolean).join(" · ")}</div>
                </Link>
                <span className="hidden md:flex items-center gap-1.5"><DocStatus status={d.status} />{d.purpose === "evidence" && <Chip testId={`tag-evidence-${d.id}`} className="border-primary/40 bg-primary/5 text-primary">Evidence</Chip>}</span>
                <span className="hidden text-right text-[14px] font-medium tabular md:block">{d.riskCount}</span>
                <span className="hidden justify-center md:flex"><ScoreBadge score={d.complianceScore} testId={`text-score-${d.id}`} /></span>
                <span className="hidden text-[13px] text-muted-foreground md:block">{ago(d.createdAt)}</span>
                <button onClick={() => setPending({ id: d.id, title: d.title })} data-testid={`button-delete-document-${d.id}`} aria-label={`Delete ${d.title}`} className="grid size-8 place-items-center justify-self-end rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring">
                  <Trash2 className="size-3.5" />
                </button>
                <div className="col-span-2 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground md:hidden"><DocStatus status={d.status} />{d.purpose === "evidence" && <Chip className="border-primary/40 bg-primary/5 text-primary">Evidence</Chip>}<span>{d.riskCount} {d.riskCount === 1 ? "risk" : "risks"} · {ago(d.createdAt)}</span>{d.complianceScore != null && <span className="inline-flex items-center gap-1">Score <ScoreBadge score={d.complianceScore} /></span>}</div>
              </div>
            ))}
        </div>
      )}

      <AddDocumentDialog open={adding} onOpenChange={setAdding} />
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold tracking-tight">Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>"{pending?.title}" will be removed, together with every risk, quote, action and check that came from it. This cannot be undone.</AlertDialogDescription>
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

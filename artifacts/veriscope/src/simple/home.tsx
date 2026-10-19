import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { UploadCloud, Loader2, FileText, ChevronRight, Trash2, ScanSearch, ListChecks, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  useListDocuments, useListRisks, getListRisksQueryKey, useUploadDocument, useCreateDocument, useAnalyzeDocument, useDeleteDocument, getListDocumentsQueryKey,
} from "@workspace/api-client-react";
import type { Document } from "@workspace/api-client-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useInvalidateAll } from "@/hooks/use-invalidate";
import { Skel, ErrorState, ago, fmtBytes, btnPrimary, btnGhost, apiErrorMessage, existingDocId } from "@/components/kit";
import { cn } from "@/lib/utils";

const ACCEPT = [".pdf", ".docx", ".txt", ".md"];
const MAX = 10 * 1024 * 1024;

function checkFile(f: File): string | null {
  const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")).toLowerCase() : "";
  if (!ACCEPT.includes(ext)) return "This type of file cannot be read. Please choose a PDF or Word file.";
  if (f.size > MAX) return `This file is too big (${fmtBytes(f.size)}). The limit is 10 MB.`;
  if (f.size === 0) return "This file is empty. Please choose another file.";
  return null;
}

const STEPS = [
  { icon: UploadCloud, title: "Add your document", body: "A contract, agreement or policy (PDF or Word)." },
  { icon: ScanSearch, title: "We read it for you", body: "It takes about a minute." },
  { icon: ListChecks, title: "See what to fix", body: "Each problem is explained in plain words." },
];

/** Upload, then start the check straight away, so the user only does one thing. */
function Uploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const upload = useUploadDocument();
  const create = useCreateDocument();
  const analyze = useAnalyzeDocument();
  const invalidate = useInvalidateAll();
  const [, navigate] = useLocation();
  const busy = upload.isPending || create.isPending || analyze.isPending;

  const startCheck = (id: number) => {
    analyze.mutate({ id, data: {} }, {
      onSettled: () => { invalidate(); navigate(`/documents/${id}`); },
    });
  };
  const fail = (e: unknown) => {
    const existing = existingDocId(e);
    if (existing) { navigate(`/documents/${existing}`); return; }
    setErr(apiErrorMessage(e));
  };

  const sendFile = (f: File | undefined) => {
    if (!f || busy) return;
    const problem = checkFile(f);
    if (problem) { setErr(problem); return; }
    setErr(null);
    upload.mutate({ data: { file: f } }, { onSuccess: (d) => startCheck(d.id), onError: fail });
  };
  const sendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!title.trim() || text.trim().length < 50) { setErr("Please give the document a name and paste its full text."); return; }
    setErr(null);
    create.mutate({ data: { title: title.trim(), content: text } }, { onSuccess: (d) => startCheck(d.id), onError: fail });
  };

  return (
    <div>
      {!paste ? (
        <div
          data-testid="dropzone-simple"
          role="button" tabIndex={0} aria-label="Choose a document to check"
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); inputRef.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); sendFile(e.dataTransfer.files[0]); }}
          className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-2 focus-visible:outline-ring",
            drag ? "border-primary bg-primary/5" : "border-primary/30 bg-card hover:border-primary/60 hover:bg-primary/[0.03]", busy && "pointer-events-none")}
        >
          {busy ? (
            <>
              <Loader2 className="size-9 animate-spin text-primary" aria-hidden />
              <div className="mt-3 text-[16px] font-semibold">{analyze.isPending ? "Starting the check…" : "Uploading…"}</div>
            </>
          ) : (
            <>
              <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary"><UploadCloud className="size-7" aria-hidden /></div>
              <div className="mt-3 text-[17px] font-semibold text-foreground">Choose a document to check</div>
              <div className="mt-1 text-[14px] text-muted-foreground">or drag it here · PDF or Word · up to 10 MB</div>
              <span className={cn(btnPrimary, "mt-5 h-11 px-6 text-[15px]")}>Choose file</span>
            </>
          )}
          <input ref={inputRef} type="file" accept={ACCEPT.join(",")} className="hidden" data-testid="input-simple-file"
            onChange={(e) => { sendFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      ) : (
        <form onSubmit={sendText} className="space-y-3 rounded-xl border border-card-border bg-card p-5 shadow-sm">
          <label className="block text-[14px] font-medium">Name of the document
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Supplier agreement" data-testid="input-simple-title"
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-[14.5px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
          </label>
          <label className="block text-[14px] font-medium">Text of the document
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Paste the full text here" data-testid="input-simple-text"
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-[14.5px] leading-relaxed outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
          </label>
          <button type="submit" disabled={busy} className={cn(btnPrimary, "h-11 px-6 text-[15px]")} data-testid="button-simple-check-text">
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}Check this text
          </button>
        </form>
      )}
      {err && <div role="alert" data-testid="text-simple-error" className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[14px] text-destructive">{err}</div>}
      <button type="button" onClick={() => { setPaste((v) => !v); setErr(null); }} disabled={busy} data-testid="button-toggle-paste"
        className="mt-3 text-[13.5px] font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">
        {paste ? "Upload a file instead" : "No file? Paste the text instead"}
      </button>
    </div>
  );
}

function DocState({ d, open }: { d: Document; open: number | undefined }) {
  if (d.status === "analyzing") return <span className="inline-flex items-center gap-1.5 text-[13.5px] text-[hsl(230_38%_35%)]"><Loader2 className="size-3.5 animate-spin" aria-hidden />Checking…</span>;
  if (d.status === "failed") return <span className="inline-flex items-center gap-1.5 text-[13.5px] text-destructive"><AlertTriangle className="size-3.5" aria-hidden />Check did not finish</span>;
  if (d.status === "uploaded") return <span className="text-[13.5px] text-muted-foreground">Not checked yet</span>;
  // Count only problems that are not fixed yet, matching the document page.
  const n = open ?? d.riskCount;
  if (n === 0) return <span className="inline-flex items-center gap-1.5 text-[13.5px] text-[hsl(150_40%_26%)]"><CheckCircle2 className="size-3.5" aria-hidden />No open problems</span>;
  return <span className="text-[13.5px] font-semibold text-[hsl(28_85%_36%)]">{n} {n === 1 ? "problem" : "problems"} to look at</span>;
}

export default function SimpleHome() {
  const docs = useListDocuments({ query: { queryKey: getListDocumentsQueryKey(), refetchInterval: (q) => (q.state.data?.some((d) => d.status === "analyzing") ? 3000 : false) } });
  const risks = useListRisks(undefined, { query: { queryKey: getListRisksQueryKey() } });
  const openByDoc = new Map<number, number>();
  if (risks.data) for (const r of risks.data) if (r.status !== "closed") openByDoc.set(r.documentId, (openByDoc.get(r.documentId) ?? 0) + 1);
  const del = useDeleteDocument();
  const invalidate = useInvalidateAll();
  const [pending, setPending] = useState<Document | null>(null);
  // Follow-up evidence files belong to the detailed workflow, not this list.
  const list = (docs.data ?? []).filter((d) => d.purpose !== "evidence");

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight md:text-[2rem]">Check a document for problems</h1>
        <p className="mt-2 max-w-2xl text-[15.5px] leading-relaxed text-muted-foreground">Upload a contract or agreement. Veriscope reads it and tells you, in plain words, what could go wrong and what to change.</p>
        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-xl border border-card-border bg-card p-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[14px] font-semibold text-primary-foreground">{i + 1}</span>
              <span><span className="block text-[14.5px] font-semibold">{s.title}</span><span className="mt-0.5 block text-[13.5px] leading-snug text-muted-foreground">{s.body}</span></span>
            </li>
          ))}
        </ol>
        <div className="mt-5"><Uploader /></div>
      </section>

      <section aria-labelledby="h-your-docs">
        <h2 id="h-your-docs" className="text-[18px] font-semibold">Your documents</h2>
        {docs.isError ? <div className="mt-3"><ErrorState error={docs.error} onRetry={() => docs.refetch()} /></div>
          : docs.isLoading ? <div className="mt-3 space-y-2">{[0, 1, 2].map((i) => <Skel key={i} className="h-16 rounded-xl" />)}</div>
          : !list.length ? <p className="mt-2 text-[14.5px] text-muted-foreground" data-testid="empty-simple-documents">Nothing here yet. Your checked documents will appear here.</p>
          : (
            <ul className="mt-3 space-y-2">
              {list.map((d) => (
                <li key={d.id} className="group flex items-center gap-2 rounded-xl border border-card-border bg-card shadow-sm transition-colors hover:border-primary/40" data-testid={`row-simple-document-${d.id}`}>
                  <Link href={`/documents/${d.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5" data-testid={`link-simple-document-${d.id}`}>
                    <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{d.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3"><DocState d={d} open={risks.data ? openByDoc.get(d.id) ?? 0 : undefined} /><span className="text-[12.5px] text-muted-foreground">Added {ago(d.createdAt)}</span></span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                  </Link>
                  <button onClick={() => setPending(d)} aria-label={`Delete ${d.title}`} data-testid={`button-simple-delete-${d.id}`}
                    className="mr-2 grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
      </section>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>"{pending?.title}" and its results will be removed for everyone. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={btnGhost} data-testid="button-simple-cancel-delete">Keep it</AlertDialogCancel>
            <AlertDialogAction data-testid="button-simple-confirm-delete" disabled={del.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (!pending) return; del.mutate({ id: pending.id }, { onSettled: () => { invalidate(); setPending(null); } }); }}>
              {del.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

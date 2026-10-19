import { useRef, useState } from "react";
import { BookCheck, UploadCloud, Loader2, Trash2, RefreshCw, Info } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetPlaybook, useUploadPlaybook, useDeletePlaybook, getGetPlaybookQueryKey } from "@workspace/api-client-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, Panel, Skel, ErrorState, Chip, num, stamp, fmtBytes, btnPrimary, btnGhost, apiErrorMessage } from "@/components/kit";
import { cn } from "@/lib/utils";

const ACCEPT = [".pdf", ".docx", ".txt", ".md"];
const MAX_BYTES = 10 * 1024 * 1024;
// Matches the server limit: the rules are sent to the AI with every document.
const MAX_CHARS = 40_000;

function checkFile(f: File): string | null {
  const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")).toLowerCase() : "";
  if (!ACCEPT.includes(ext)) return `This file type (${ext || "no extension"}) is not supported. Please use a PDF, Word (.docx), TXT or Markdown file.`;
  if (f.size > MAX_BYTES) return `This file is ${fmtBytes(f.size)}. The maximum size is 10 MB.`;
  if (f.size === 0) return "This file is empty. Please choose another file.";
  return null;
}

export default function Playbook() {
  const q = useGetPlaybook({ query: { queryKey: getGetPlaybookQueryKey() } });
  const upload = useUploadPlaybook();
  const del = useDeletePlaybook();
  const qc = useQueryClient();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const pb = q.data?.playbook ?? null;

  const send = (f: File | undefined) => {
    if (!f || upload.isPending) return;
    const problem = checkFile(f);
    if (problem) { setErr(problem); return; }
    setErr(null);
    upload.mutate({ data: { file: f } }, {
      onSuccess: (p) => {
        qc.setQueryData(getGetPlaybookQueryKey(), { playbook: p });
        toast({ title: pb ? "Company rules replaced" : "Company rules saved", description: `${p.title} · ${num(p.charCount)} characters. They will be used the next time a document is checked.` });
      },
      onError: (e) => setErr(apiErrorMessage(e)),
    });
  };

  const remove = () => {
    del.mutate(undefined, {
      onSuccess: () => { qc.setQueryData(getGetPlaybookQueryKey(), { playbook: null }); setConfirmRemove(false); toast({ title: "Company rules removed" }); },
      onError: (e) => { setConfirmRemove(false); setErr(apiErrorMessage(e)); },
    });
  };

  const dropzone = (
    <div
      data-testid="dropzone-playbook"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files?.[0]); }}
      role="button" tabIndex={0} aria-label="Choose the company rules file"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
      className={cn("flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-2 focus-visible:outline-ring",
        drag ? "border-primary bg-primary/5" : "border-input bg-background hover:bg-muted/50", upload.isPending && "pointer-events-none opacity-70")}>
      <input ref={inputRef} type="file" accept={ACCEPT.join(",")} className="hidden" data-testid="input-playbook-file" onChange={(e) => { send(e.target.files?.[0]); e.target.value = ""; }} />
      {upload.isPending ? (
        <span className="inline-flex items-center gap-2 text-sm" aria-live="polite"><Loader2 className="size-4 animate-spin" aria-hidden />Uploading and reading the rules…</span>
      ) : (
        <>
          <span className="mb-2 grid size-10 place-items-center rounded-full bg-primary/10 text-primary"><UploadCloud className="size-5" aria-hidden /></span>
          <div className="text-sm">Drag your rules document here, or <span className="font-medium text-primary underline underline-offset-4">choose a file</span></div>
          <div className="mt-1.5 text-[12.5px] text-muted-foreground">PDF, Word (.docx), TXT or Markdown · up to {num(MAX_CHARS)} characters of text</div>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Company rules" description="Upload your own contract rules (for example: maximum payment terms, required clauses). Every document you check is compared against them, and each difference quotes the rule it is based on." />

      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.isLoading ? <div className="space-y-3"><Skel className="h-24" /><Skel className="h-64" /></div> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            {!pb ? (
              <Panel title="No company rules yet" aside={<BookCheck className="size-4 text-muted-foreground" aria-hidden />} testId="panel-playbook-empty">
                <p className="mb-4 text-[14px] leading-relaxed text-muted-foreground">Without company rules, documents are checked for general business risks only.</p>
                {dropzone}
              </Panel>
            ) : (
              <Panel title={<span data-testid="text-playbook-title">{pb.title}</span>}
                subtitle={<span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]">
                  <Chip className="border-border text-muted-foreground">{pb.sourceType.toUpperCase()}</Chip>
                  {pb.pageCount != null && <span>{pb.pageCount} pages</span>}
                  <span>{num(pb.charCount)} characters</span>
                  <span>Uploaded {stamp(pb.createdAt)}</span>
                  {pb.filename && <span className="break-all">{pb.filename}</span>}
                </span>}
                bodyClass="p-0" testId="panel-playbook">
                <div data-testid="text-playbook-content" className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words px-5 py-5 font-quote text-[15px] leading-[1.75] text-foreground/90 md:px-7">{pb.content}</div>
              </Panel>
            )}
            {err && <div data-testid="text-playbook-error" role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{err}</div>}
          </div>

          <aside className="space-y-6 self-start">
            {pb && (
              <Panel title="Change the rules">
                <div className="space-y-2">
                  <button className={`${btnPrimary} w-full`} disabled={upload.isPending || del.isPending} onClick={() => inputRef.current?.click()} data-testid="button-replace-playbook">
                    {upload.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" aria-hidden />} Replace with a new file
                  </button>
                  <button className={`${btnGhost} w-full`} disabled={upload.isPending || del.isPending} onClick={() => setConfirmRemove(true)} data-testid="button-remove-playbook">
                    <Trash2 className="size-3.5" aria-hidden /> Remove company rules
                  </button>
                </div>
                <input ref={inputRef} type="file" accept={ACCEPT.join(",")} className="hidden" onChange={(e) => { send(e.target.files?.[0]); e.target.value = ""; }} />
              </Panel>
            )}
            <Panel title="How it works" aside={<Info className="size-4 text-muted-foreground" aria-hidden />}>
              <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed">
                <li>There is one set of company rules. Uploading a new file replaces it.</li>
                <li>The rules apply to the next check. Documents checked earlier keep their results; select "Check this document again" to compare them with the new rules.</li>
                <li>Each rule the AI cites is checked word for word against this text. A rule that cannot be found is marked and sent for your review.</li>
                <li>Keep only the rules themselves: the text is sent to the AI with every document.</li>
              </ul>
            </Panel>
          </aside>
        </div>
      )}

      <AlertDialog open={confirmRemove} onOpenChange={(o) => !del.isPending && setConfirmRemove(o)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold tracking-tight">Remove the company rules?</AlertDialogTitle>
            <AlertDialogDescription>Later checks will look for general business risks only. Risks found earlier keep the rule they quoted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove-playbook">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-remove-playbook" disabled={del.isPending} onClick={(e) => { e.preventDefault(); remove(); }}>
              {del.isPending && <Loader2 className="size-3.5 animate-spin" />} Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

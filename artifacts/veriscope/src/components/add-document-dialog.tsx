import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, UploadCloud, FileText, X } from "lucide-react";
import { useCreateDocument, useUploadDocument } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useInvalidateAll } from "@/hooks/use-invalidate";
import { num, btnPrimary, btnGhost, apiErrorMessage, existingDocId, fmtBytes } from "@/components/kit";
import { cn } from "@/lib/utils";

const ACCEPT = [".pdf", ".docx", ".txt", ".md"];
const MAX = 10 * 1024 * 1024;
const field = "mt-1.5 h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20";
const lbl = "text-[12.5px] font-medium text-foreground/80";

function checkFile(f: File): string | null {
  const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")).toLowerCase() : "";
  if (!ACCEPT.includes(ext)) return `This file type (${ext || "no extension"}) is not supported. Please use a PDF, Word (.docx), TXT or Markdown file.`;
  if (f.size > MAX) return `This file is ${fmtBytes(f.size)}. The maximum size is 10 MB.`;
  if (f.size === 0) return "This file is empty. Please choose another file.";
  return null;
}

export function AddDocumentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<{ msg: string; existing: number | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const create = useCreateDocument();
  const upload = useUploadDocument();
  const invalidate = useInvalidateAll();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const pending = create.isPending || upload.isPending;

  const reset = () => { setTitle(""); setContent(""); setFile(null); setErr(null); };
  const done = (doc: { id: number; title: string; charCount: number }) => {
    invalidate();
    toast({ title: "Document added", description: `${doc.title} · ${num(doc.charCount)} characters read. Next: select "Find risks with AI".` });
    reset(); onOpenChange(false); navigate(`/documents/${doc.id}`);
  };
  const fail = (e: unknown) => setErr({ msg: apiErrorMessage(e), existing: existingDocId(e) });

  const pick = (f: File | undefined) => {
    if (!f) return;
    const problem = checkFile(f);
    if (problem) { setFile(null); setErr({ msg: problem, existing: null }); return; }
    setErr(null); setFile(f);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setErr(null);
    if (tab === "upload") {
      if (!file) { setErr({ msg: "Please choose a file first.", existing: null }); return; }
      upload.mutate({ data: { file, ...(title.trim() && { title: title.trim() }) } }, { onSuccess: done, onError: fail });
    } else {
      if (!title.trim() || !content.trim()) { setErr({ msg: "Please enter a name and paste the document text.", existing: null }); return; }
      create.mutate({ data: { title: title.trim(), content } }, { onSuccess: done, onError: fail });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) { onOpenChange(o); if (!o) setErr(null); } }}>
      <DialogContent className="max-w-2xl bg-card">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">Check a document</DialogTitle>
          <DialogDescription>Add a contract, policy or report. We will open it next so you can start the AI risk check. Every quote the AI uses is matched against this text.</DialogDescription>
        </DialogHeader>
        <div className="inline-flex self-start overflow-hidden rounded-md border border-input" role="tablist" aria-label="How to add the document">
          {(["upload", "paste"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} data-testid={`tab-${t}`} disabled={pending} onClick={() => { setTab(t); setErr(null); }}
              className={cn("px-3.5 py-1.5 text-[13px] font-medium transition-colors", t === "paste" && "border-l border-input", tab === t ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
              {t === "upload" ? "Upload a file" : "Paste text"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-4">
          {tab === "upload" ? (
            <>
              <div
                data-testid="dropzone-file"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
                role="button" tabIndex={0} aria-label="Choose a file to upload" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
                className={cn("flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-9 text-center transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                  drag ? "border-primary bg-primary/5" : "border-input bg-background hover:bg-muted/50")}>
                <input ref={inputRef} type="file" accept={ACCEPT.join(",")} className="hidden" data-testid="input-file" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
                {file ? (
                  <div className="flex items-center gap-3 text-left">
                    <FileText className="size-6 text-muted-foreground" />
                    <div className="min-w-0"><div className="truncate text-sm font-medium" data-testid="text-file-name">{file.name}</div><div className="text-[12px] text-muted-foreground">{fmtBytes(file.size)} · ready to upload</div></div>
                    <button type="button" aria-label="Remove file" data-testid="button-remove-file" onClick={(e) => { e.stopPropagation(); setFile(null); }} className="grid size-7 place-items-center rounded-sm hover:bg-muted"><X className="size-3.5" /></button>
                  </div>
                ) : (
                  <>
                    <span className="mb-2 grid size-10 place-items-center rounded-full bg-primary/10 text-primary"><UploadCloud className="size-5" aria-hidden /></span>
                    <div className="text-sm">Drag a file here, or <span className="font-medium text-primary underline underline-offset-4">choose a file</span></div>
                    <div className="mt-1.5 text-[12.5px] text-muted-foreground">PDF, Word (.docx), TXT or Markdown · up to 10 MB</div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">Scanned PDFs without selectable text cannot be read.</div>
                  </>
                )}
              </div>
              <label className="block">
                <span className={lbl}>Name <span className="font-normal text-muted-foreground">(optional, uses the file name if empty)</span></span>
                <input data-testid="input-upload-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
              </label>
            </>
          ) : (
            <>
              <label className="block">
                <span className={lbl}>Name</span>
                <input data-testid="input-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Master Services Agreement — Halden Logistics" className={field} />
              </label>
              <label className="block">
                <span className={cn(lbl, "flex justify-between")}><span>Document text</span><span className="font-normal tabular text-muted-foreground">{num(content.length)} characters</span></span>
                <textarea data-testid="input-content" value={content} onChange={(e) => setContent(e.target.value)} rows={12} placeholder="Paste contract, policy or audit report text..." className="mt-1.5 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-[14px] leading-relaxed outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
              </label>
            </>
          )}
          {err && (
            <div data-testid="text-form-error" role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {err.msg}
              {err.existing != null && (
                <Link href={`/documents/${err.existing}`} onClick={() => onOpenChange(false)} data-testid="link-existing-document" className="ml-2 font-medium text-foreground underline underline-offset-4">Open existing document</Link>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {pending && <span className="mr-auto inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground" data-testid="text-upload-progress" aria-live="polite"><Loader2 className="size-3 animate-spin" aria-hidden />{tab === "upload" ? "Uploading and reading the text…" : "Saving the document…"}</span>}
            <button type="button" className={btnGhost} disabled={pending} onClick={() => onOpenChange(false)} data-testid="button-cancel">Cancel</button>
            <button type="submit" className={btnPrimary} disabled={pending} data-testid="button-submit-document">
              {pending && <Loader2 className="size-3.5 animate-spin" />} {pending ? (tab === "upload" ? "Uploading…" : "Saving…") : tab === "upload" ? "Upload document" : "Add document"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

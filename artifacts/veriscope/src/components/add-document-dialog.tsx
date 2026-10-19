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
const field = "mt-1.5 h-9 w-full rounded-sm border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";
const lbl = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground";

function checkFile(f: File): string | null {
  const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")).toLowerCase() : "";
  if (!ACCEPT.includes(ext)) return `Unsupported file type "${ext || "none"}". Accepted: PDF, DOCX, TXT, MD.`;
  if (f.size > MAX) return `File is ${fmtBytes(f.size)}; the limit is 10 MB.`;
  if (f.size === 0) return "File is empty.";
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
    toast({ title: "Document added", description: `${doc.title} · ${num(doc.charCount)} characters` });
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
      if (!file) { setErr({ msg: "Choose a file to upload.", existing: null }); return; }
      upload.mutate({ data: { file, ...(title.trim() && { title: title.trim() }) } }, { onSuccess: done, onError: fail });
    } else {
      if (!title.trim() || !content.trim()) { setErr({ msg: "Title and text are both required.", existing: null }); return; }
      create.mutate({ data: { title: title.trim(), content } }, { onSuccess: done, onError: fail });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) { onOpenChange(o); if (!o) setErr(null); } }}>
      <DialogContent className="max-w-2xl bg-card">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl font-normal">Add a document</DialogTitle>
          <DialogDescription>Its text becomes the ground truth. Evidence quotes are verified against it character for character.</DialogDescription>
        </DialogHeader>
        <div className="inline-flex self-start overflow-hidden rounded-sm border border-border">
          {(["upload", "paste"] as const).map((t) => (
            <button key={t} type="button" data-testid={`tab-${t}`} disabled={pending} onClick={() => { setTab(t); setErr(null); }}
              className={cn("px-3 py-1.5 text-xs transition-colors", t === "paste" && "border-l border-border", tab === t ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {t === "upload" ? "Upload file" : "Paste text"}
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
                className={cn("flex cursor-pointer flex-col items-center justify-center rounded-sm border border-dashed px-6 py-9 text-center transition-colors",
                  drag ? "border-foreground bg-accent/30" : "border-foreground/25 bg-background hover:bg-muted/50")}>
                <input ref={inputRef} type="file" accept={ACCEPT.join(",")} className="hidden" data-testid="input-file" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
                {file ? (
                  <div className="flex items-center gap-3 text-left">
                    <FileText className="size-6 text-muted-foreground" />
                    <div className="min-w-0"><div className="truncate text-sm font-medium" data-testid="text-file-name">{file.name}</div><div className="font-mono text-[11px] text-muted-foreground">{fmtBytes(file.size)}</div></div>
                    <button type="button" aria-label="Remove file" data-testid="button-remove-file" onClick={(e) => { e.stopPropagation(); setFile(null); }} className="grid size-7 place-items-center rounded-sm hover:bg-muted"><X className="size-3.5" /></button>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="mb-2 size-6 text-muted-foreground" />
                    <div className="text-sm">Drop a file here, or <span className="underline decoration-accent decoration-2 underline-offset-4">browse</span></div>
                    <div className="mt-1 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">PDF · DOCX · TXT · MD — up to 10 MB</div>
                  </>
                )}
              </div>
              <label className="block">
                <span className={lbl}>Title <span className="normal-case tracking-normal">(optional, defaults to filename)</span></span>
                <input data-testid="input-upload-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
              </label>
            </>
          ) : (
            <>
              <label className="block">
                <span className={lbl}>Title</span>
                <input data-testid="input-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Master Services Agreement — Halden Logistics" className={field} />
              </label>
              <label className="block">
                <span className={cn(lbl, "flex justify-between")}><span>Document text</span><span className="tabular">{num(content.length)} chars</span></span>
                <textarea data-testid="input-content" value={content} onChange={(e) => setContent(e.target.value)} rows={12} placeholder="Paste contract, policy or audit report text..." className="mt-1.5 w-full resize-y rounded-sm border border-input bg-background px-3 py-2 font-serif text-[15px] leading-relaxed outline-none focus:border-ring focus:ring-2 focus:ring-ring/15" />
              </label>
            </>
          )}
          {err && (
            <div data-testid="text-form-error" className="rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {err.msg}
              {err.existing != null && (
                <Link href={`/documents/${err.existing}`} onClick={() => onOpenChange(false)} data-testid="link-existing-document" className="ml-2 font-medium text-foreground underline underline-offset-4">Open existing document</Link>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} disabled={pending} onClick={() => onOpenChange(false)} data-testid="button-cancel">Cancel</button>
            <button type="submit" className={btnPrimary} disabled={pending} data-testid="button-submit-document">
              {pending && <Loader2 className="size-3.5 animate-spin" />} {pending ? (tab === "upload" ? "Uploading..." : "Adding...") : tab === "upload" ? "Upload document" : "Add document"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { format, isPast, parseISO } from "date-fns";
import { Plus, Pencil, Trash2, Loader2, ListTodo, UploadCloud, FileText, X, ArrowRight, Info, ShieldCheck, AlertTriangle, ScaleIcon, Check } from "lucide-react";
import {
  useGetRisk, useListDocuments, useCreateAction, useUpdateAction, useDeleteAction, useRequestReassessment,
  useDecideAssessment, useChangeRiskStatus, getGetRiskQueryKey, getListDocumentsQueryKey,
  getGetDashboardSummaryQueryKey, getGetRecentActivityQueryKey, RiskStatus as RiskStatusEnum,
} from "@workspace/api-client-react";
import type { RiskDetail, MitigationAction, ActionStatus, RiskStatus, Assessment, RiskStatusChange, AssessmentVerdict, HumanDecision } from "@workspace/api-client-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Panel, EmptyState, StatusChip, Chip, HumanDecisionBox, ACTION_STATUSES, actionStatusLabel, riskStatusLabel, verdictLabel,
  inputCls, labelCls, btnPrimary, btnGhost, stamp, apiErrorMessage, fmtBytes,
} from "@/components/kit";
import { cn } from "@/lib/utils";

/* ---------- data ---------- */

export function useRiskQuery(id: number, enabled: boolean) {
  const q = useGetRisk(id, {
    query: {
      enabled, queryKey: getGetRiskQueryKey(id),
      refetchInterval: (query) => (query.state.data?.reassessmentRequests?.[0]?.status === "pending" ? 2000 : false),
    },
  });
  const refresh = useRefreshRisk(id);
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  const latest = q.data?.reassessmentRequests?.[0]?.status;
  const prev = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prev.current === "pending" && latest && latest !== "pending") refreshRef.current();
    prev.current = latest;
  }, [latest]);
  return q;
}

export function useRefreshRisk(id: number) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: getGetRiskQueryKey(id) });
    qc.invalidateQueries({ queryKey: ["/api/risks"] });
    qc.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    qc.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  };
}

function ErrLine({ msg, testId }: { msg: string | null; testId?: string }) {
  if (!msg) return null;
  return <div data-testid={testId} role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive break-words">{msg}</div>;
}

/* ---------- actions ---------- */

type ActionForm = { description: string; owner: string; dueDate: string; status: ActionStatus; evidenceNote: string; evidenceDocumentId: string };
const emptyForm: ActionForm = { description: "", owner: "", dueDate: "", status: "open", evidenceNote: "", evidenceDocumentId: "" };
const toForm = (a: MitigationAction): ActionForm => ({
  description: a.description, owner: a.owner ?? "", dueDate: a.dueDate ? a.dueDate.slice(0, 10) : "", status: a.status,
  evidenceNote: a.evidenceNote ?? "", evidenceDocumentId: a.evidenceDocumentId ? String(a.evidenceDocumentId) : "",
});
const toPayload = (f: ActionForm) => ({
  description: f.description.trim(), owner: f.owner.trim() || null, dueDate: f.dueDate || null, status: f.status,
  evidenceNote: f.evidenceNote.trim() || null, evidenceDocumentId: f.evidenceDocumentId ? Number(f.evidenceDocumentId) : null,
});

function ActionEditor({ initial, pending, error, onSubmit, onCancel, submitLabel }: { initial: ActionForm; pending: boolean; error: string | null; onSubmit: (f: ActionForm) => void; onCancel: () => void; submitLabel: string }) {
  const [f, setF] = useState(initial);
  const [local, setLocal] = useState<string | null>(null);
  const docs = useListDocuments({ query: { queryKey: getListDocumentsQueryKey() } });
  const set = <K extends keyof ActionForm>(k: K, v: ActionForm[K]) => setF((p) => ({ ...p, [k]: v }));
  return (
    <form className="space-y-3 bg-muted/40 px-4 py-4" onSubmit={(e) => { e.preventDefault(); if (!f.description.trim()) { setLocal("Describe what needs to be done."); return; } setLocal(null); onSubmit(f); }}>
      <label className="block"><span className={labelCls}>What needs to be done</span>
        <textarea data-testid="input-action-description" rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} className={cn(inputCls, "mt-1 h-auto py-1.5")} /></label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block"><span className={labelCls}>Owner</span><input data-testid="input-action-owner" value={f.owner} onChange={(e) => set("owner", e.target.value)} className={cn(inputCls, "mt-1")} /></label>
        <label className="block"><span className={labelCls}>Due date</span><input data-testid="input-action-due" type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} className={cn(inputCls, "mt-1")} /></label>
        <label className="block"><span className={labelCls}>Status</span>
          <select data-testid="select-action-status" value={f.status} onChange={(e) => set("status", e.target.value as ActionStatus)} className={cn(inputCls, "mt-1")}>
            {ACTION_STATUSES.map((s) => <option key={s} value={s}>{actionStatusLabel[s]}</option>)}
          </select></label>
      </div>
      <label className="block"><span className={labelCls}>Proof it was done (note)</span>
        <input data-testid="input-action-evidence-note" value={f.evidenceNote} onChange={(e) => set("evidenceNote", e.target.value)} placeholder="What shows this action was carried out?" className={cn(inputCls, "mt-1")} /></label>
      <label className="block"><span className={labelCls}>Linked document (optional)</span>
        <select data-testid="select-action-document" value={f.evidenceDocumentId} onChange={(e) => set("evidenceDocumentId", e.target.value)} className={cn(inputCls, "mt-1")}>
          <option value="">None</option>
          {docs.data?.map((d) => <option key={d.id} value={d.id}>{d.title}{d.purpose === "evidence" ? " (evidence)" : ""}</option>)}
        </select></label>
      <ErrLine msg={local ?? error} testId="text-action-error" />
      <div className="flex justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onCancel} disabled={pending} data-testid="button-cancel-action">Cancel</button>
        <button type="submit" className={btnPrimary} disabled={pending} data-testid="button-save-action">{pending && <Loader2 className="size-3.5 animate-spin" />}{submitLabel}</button>
      </div>
    </form>
  );
}

function ActionRow({ a, riskId }: { a: MitigationAction; riskId: number }) {
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const update = useUpdateAction();
  const del = useDeleteAction();
  const refresh = useRefreshRisk(riskId);
  const { toast } = useToast();
  const overdue = !!a.dueDate && a.status !== "submitted_for_review" && isPast(parseISO(a.dueDate.length <= 10 ? `${a.dueDate}T23:59:59` : a.dueDate));

  if (editing) return (
    <div className="border-b border-border last:border-0">
      <ActionEditor initial={toForm(a)} pending={update.isPending} error={err} submitLabel="Save changes" onCancel={() => { setEditing(false); setErr(null); }}
        onSubmit={(f) => update.mutate({ id: a.id, data: toPayload(f) }, { onSuccess: () => { refresh(); setEditing(false); setErr(null); }, onError: (e) => setErr(apiErrorMessage(e)) })} />
    </div>
  );

  const setStatus = (s: ActionStatus) => update.mutate({ id: a.id, data: { status: s } }, {
    onSuccess: () => { refresh(); setErr(null); }, onError: (e) => setErr(apiErrorMessage(e)),
  });

  return (
    <div className="group border-b border-border px-4 py-3 last:border-0" data-testid={`row-action-${a.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-[14px] leading-snug">{a.description}</div>
        <div className="flex shrink-0 items-center gap-1">
          <StatusChip status={a.status} testId={`status-action-${a.id}`} />
          <button aria-label="Edit action" data-testid={`button-edit-action-${a.id}`} onClick={() => setEditing(true)} className="grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>
          <button aria-label="Delete action" data-testid={`button-delete-action-${a.id}`} onClick={() => setConfirmDel(true)} className="grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" /></button>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-muted-foreground">
        <span>Owner: <span className="text-foreground">{a.owner ?? "Not assigned"}</span></span>
        <span className={cn(overdue && "font-medium text-destructive")} data-testid={`text-action-due-${a.id}`}>{a.dueDate ? `${overdue ? "Overdue · was due " : "Due "}${format(parseISO(a.dueDate), "dd MMM yyyy")}` : "No due date"}</span>
        <span title={`Created ${stamp(a.createdAt)}`}>Updated {stamp(a.updatedAt)}</span>
      </div>
      {(a.evidenceNote || a.evidenceDocumentId) && (
        <div className="mt-2 border-l-2 border-border pl-3 text-[12.5px]">
          <span className={labelCls}>Proof it was done</span>
          {a.evidenceNote && <p className="mt-0.5">{a.evidenceNote}</p>}
          {a.evidenceDocumentId && <Link href={`/documents/${a.evidenceDocumentId}`} data-testid={`link-action-document-${a.id}`} className="mt-0.5 inline-flex items-center gap-1 underline underline-offset-4"><FileText className="size-3" />{a.evidenceDocumentTitle ?? `Document ${a.evidenceDocumentId}`}</Link>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[12px] text-muted-foreground">Progress:</span>
        {ACTION_STATUSES.map((s) => (
          <button key={s} disabled={a.status === s || update.isPending} onClick={() => setStatus(s)} data-testid={`button-action-status-${a.id}-${s}`}
            aria-pressed={a.status === s} className={cn("rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors", a.status === s ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted disabled:opacity-50")}>
            {actionStatusLabel[s]}
          </button>
        ))}
        {update.isPending && <Loader2 className="ml-1 size-3 animate-spin text-muted-foreground" />}
      </div>
      {err && <div className="mt-2"><ErrLine msg={err} /></div>}
      <AlertDialog open={confirmDel} onOpenChange={(o) => !del.isPending && setConfirmDel(o)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold tracking-tight">Delete this action?</AlertDialogTitle>
            <AlertDialogDescription>"{a.description}" will be removed from this risk. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-delete-action" disabled={del.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); del.mutate({ id: a.id }, { onSuccess: () => { refresh(); setConfirmDel(false); }, onError: (er) => { setConfirmDel(false); toast({ title: "Delete failed", description: apiErrorMessage(er), variant: "destructive" }); } }); }}>
              {del.isPending && <Loader2 className="size-3.5 animate-spin" />} Delete action
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ActionsSection({ risk }: { risk: RiskDetail }) {
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const create = useCreateAction();
  const refresh = useRefreshRisk(risk.id);
  return (
    <Panel title="Action plan" subtitle="Who will do what, and by when." bodyClass="p-0" aside={!adding && <button className={cn(btnGhost, "h-8")} onClick={() => setAdding(true)} data-testid="button-add-action"><Plus className="size-3.5" aria-hidden /> Add action</button>}>
      <div className="flex gap-2 border-b border-border bg-muted/40 px-4 py-2 text-[12.5px] text-muted-foreground" data-testid="text-action-note">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />Finishing an action does not close the risk. To close it, check again with new evidence and have a person approve.
      </div>
      {adding && (
        <div className="border-b border-border">
          <ActionEditor initial={emptyForm} pending={create.isPending} error={err} submitLabel="Add action" onCancel={() => { setAdding(false); setErr(null); }}
            onSubmit={(f) => create.mutate({ id: risk.id, data: toPayload(f) }, { onSuccess: () => { refresh(); setAdding(false); setErr(null); }, onError: (e) => setErr(apiErrorMessage(e)) })} />
        </div>
      )}
      {!risk.actions.length && !adding ? <EmptyState icon={<ListTodo className="size-5" />} title="No actions yet" body="Add an action to plan what will be done about this risk, who owns it and by when." />
        : risk.actions.map((a) => <ActionRow key={a.id} a={a} riskId={risk.id} />)}
    </Panel>
  );
}

/* ---------- reassessment ---------- */

const RE_ACCEPT = [".pdf", ".docx", ".txt", ".md"];
const reqStyle: Record<string, string> = {
  pending: "border-[hsl(230_38%_40%/0.4)] text-[hsl(230_38%_35%)]",
  completed: "border-[hsl(150_35%_35%/0.4)] text-[hsl(150_40%_26%)]",
  failed: "border-destructive/50 text-destructive",
};

export function ReassessPanel({ risk }: { risk: RiskDetail }) {
  const [tab, setTab] = useState<"file" | "text" | "doc">("file");
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [docId, setDocId] = useState("");
  const latestAction = useMemo(() => [...risk.actions].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0], [risk.actions]);
  const [actionId, setActionId] = useState<string>(latestAction ? String(latestAction.id) : "");
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const docs = useListDocuments({ query: { queryKey: getListDocumentsQueryKey() } });
  const req = useRequestReassessment();
  const refresh = useRefreshRisk(risk.id);
  const latest = risk.reassessmentRequests[0];
  const pending = latest?.status === "pending";
  const busy = req.isPending || pending;

  useEffect(() => { if (!actionId && latestAction) setActionId(String(latestAction.id)); }, [latestAction, actionId]);

  const pick = (f?: File) => {
    if (!f) return;
    const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")).toLowerCase() : "";
    if (!RE_ACCEPT.includes(ext)) { setFile(null); setErr(`Unsupported file type "${ext || "none"}". Accepted: PDF, DOCX, TXT, MD.`); return; }
    if (f.size > 10 * 1024 * 1024) { setFile(null); setErr(`File is ${fmtBytes(f.size)}; the limit is 10 MB.`); return; }
    setErr(null); setFile(f);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const extra = actionId ? { actionId: Number(actionId) } : {};
    let data;
    if (tab === "file") { if (!file) return setErr("Choose a file with your evidence."); data = { file, ...extra }; }
    else if (tab === "text") { if (!content.trim()) return setErr("Paste the evidence text first."); data = { content, ...(title.trim() && { title: title.trim() }), ...extra }; }
    else { if (!docId) return setErr("Choose a saved document."); data = { documentId: Number(docId), ...extra }; }
    setErr(null);
    req.mutate({ id: risk.id, data }, {
      onSuccess: () => { refresh(); setFile(null); setContent(""); setTitle(""); },
      onError: (er) => setErr(apiErrorMessage(er)),
    });
  };

  return (
    <Panel title="Check again with new evidence" subtitle="Add proof that the fix is in place. The AI suggests whether the risk is resolved; it never changes the status by itself." aside={<ScaleIcon className="size-4 text-muted-foreground" aria-hidden />} testId="section-check-again">

      {pending && latest && (
        <div className="mb-3 rounded-sm border border-[hsl(230_38%_40%/0.35)] bg-[hsl(230_38%_40%/0.05)] p-3" data-testid="status-reassessment-pending">
          <div className="flex items-center gap-2 text-[13.5px] font-medium" aria-live="polite"><Loader2 className="size-3.5 animate-spin" aria-hidden />Checking your evidence… this usually takes under a minute.</div>
          <div className="mt-1 text-[12px] text-muted-foreground">{latest.evidenceDocumentTitle} · started {stamp(latest.createdAt)}</div>
          <div className="mt-2 h-1 overflow-hidden rounded-[1px] bg-muted"><div className="h-full w-1/3 animate-pulse bg-foreground/40" /></div>
        </div>
      )}
      {latest?.status === "failed" && (
        <div className="mb-3 rounded-sm border border-destructive/30 bg-destructive/5 p-3 text-[13px]" data-testid="status-reassessment-failed">
          <div className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" /><span className="break-words text-destructive"><b>The check did not finish.</b> {latest.error ?? "No reason was reported."}</span></div>
          <div className="mt-1 pl-5">Nothing about this risk was changed. You can try again.</div>
        </div>
      )}
      {latest?.status === "completed" && latest.assessmentId != null && (
        <Link href={`/risks/${risk.id}/reassessments/${latest.assessmentId}`} data-testid="link-latest-comparison" className="mb-3 flex items-center justify-between gap-3 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-[13px] hover:bg-accent/15">
          <span>Latest check finished · {latest.evidenceDocumentTitle}</span><span className="inline-flex shrink-0 items-center gap-1 font-medium text-primary">See result <ArrowRight className="size-3.5" aria-hidden /></span>
        </Link>
      )}

      <form onSubmit={submit} className="space-y-3">
        <div className="inline-flex max-w-full overflow-hidden rounded-md border border-input" role="tablist" aria-label="How to add evidence">
          {([["file", "Upload a file"], ["text", "Paste text"], ["doc", "Use a saved document"]] as const).map(([k, l], i) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} data-testid={`tab-reassess-${k}`} disabled={busy} onClick={() => { setTab(k); setErr(null); }}
              className={cn("px-3 py-1.5 text-[12.5px] font-medium transition-colors", i > 0 && "border-l border-input", tab === k ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{l}</button>
          ))}
        </div>
        {tab === "file" && (
          <div onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }} data-testid="dropzone-evidence"
            role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
            className="flex cursor-pointer flex-wrap items-center justify-center gap-2 rounded-md border border-dashed border-foreground/25 bg-background px-4 py-5 text-center text-[13px] hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
            <input ref={inputRef} type="file" accept={RE_ACCEPT.join(",")} className="hidden" data-testid="input-evidence-file" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            {file ? <><FileText className="size-4" /><span className="truncate">{file.name}</span><span className="text-[12px] text-muted-foreground">{fmtBytes(file.size)}</span>
              <button type="button" aria-label="Remove file" onClick={(e) => { e.stopPropagation(); setFile(null); }} className="grid size-6 place-items-center rounded-sm hover:bg-muted"><X className="size-3" /></button></>
              : <><UploadCloud className="size-4 text-muted-foreground" aria-hidden /><span>Drop a file here or <span className="font-medium text-primary underline underline-offset-4">choose a file</span></span><span className="w-full text-[12px] text-muted-foreground">PDF, Word (.docx), TXT or Markdown · up to 10 MB</span></>}
          </div>
        )}
        {tab === "text" && <>
          <input data-testid="input-evidence-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" maxLength={200} className={inputCls} />
          <textarea data-testid="input-evidence-content" value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder="Paste the evidence, for example a signed confirmation or a log extract..." className={cn(inputCls, "h-auto py-2 text-[14px]")} />
        </>}
        {tab === "doc" && (
          <select data-testid="select-evidence-document" value={docId} onChange={(e) => setDocId(e.target.value)} className={inputCls}>
            <option value="">Choose a saved document…</option>
            {docs.data?.map((d) => <option key={d.id} value={d.id}>{d.title}{d.purpose === "evidence" ? " (evidence)" : ""}</option>)}
          </select>
        )}
        <label className="block"><span className={labelCls}>Which action does this evidence relate to?</span>
          <select data-testid="select-reassess-action" value={actionId} onChange={(e) => setActionId(e.target.value)} className={cn(inputCls, "mt-1")}>
            <option value="">No specific action</option>
            {risk.actions.map((a) => <option key={a.id} value={a.id}>{a.description.slice(0, 80)}</option>)}
          </select></label>
        <ErrLine msg={err} testId="text-reassess-error" />
        <button type="submit" className={cn(btnPrimary, "w-full")} disabled={busy} data-testid="button-submit-reassessment">
          {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}{pending ? "Checking…" : "Check again"}
        </button>
      </form>

      {risk.reassessmentRequests.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className={cn(labelCls, "mb-2")}>Earlier checks</div>
          <ol className="space-y-2">
            {risk.reassessmentRequests.map((r) => (
              <li key={r.id} className="text-[12px]" data-testid={`item-reassess-request-${r.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{r.evidenceDocumentTitle}</span>
                  <Chip className={reqStyle[r.status]}>{r.status === "pending" ? "Checking" : r.status === "completed" ? "Finished" : "Failed"}</Chip>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
                  <span>{stamp(r.createdAt)}</span>
                  {r.status === "completed" && r.assessmentId != null && <Link href={`/risks/${risk.id}/reassessments/${r.assessmentId}`} className="font-medium text-primary underline underline-offset-4" data-testid={`link-request-compare-${r.id}`}>See result</Link>}
                </div>
                {r.status === "failed" && r.error && <div className="mt-0.5 break-words text-destructive">{r.error}</div>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  );
}

/* ---------- decisions & status ---------- */

export function DecisionForm({ assessment, riskId }: { assessment: Assessment; riskId: number }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const decide = useDecideAssessment();
  const refresh = useRefreshRisk(riskId);
  if (assessment.decision) {
    return (
      <HumanDecisionBox by={assessment.decidedBy ?? "Unknown"} at={assessment.decidedAt} testId="box-decision">
        <div className="text-[14px] font-medium">AI suggestion {assessment.decision === "accepted" ? "accepted" : "rejected"}</div>
        {assessment.decisionNote && <p className="mt-1 text-[13px] leading-relaxed">{assessment.decisionNote}</p>}
        <p className="mt-1.5 text-[12px] text-muted-foreground">Recording a decision does not change the risk's status. Closing is a separate step.</p>
      </HumanDecisionBox>
    );
  }
  const go = (d: HumanDecision) => {
    if (!name.trim()) return setErr("Enter your name so the decision is recorded against it.");
    setErr(null);
    decide.mutate({ id: assessment.id, data: { decision: d, decidedBy: name.trim(), note: note.trim() || null } }, { onSuccess: () => refresh(), onError: (e) => setErr(apiErrorMessage(e)) });
  };
  return (
    <div className="space-y-2.5 rounded-lg border border-card-border bg-card p-4 shadow-sm" data-testid="form-decision">
      <div><div className="text-[14.5px] font-semibold">Do you agree with the AI?</div><p className="mt-0.5 text-[12.5px] text-muted-foreground">Your decision is saved with your name.</p></div>
      <input data-testid="input-decided-by" aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={inputCls} />
      <textarea data-testid="input-decision-note" aria-label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note (optional)" className={cn(inputCls, "h-auto py-1.5")} />
      <ErrLine msg={err} testId="text-decision-error" />
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={decide.isPending} onClick={() => go("accepted")} data-testid="button-accept-recommendation">{decide.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}Accept suggestion</button>
        <button className={btnGhost} disabled={decide.isPending} onClick={() => go("rejected")} data-testid="button-reject-recommendation">Reject suggestion</button>
      </div>
      <p className="text-[12px] text-muted-foreground">This records your judgement only. It does not change the risk's status.</p>
    </div>
  );
}

export function CloseRiskDialog({ risk, open, onOpenChange, assessmentId, verdict }: { risk: RiskDetail; open: boolean; onOpenChange: (o: boolean) => void; assessmentId: number | null; verdict: AssessmentVerdict | null }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const change = useChangeRiskStatus();
  const refresh = useRefreshRisk(risk.id);
  const { toast } = useToast();
  const valid = name.trim().length > 0 && note.trim().length >= 10 && ok;
  const submit = () => {
    if (!valid) return setErr("Please enter your name, a reason of at least 10 characters, and tick the approval box.");
    setErr(null);
    change.mutate({ id: risk.id, data: { status: "closed", approveClosure: true, changedBy: name.trim(), note: note.trim(), ...(assessmentId != null && { assessmentId }) } }, {
      onSuccess: () => { refresh(); onOpenChange(false); setName(""); setNote(""); setOk(false); toast({ title: "Risk closed", description: `Recorded by ${name.trim()}` }); },
      onError: (e) => setErr(apiErrorMessage(e)),
    });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !change.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-lg bg-card">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">Close this risk</DialogTitle>
          <DialogDescription>Closing is your decision and is recorded permanently with your name.{assessmentId != null ? ` It will be linked to check #${assessmentId}.` : " No evidence check will be linked."}</DialogDescription>
        </DialogHeader>
        {assessmentId != null && verdict !== "resolved" && (
          <div className="flex gap-2 rounded-sm border border-[hsl(28_85%_45%)] bg-[hsl(28_85%_52%/0.08)] px-3 py-2 text-[13px]" data-testid="warning-override">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[hsl(28_85%_40%)]" />
            <span>The AI did not suggest this risk is resolved{verdict ? ` (it said: ${verdictLabel[verdict]})` : ""}. Please explain why you are closing it anyway.</span>
          </div>
        )}
        {assessmentId == null && (
          <div className="flex gap-2 rounded-sm border border-[hsl(28_85%_45%)] bg-[hsl(28_85%_52%/0.08)] px-3 py-2 text-[13px]" data-testid="warning-no-evidence">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[hsl(28_85%_40%)]" />
            <span>No new evidence has been checked for this risk. Please explain why it is safe to close.</span>
          </div>
        )}
        <div className="space-y-3">
          <label className="block"><span className={labelCls}>Your name (approver)</span><input data-testid="input-approver" value={name} onChange={(e) => setName(e.target.value)} className={cn(inputCls, "mt-1")} /></label>
          <label className="block"><span className={cn(labelCls, "flex justify-between")}><span>Reason for closing</span><span className={cn("font-normal", note.trim().length < 10 ? "text-destructive" : "text-muted-foreground")}>{note.trim().length < 10 ? `${10 - note.trim().length} more characters needed` : "OK"}</span></span>
            <textarea data-testid="input-justification" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={cn(inputCls, "mt-1 h-auto py-1.5")} /></label>
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" data-testid="checkbox-approve-closure" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 size-4 accent-[hsl(var(--primary))]" />
            I approve closing this risk based on this evidence
          </label>
          <ErrLine msg={err} testId="text-close-error" />
          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={() => onOpenChange(false)} disabled={change.isPending} data-testid="button-cancel-close">Cancel</button>
            <button className={btnPrimary} onClick={submit} disabled={change.isPending || !valid} data-testid="button-confirm-close">{change.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}Close risk</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function latestReassessment(risk: RiskDetail) {
  return [...risk.assessments].filter((a) => a.kind === "reassessment").sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0] ?? null;
}

type StepState = "done" | "current" | "todo";

/** Where this risk stands in the evidence → AI recommendation → human decision → closure path. Derived only from recorded data. */
export function ClosureProgress({ risk }: { risk: RiskDetail }) {
  const latest = latestReassessment(risk);
  const req = risk.reassessmentRequests[0];
  const closed = risk.status === "closed";
  const hasEvidence = risk.reassessmentRequests.length > 0 || latest != null;
  const steps: { t: string; d: React.ReactNode; s: StepState }[] = [
    { t: "Add new evidence", d: hasEvidence ? (req?.evidenceDocumentTitle ?? latest?.evidenceDocumentTitle ?? "Evidence added") : "Add proof that the fix is in place.", s: hasEvidence ? "done" : "current" },
    {
      t: "AI checks the evidence",
      d: req?.status === "pending" ? "Checking…" : req?.status === "failed" && !latest ? "Last attempt failed. Nothing was changed." : latest ? <>Suggests <b>{verdictLabel[latest.verdict]}</b> · <Link href={`/risks/${risk.id}/reassessments/${latest.id}`} className="text-primary underline underline-offset-4" data-testid="link-progress-reassessment">see check #{latest.id}</Link></> : "A suggestion only. It never changes the status.",
      s: req?.status === "pending" ? "current" : latest ? "done" : hasEvidence ? "current" : "todo",
    },
    {
      t: "You review the suggestion",
      d: latest?.decision ? `${latest.decision === "accepted" ? "Accepted" : "Rejected"} by ${latest.decidedBy ?? "unknown"}` : latest ? <Link href={`/risks/${risk.id}/reassessments/${latest.id}`} className="font-medium text-primary underline underline-offset-4" data-testid="link-progress-review">Waiting for your decision</Link> : "A named person accepts or rejects it.",
      s: latest?.decision ? "done" : latest ? "current" : "todo",
    },
    { t: "Close with approval", d: closed ? "Closed with a written reason." : "Needs a named approver and a written reason.", s: closed ? "done" : latest?.decision ? "current" : "todo" },
  ];
  return (
    <Panel title="Where this risk stands" subtitle="Steps to close it safely">
      <ol className="space-y-0" data-testid="list-closure-progress">
        {steps.map((st, i) => (
          <li key={st.t} className="relative flex gap-3 pb-3.5 last:pb-0" data-testid={`step-closure-${i + 1}`} data-state={st.s}>
            {i < steps.length - 1 && <span className={cn("absolute left-[11px] top-6 bottom-0 w-px", st.s === "done" ? "bg-accent/50" : "bg-border")} />}
            <span className={cn("relative grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold",
              st.s === "done" ? "border-accent bg-accent text-accent-foreground" : st.s === "current" ? "border-accent bg-card text-accent ring-2 ring-accent/20" : "border-border bg-card text-muted-foreground")}>
              {st.s === "done" ? <Check className="size-3.5" /> : i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <div className={cn("text-[13.5px] font-medium", st.s === "todo" && "text-muted-foreground")}>{st.t}{st.s === "current" && <span className="ml-1.5 rounded-[4px] bg-primary/10 px-1.5 py-[1px] text-[11px] font-semibold text-primary">Next</span>}</div>
              <div className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{st.d}</div>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export function StatusControl({ risk }: { risk: RiskDetail }) {
  const [target, setTarget] = useState<RiskStatus | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const change = useChangeRiskStatus();
  const refresh = useRefreshRisk(risk.id);
  const latest = latestReassessment(risk);
  const opts = (Object.values(RiskStatusEnum) as RiskStatus[]).filter((s) => s !== risk.status);

  const choose = (s: RiskStatus) => { setErr(null); if (s === "closed") { setTarget(null); setClosing(true); } else setTarget(s); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    if (!name.trim()) return setErr("Enter your name so the change is recorded against it.");
    change.mutate({ id: risk.id, data: { status: target, changedBy: name.trim(), note: note.trim() || null } }, {
      onSuccess: () => { refresh(); setTarget(null); setNote(""); setErr(null); },
      onError: (er) => setErr(apiErrorMessage(er)),
    });
  };

  return (
    <Panel title="Status" subtitle="Status only changes when a person records it.">
      <div className="flex items-center gap-2 text-[13px]"><span className="text-muted-foreground">Current status:</span><StatusChip status={risk.status} testId="status-risk-panel" /></div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {opts.map((s) => (
          <button key={s} onClick={() => choose(s)} data-testid={`button-status-${s}`} className={cn(btnGhost, "h-8 text-[13px]", target === s && "border-primary")}>
            {s === "closed" ? <><ShieldCheck className="size-3.5" aria-hidden />Close risk…</> : <>Mark as {riskStatusLabel[s].toLowerCase()}</>}
          </button>
        ))}
      </div>
      {target && (
        <form onSubmit={submit} className="mt-3 space-y-2 rounded-md border border-border bg-muted/40 p-3">
          <div className="text-[12.5px]">Change status to <b>{riskStatusLabel[target]}</b></div>
          <input data-testid="input-status-changed-by" aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={inputCls} />
          <input data-testid="input-status-note" aria-label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={inputCls} />
          <ErrLine msg={err} testId="text-status-error" />
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setTarget(null)} disabled={change.isPending}>Cancel</button>
            <button type="submit" className={btnPrimary} disabled={change.isPending} data-testid="button-confirm-status">{change.isPending && <Loader2 className="size-3.5 animate-spin" />}Record change</button>
          </div>
        </form>
      )}
      {risk.status !== "closed" && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-[12.5px] leading-relaxed" data-testid="text-closure-link">
          {latest
            ? <>Closing will be linked to check <Link href={`/risks/${risk.id}/reassessments/${latest.id}`} className="font-medium text-primary underline underline-offset-4">#{latest.id}</Link>. AI suggestion: <b>{verdictLabel[latest.verdict]}</b>{latest.decision ? `. ${latest.decision === "accepted" ? "Accepted" : "Rejected"} by ${latest.decidedBy ?? "unknown"}.` : ". No one has reviewed it yet."}</>
            : "No evidence has been checked yet. Closing now would not be linked to any check."}
        </div>
      )}
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">Closing needs your name, a written reason and an approval tick{latest ? `, and is linked to the latest check (#${latest.id})` : ""}.</p>
      <CloseRiskDialog risk={risk} open={closing} onOpenChange={setClosing} assessmentId={latest?.id ?? null} verdict={latest?.verdict ?? null} />
    </Panel>
  );
}

export function StatusHistory({ changes, riskId, compact }: { changes: RiskStatusChange[]; riskId: number; compact?: boolean }) {
  return (
    <Panel title="Status history">
      {!changes.length ? <p className="text-[13px] text-muted-foreground" data-testid="empty-status-history">No status changes yet. The risk still has its original status.</p> : (
        <ol className="space-y-3">
          {changes.map((c) => (
            <li key={c.id} className={cn("border-l-2 border-primary pl-3", compact && "text-[12.5px]")} data-testid={`item-status-change-${c.id}`}>
              <div className="flex flex-wrap items-center gap-1.5"><StatusChip status={c.fromStatus} /><ArrowRight className="size-3 text-muted-foreground" /><StatusChip status={c.toStatus} /></div>
              <div className="mt-1 text-[12px] text-muted-foreground">By <span className="font-medium text-foreground">{c.changedBy}</span> · {stamp(c.createdAt)}</div>
              {c.note && <p className="mt-0.5 text-[13px] leading-relaxed">{c.note}</p>}
              {c.assessmentId != null && <Link href={`/risks/${riskId}/reassessments/${c.assessmentId}`} className="text-[12px] font-medium text-primary underline underline-offset-4" data-testid={`link-status-assessment-${c.id}`}>Linked check #{c.assessmentId}</Link>}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

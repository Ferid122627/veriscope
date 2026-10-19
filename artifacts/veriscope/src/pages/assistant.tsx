import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "wouter";
import { MessagesSquare, Send, Loader2, Trash2, FileText, ShieldAlert, BookCheck, Ban, Scale, Building2 } from "lucide-react";
import { useAskAssistant } from "@workspace/api-client-react";
import type { AssistantReply, AssistantSource, AuthUser } from "@workspace/api-client-react";
import { PageHeader, Chip, ErrorState, btnPrimary, btnGhost, riskCode } from "@/components/kit";
import { cn } from "@/lib/utils";

const MAX_CHARS = 4000;
// The API accepts at most 20 messages; older turns are not needed for context.
const MAX_SENT = 20;

type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; topic: AssistantReply["topic"]; refused: boolean; sources: AssistantSource[] };

const SUGGESTIONS = [
  "Which risks should we fix first?",
  "Summarise the risks in our most recent document.",
  "What does Azerbaijani law require when a supplier processes personal data?",
  "What should a good termination clause include?",
];

const topicChip: Record<AssistantReply["topic"], { label: string; icon: typeof Building2; cls: string }> = {
  company: { label: "About your company", icon: Building2, cls: "border-primary/30 text-primary" },
  legal: { label: "Legal question", icon: Scale, cls: "border-accent/40 text-accent" },
  off_topic: { label: "Outside my topics", icon: Ban, cls: "border-border text-muted-foreground" },
};

function sourceLink(s: AssistantSource) {
  if (s.kind === "document") return { href: `/documents/${s.id}`, icon: FileText, label: s.title };
  if (s.kind === "risk") return { href: `/risks/${s.id}`, icon: ShieldAlert, label: `${riskCode(s.id ?? 0)} · ${s.title}` };
  return { href: "/playbook", icon: BookCheck, label: `Company rules · ${s.title}` };
}

function useStoredTurns(key: string) {
  const [turns, setTurns] = useState<Turn[]>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as Turn[]) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(turns)); } catch { /* storage full or blocked: keep in memory only */ }
  }, [key, turns]);
  return [turns, setTurns] as const;
}

export default function Assistant({ user }: { user: AuthUser }) {
  const [turns, setTurns] = useStoredTurns(`veriscope-assistant-${user.id}`);
  const [draft, setDraft] = useState("");
  const ask = useAskAssistant();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns.length, ask.isPending, ask.isError]);

  const send = (text: string, history: Turn[] = turns) => {
    const q = text.trim();
    if (!q || q.length > MAX_CHARS || ask.isPending) return;
    const next: Turn[] = [...history, { role: "user", content: q }];
    setTurns(next);
    setDraft("");
    ask.mutate(
      { data: { messages: next.slice(-MAX_SENT).map((t) => ({ role: t.role, content: t.content })) } },
      {
        onSuccess: (r) => setTurns((cur) => [...cur, { role: "assistant", content: r.answer, topic: r.topic, refused: r.refused, sources: r.sources }]),
      },
    );
  };

  // After an error, the unanswered question is the last turn: send it again.
  const retry = () => {
    const last = turns[turns.length - 1];
    if (last?.role === "user") send(last.content, turns.slice(0, -1));
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  };

  const clear = () => { setTurns([]); ask.reset(); inputRef.current?.focus(); };
  const over = draft.length > MAX_CHARS;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Assistant"
        title="Ask about your company"
        description="Ask about your documents and the risks Veriscope found, or ask a legal question. Other topics are not answered. You can write in Azerbaijani, English or Russian."
      >
        {turns.length > 0 && (
          <button onClick={clear} disabled={ask.isPending} className={btnGhost} data-testid="button-clear-chat">
            <Trash2 className="size-4" aria-hidden />New conversation
          </button>
        )}
      </PageHeader>

      <section className="flex min-h-[60dvh] flex-col rounded-lg border border-card-border bg-card shadow-sm" aria-label="Conversation">
        <div className="flex-1 space-y-5 overflow-y-auto p-4 md:p-6" aria-live="polite" data-testid="list-chat">
          {turns.length === 0 && (
            <div className="mx-auto flex max-w-xl flex-col items-center py-8 text-center" data-testid="state-chat-empty">
              <div className="mb-4 grid size-12 place-items-center rounded-full bg-accent/10 text-accent"><MessagesSquare className="size-5" aria-hidden /></div>
              <div className="text-base font-semibold">What would you like to know?</div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Answers are based on the documents, risks{user.role === "company" ? " and company rules" : ""} saved in Veriscope, and on general legal knowledge.</p>
              <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s, i) => (
                  <button key={s} onClick={() => send(s)} data-testid={`button-suggestion-${i}`}
                    className="rounded-md border border-border bg-background px-3 py-2.5 text-left text-[13.5px] leading-snug text-foreground transition-colors hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="flex justify-end" data-testid={`chat-user-${i}`}>
                <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-primary px-3.5 py-2.5 text-[14px] leading-relaxed text-primary-foreground">{t.content}</div>
              </div>
            ) : (
              <AssistantBubble key={i} turn={t} index={i} />
            ),
          )}

          {ask.isPending && (
            <div className="flex items-center gap-2 text-[13.5px] text-muted-foreground" data-testid="status-thinking">
              <Loader2 className="size-4 animate-spin" aria-hidden />Looking through your data…
            </div>
          )}
          {ask.isError && !ask.isPending && turns[turns.length - 1]?.role === "user" && (
            <ErrorState error={ask.error} title="The question could not be answered" onRetry={retry} testId="error-chat" />
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(draft); }} className="border-t border-border p-3 md:p-4">
          <label htmlFor="chat-input" className="sr-only">Your question</label>
          <div className="flex items-end gap-2">
            <textarea
              id="chat-input"
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              rows={2}
              placeholder="Ask about a document, a risk, or a legal question…"
              data-testid="input-chat"
              className={cn("min-h-[44px] flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-[14px] leading-relaxed outline-none focus:border-ring focus:ring-2 focus:ring-ring/20", over && "border-destructive")}
            />
            <button type="submit" disabled={!draft.trim() || over || ask.isPending} className={cn(btnPrimary, "h-11")} data-testid="button-send">
              {ask.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              <span className="max-sm:sr-only">Send</span>
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
            <span>Not legal advice. Check important decisions with a qualified lawyer.</span>
            <span className={cn(over && "font-medium text-destructive")}>{draft.length > 3000 ? `${draft.length.toLocaleString("en-US")} / ${MAX_CHARS.toLocaleString("en-US")}` : "Enter to send · Shift+Enter for a new line"}</span>
          </div>
        </form>
      </section>
    </div>
  );
}

function AssistantBubble({ turn, index }: { turn: Extract<Turn, { role: "assistant" }>; index: number }) {
  const chip = topicChip[turn.topic];
  return (
    <div className="flex justify-start" data-testid={`chat-assistant-${index}`}>
      <div className={cn("max-w-[85%] rounded-lg rounded-bl-sm border px-3.5 py-3", turn.refused ? "border-dashed border-border bg-muted/40" : "border-border bg-background")}>
        <Chip className={cn("mb-2", chip.cls)} testId={`chip-topic-${index}`}><chip.icon className="size-3" aria-hidden />{chip.label}</Chip>
        <div className={cn("whitespace-pre-wrap break-words text-[14px] leading-relaxed", turn.refused ? "text-muted-foreground" : "text-foreground")}>{turn.content}</div>
        {turn.sources.length > 0 && (
          <div className="mt-3 border-t border-border pt-2.5">
            <div className="text-[12px] font-medium text-muted-foreground">Based on</div>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {turn.sources.map((s) => {
                const l = sourceLink(s);
                return (
                  <li key={`${s.kind}-${s.id}`}>
                    <Link href={l.href} data-testid={`link-source-${s.kind}-${s.id ?? "rules"}`}
                      className="inline-flex max-w-[22rem] items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[12.5px] text-foreground hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
                      <l.icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /><span className="truncate">{l.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

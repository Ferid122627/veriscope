import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Check, AlertTriangle } from "lucide-react";
import { getDocumentReport } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/components/kit";
import { cn } from "@/lib/utils";

type State = "idle" | "loading" | "done" | "error";

const label: Record<State, string> = {
  idle: "PDF",
  loading: "Preparing",
  done: "Saved",
  error: "Failed",
};

/** Downloads the document's PDF risk report, with an animated progress state. */
export function ReportDownloadButton({ documentId, title }: { documentId: number; title: string }) {
  const [state, setState] = useState<State>("idle");
  const { toast } = useToast();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const reset = (ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), ms);
  };

  const download = async () => {
    if (state === "loading") return;
    setState("loading");
    try {
      const blob = await getDocumentReport(documentId, { responseType: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `veriscope-report-${title.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState("done");
      reset(2200);
    } catch (e) {
      setState("error");
      toast({ variant: "destructive", title: "The report could not be created", description: apiErrorMessage(e) });
      reset(2500);
    }
  };

  return (
    <motion.button
      type="button"
      onClick={download}
      disabled={state === "loading"}
      whileTap={{ scale: 0.92 }}
      layout
      transition={{ layout: { type: "spring", stiffness: 500, damping: 32 } }}
      aria-label="Download PDF report"
      title="Download PDF report"
      data-testid="button-download-report"
      className={cn(
        "relative inline-flex h-7 items-center gap-1.5 overflow-hidden rounded-md border px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
        state === "done" ? "border-[hsl(150_35%_35%/0.45)] bg-[hsl(150_35%_35%/0.08)] text-[hsl(150_40%_26%)]"
          : state === "error" ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10",
      )}
    >
      {state === "loading" && (
        <motion.span
          className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-primary/20 to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "250%" }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        />
      )}
      <span className="relative grid size-3.5 place-items-center">
        <AnimatePresence mode="wait" initial={false}>
          {state === "done" ? (
            <motion.span key="ok" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 600, damping: 18 }}>
              <Check className="size-3.5" strokeWidth={2.6} aria-hidden />
            </motion.span>
          ) : state === "error" ? (
            <motion.span key="err" initial={{ scale: 0 }} animate={{ scale: 1, x: [0, -2, 2, -2, 0] }} exit={{ scale: 0 }} transition={{ duration: 0.35 }}>
              <AlertTriangle className="size-3.5" aria-hidden />
            </motion.span>
          ) : (
            <motion.span
              key="dl"
              initial={{ y: -8, opacity: 0 }}
              animate={state === "loading" ? { y: [0, 3, 0], opacity: 1 } : { y: 0, opacity: 1 }}
              exit={{ y: 10, opacity: 0 }}
              transition={state === "loading" ? { duration: 0.7, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
            >
              <Download className="size-3.5" aria-hidden />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={state} className="relative" initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.18 }} aria-live="polite">
          {label[state]}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

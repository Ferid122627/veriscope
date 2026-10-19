import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutGrid, FileText, ShieldAlert, ShieldCheck } from "lucide-react";
import { useGetSystemStatus, useHealthCheck } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Overview", icon: LayoutGrid, testId: "link-nav-overview" },
  { href: "/documents", label: "Documents", icon: FileText, testId: "link-nav-documents" },
  { href: "/risks", label: "Risks to fix", icon: ShieldAlert, testId: "link-nav-risk-register" },
];

export function Mark({ className }: { className?: string }) {
  return (
    <span className={cn("grid place-items-center rounded-md bg-sidebar-primary/15 text-sidebar-primary", className)} aria-hidden>
      <ShieldCheck className="size-[60%]" strokeWidth={2.2} />
    </span>
  );
}

function SystemStatus() {
  const health = useHealthCheck({ query: { refetchInterval: 30000, queryKey: ["/api/healthz"] } });
  const sys = useGetSystemStatus({ query: { refetchInterval: 30000, queryKey: ["/api/system/status"] } });
  const apiOk = health.data?.status === "ok" || sys.data?.api === "ok";
  const rows = [
    { l: "App server", ok: health.isError ? false : apiOk, pending: health.isLoading, bad: "Offline" },
    { l: "Database", ok: sys.data?.database === "ok", pending: sys.isLoading, bad: "Offline" },
    { l: "AI checking", ok: sys.data?.aiProvider === "configured", pending: sys.isLoading, warn: true, bad: "Not set up" },
  ];
  return (
    <ul className="space-y-1.5" data-testid="status-sidebar">
      {rows.map((r) => (
        <li key={r.l} className="flex items-center justify-between gap-2 text-[12px] text-sidebar-foreground/75">
          <span>{r.l}</span>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", r.pending ? "bg-sidebar-foreground/30 animate-pulse" : r.ok ? "bg-sidebar-primary" : r.warn ? "bg-[hsl(28_85%_52%)]" : "bg-destructive")} aria-hidden />
            <span className="text-sidebar-foreground/60">{r.pending ? "Checking" : r.ok ? "OK" : r.bad}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const active = (h: string) => (h === "/" ? loc === "/" : loc.startsWith(h));
  return (
    <div className="flex min-h-[100dvh] flex-col md:flex-row">
      <aside className="sticky top-0 z-20 flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:h-[100dvh] md:w-56">
        <Link href="/" data-testid="link-home" className="flex items-center gap-2.5 px-4 pb-2 pt-4 md:px-5 md:pb-6 md:pt-6">
          <Mark className="size-8" />
          <span className="text-[15px] font-semibold tracking-[0.14em] text-white">VERISCOPE</span>
        </Link>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {nav.map((n) => {
            const on = active(n.href);
            return (
              <Link key={n.href} href={n.href} data-testid={n.testId} aria-current={on ? "page" : undefined}
                className={cn("relative flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-sidebar-ring",
                  on ? "bg-sidebar-accent font-medium text-white" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white")}>
                {on && <span className="absolute left-0 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-r bg-sidebar-primary md:block" aria-hidden />}
                <n.icon className={cn("size-4", on && "text-sidebar-primary")} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden border-t border-sidebar-border px-5 py-4 md:block">
          <div className="mb-2 text-[12px] font-medium text-sidebar-foreground/90">System status</div>
          <SystemStatus />
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1240px] px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}

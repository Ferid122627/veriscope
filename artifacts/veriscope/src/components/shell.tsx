import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutGrid, FileText, ShieldAlert } from "lucide-react";
import { useGetSystemStatus, useHealthCheck } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Overview", icon: LayoutGrid, testId: "link-nav-overview" },
  { href: "/documents", label: "Documents", icon: FileText, testId: "link-nav-documents" },
  { href: "/risks", label: "Risks to fix", icon: ShieldAlert, testId: "link-nav-risk-register" },
];

/** Veriscope logo: a lens with a check mark. The ring follows the text colour, the check uses the accent colour. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={cn("text-white", className)} aria-hidden>
      <circle cx="28" cy="28" r="18" stroke="currentColor" strokeWidth="6" />
      <path d="M19.5 28.5l6.5 6.5 11.5-13" className="stroke-sidebar-primary" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 42l14 14" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    </svg>
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
    <ul className="flex items-center gap-4" data-testid="status-sidebar" aria-label="System status">
      {rows.map((r) => (
        <li key={r.l} className="flex items-center gap-1.5 text-[12px] text-sidebar-foreground/75" title={`${r.l}: ${r.pending ? "Checking" : r.ok ? "OK" : r.bad}`}>
          <span className={cn("size-1.5 rounded-full", r.pending ? "bg-sidebar-foreground/30 animate-pulse" : r.ok ? "bg-sidebar-primary" : r.warn ? "bg-[hsl(28_85%_52%)]" : "bg-destructive")} aria-hidden />
          <span>{r.l}</span>
          <span className="text-sidebar-foreground/60">{r.pending ? "Checking" : r.ok ? "OK" : r.bad}</span>
        </li>
      ))}
    </ul>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const active = (h: string) => (h === "/" ? loc === "/" : loc.startsWith(h));
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-20 bg-sidebar text-sidebar-foreground shadow-sm">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5 md:px-8">
          <Link href="/" data-testid="link-home" className="flex items-center gap-2.5 py-1">
            <Mark className="size-9" />
            <span className="text-[15px] font-semibold tracking-[0.14em] text-white">VERISCOPE</span>
          </Link>
          <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto px-1 max-md:order-last max-md:w-full">
            {nav.map((n) => {
              const on = active(n.href);
              return (
                <Link key={n.href} href={n.href} data-testid={n.testId} aria-current={on ? "page" : undefined}
                  className={cn("relative flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-sidebar-ring",
                    on ? "bg-sidebar-accent font-medium text-white" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white")}>
                  {on && <span className="absolute bottom-0 left-1/2 hidden h-[3px] w-5 -translate-x-1/2 rounded-t bg-sidebar-primary md:block" aria-hidden />}
                  <n.icon className={cn("size-4", on && "text-sidebar-primary")} />
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto hidden lg:block">
            <SystemStatus />
          </div>
        </div>
      </header>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1240px] px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}

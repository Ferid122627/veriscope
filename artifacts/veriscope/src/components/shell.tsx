import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutGrid, FileText, ShieldAlert } from "lucide-react";
import { useGetSystemStatus, useHealthCheck } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Overview", icon: LayoutGrid, k: "01" },
  { href: "/documents", label: "Documents", icon: FileText, k: "02" },
  { href: "/risks", label: "Risk register", icon: ShieldAlert, k: "03" },
];

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 2v6M16 24v6M2 16h6M24 16h6" stroke="currentColor" strokeWidth="2" />
      <path d="M11 16.5l3.2 3.2L21 13" fill="none" stroke="hsl(68 85% 62%)" strokeWidth="2.4" strokeLinecap="square" />
    </svg>
  );
}

function StatusDots() {
  const health = useHealthCheck({ query: { refetchInterval: 30000, queryKey: ["/api/healthz"] } });
  const sys = useGetSystemStatus({ query: { refetchInterval: 30000, queryKey: ["/api/system/status"] } });
  const apiOk = health.data?.status === "ok" || sys.data?.api === "ok";
  const rows = [
    { l: "API", ok: health.isError ? false : apiOk, pending: health.isLoading },
    { l: "Database", ok: sys.data?.database === "ok", pending: sys.isLoading },
    { l: "AI provider", ok: sys.data?.aiProvider === "configured", pending: sys.isLoading, warn: true },
  ];
  return (
    <div className="space-y-1.5" data-testid="status-sidebar">
      {rows.map((r) => (
        <div key={r.l} className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-wider text-sidebar-foreground/60">
          <span>{r.l}</span>
          <span className={cn("size-1.5 rounded-full", r.pending ? "bg-sidebar-foreground/30 animate-pulse" : r.ok ? "bg-sidebar-primary" : r.warn ? "bg-[hsl(28_85%_52%)]" : "bg-destructive")} />
        </div>
      ))}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const active = (h: string) => (h === "/" ? loc === "/" : loc.startsWith(h));
  return (
    <div className="flex min-h-[100dvh] flex-col md:flex-row">
      <aside className="sticky top-0 z-20 flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:h-[100dvh] md:w-60">
        <Link href="/" data-testid="link-home" className="flex items-center gap-2.5 px-5 py-4 md:py-6">
          <Mark className="size-7 text-sidebar-accent-foreground" />
          <div>
            <div className="font-serif text-xl leading-none tracking-tight text-sidebar-accent-foreground">Veriscope</div>
            <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.2em] text-sidebar-foreground/50">Evidence-bound risk</div>
          </div>
        </Link>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} data-testid={`link-nav-${n.label.toLowerCase().replace(/\s/g, "-")}`}
              className={cn("group relative flex items-center gap-3 whitespace-nowrap rounded-sm px-3 py-2 text-[13px] transition-colors",
                active(n.href) ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground")}>
              {active(n.href) && <span className="absolute left-0 top-1/2 hidden h-4 w-[2px] -translate-y-1/2 bg-sidebar-primary md:block" />}
              <n.icon className="size-4" />
              <span className="flex-1">{n.label}</span>
              <span className="hidden font-mono text-[10px] text-sidebar-foreground/35 md:inline">{n.k}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-sidebar-border px-5 py-4 md:block">
          <div className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/40">System</div>
          <StatusDots />
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}

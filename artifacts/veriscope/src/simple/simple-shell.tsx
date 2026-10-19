import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { FileText, MessagesSquare } from "lucide-react";
import type { AuthUser } from "@workspace/api-client-react";
import { Mark, UserMenu } from "@/components/shell";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "My documents", icon: FileText, testId: "link-nav-home", match: (l: string) => l === "/" || l.startsWith("/documents") || l.startsWith("/risks") },
  { href: "/assistant", label: "Ask a question", icon: MessagesSquare, testId: "link-nav-assistant", match: (l: string) => l.startsWith("/assistant") },
];

/** Shell for normal users: two destinations only, no system internals. */
export function SimpleShell({ children, user }: { children: ReactNode; user: AuthUser }) {
  const [loc] = useLocation();
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-20 bg-sidebar text-sidebar-foreground shadow-sm">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5 md:px-6">
          <Link href="/" data-testid="link-home" className="flex items-center gap-2.5 py-1">
            <Mark className="size-8" />
            <span className="text-[15px] font-semibold tracking-[0.14em] text-white">VERISCOPE</span>
          </Link>
          <nav aria-label="Main" className="flex gap-1 max-sm:order-last max-sm:w-full">
            {nav.map((n) => {
              const on = n.match(loc);
              return (
                <Link key={n.href} href={n.href} data-testid={n.testId} aria-current={on ? "page" : undefined}
                  className={cn("flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-[14.5px] transition-colors focus-visible:outline-2 focus-visible:outline-sidebar-ring",
                    on ? "bg-sidebar-accent font-medium text-white" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white")}>
                  <n.icon className={cn("size-4", on && "text-sidebar-primary")} aria-hidden />
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto"><UserMenu user={user} /></div>
        </div>
      </header>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[960px] px-4 py-6 md:px-6 md:py-10">{children}</div>
      </main>
    </div>
  );
}

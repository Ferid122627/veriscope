import { Link } from "wouter";
import { btnPrimary } from "@/components/kit";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-start justify-center">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Error 404 · no source</div>
      <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">This page has no <span className="mark-hl px-1">citation</span>.</h1>
      <p className="mt-3 max-w-md text-muted-foreground">We could not find anything at this address. Nothing here can be verified.</p>
      <Link href="/" className={`${btnPrimary} mt-6`} data-testid="link-home-404">Return to overview</Link>
    </div>
  );
}

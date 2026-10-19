import { Link } from "wouter";
import { btnPrimary } from "@/components/kit";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-start justify-center">
      <div className="text-[13px] font-medium text-muted-foreground">Page not found</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">We could not find this page.</h1>
      <p className="mt-3 max-w-md text-muted-foreground">The link may be out of date, or the page may have been removed.</p>
      <Link href="/" className={`${btnPrimary} mt-6`} data-testid="link-home-404">Go to overview</Link>
    </div>
  );
}

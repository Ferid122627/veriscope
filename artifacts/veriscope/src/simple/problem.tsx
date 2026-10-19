import { Link, useParams } from "wouter";
import { FileText } from "lucide-react";
import { useGetRisk, getGetRiskQueryKey } from "@workspace/api-client-react";
import { Skel, ErrorState } from "@/components/kit";
import { ProblemCard } from "./problem-card";
import { BackHome } from "./document";

/** One problem on its own page (the assistant links here). */
export default function SimpleProblem() {
  const { id: raw } = useParams<{ id: string }>();
  const id = Number(raw);
  const valid = Number.isInteger(id) && id > 0;
  const q = useGetRisk(id, { query: { enabled: valid, queryKey: getGetRiskQueryKey(id) } });

  if (!valid || (q.isError && (q.error as { status?: number })?.status === 404)) {
    return <div className="space-y-4"><BackHome /><p className="text-[15px]">This problem no longer exists.</p></div>;
  }
  if (q.isError) return <div className="space-y-4"><BackHome /><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  if (!q.data) return <div className="space-y-4"><BackHome /><Skel className="h-60 rounded-xl" /></div>;
  const r = q.data;
  return (
    <div className="space-y-4">
      <BackHome />
      <div><Link href={`/documents/${r.documentId}`} className="inline-flex items-center gap-2 text-[14px] font-medium text-primary hover:underline underline-offset-4" data-testid="link-simple-problem-document">
        <FileText className="size-4" aria-hidden />From: {r.documentTitle}
      </Link></div>
      <ProblemCard risk={r} defaultOpenQuotes />
    </div>
  );
}

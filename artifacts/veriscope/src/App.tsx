import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Shell } from '@/components/shell';
import NotFound from '@/pages/not-found';
import Overview from '@/pages/overview';
import Documents from '@/pages/documents';
import DocumentDetail from '@/pages/document-detail';
import Risks from '@/pages/risks';
import RiskDetail from '@/pages/risk-detail';
import Reassessment from '@/pages/reassessment';
import Playbook from '@/pages/playbook';
import Login from '@/pages/login';
import Assistant from '@/pages/assistant';
import { Loader2 } from 'lucide-react';
import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import type { AuthUser } from '@workspace/api-client-react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function Router({ user }: { user: AuthUser }) {
  return (
    <Shell user={user}>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Overview} />
          <Route path="/documents" component={Documents} />
          <Route path="/documents/:id" component={DocumentDetail} />
          <Route path="/risks" component={Risks} />
          <Route path="/risks/:id" component={RiskDetail} />
          <Route path="/risks/:id/reassessments/:assessmentId" component={Reassessment} />
          {user.role === 'company' && <Route path="/playbook" component={Playbook} />}
          <Route path="/assistant">{() => <Assistant user={user} />}</Route>
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function AuthGate() {
  const me = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false, staleTime: Infinity } });
  if (me.isLoading) return <div className="grid min-h-[100dvh] place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" /></div>;
  const user = me.data?.user;
  if (!user) return <Login />;
  return <Router user={user} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthGate />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { Mark } from "@/components/shell";
import { apiErrorMessage, btnPrimary } from "@/components/kit";

const input = "w-full rounded-md border border-input bg-background px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function Login() {
  const qc = useQueryClient();
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (login.isPending) return;
    setErr(null);
    login.mutate({ data: { username, password } }, {
      onSuccess: (state) => qc.setQueryData(getGetMeQueryKey(), state),
      onError: (er) => setErr(apiErrorMessage(er)),
    });
  };

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5 rounded-lg bg-sidebar px-4 py-3">
          <Mark className="size-9" />
          <span className="text-[15px] font-semibold tracking-[0.14em] text-white">VERISCOPE</span>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm" data-testid="form-login">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">Use your Veriscope account to continue.</p>
          </div>
          <label className="block text-[13px] font-medium">Username
            <input className={`${input} mt-1`} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required data-testid="input-username" />
          </label>
          <label className="block text-[13px] font-medium">Password
            <input className={`${input} mt-1`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required data-testid="input-password" />
          </label>
          {err && <div role="alert" data-testid="text-login-error" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{err}</div>}
          <button type="submit" className={`${btnPrimary} w-full`} disabled={login.isPending} data-testid="button-login">
            {login.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Sign in
          </button>
        </form>
        <div className="mt-4 rounded-md border border-dashed border-border px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground" data-testid="text-demo-accounts">
          <div className="mb-1 font-medium text-foreground">Demo accounts</div>
          <div><b>user</b> / user1234 — normal user, no company rules</div>
          <div><b>company</b> / company1234 — company user, with company rules</div>
        </div>
      </div>
    </div>
  );
}

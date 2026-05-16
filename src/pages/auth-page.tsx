import { KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { useAuth } from "../lib/auth";

export const AuthPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, isConfigured, signInWithPassword, completeNewPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [requiresNewPassword, setRequiresNewPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const redirectTo = useMemo(() => {
    const state = location.state as { from?: { pathname?: string } } | null;
    return state?.from?.pathname ?? "/tenders";
  }, [location.state]);

  if (status === "authenticated") {
    return <Navigate replace to={redirectTo} />;
  }

  const resetFeedback = () => {
    setMessage("");
    setError("");
  };

  const handleSignIn = async () => {
    resetFeedback();
    setSubmitting(true);

    try {
      const result = await signInWithPassword(email, password);

      if (result.status === "signed-in") {
        navigate(redirectTo, { replace: true });
        return;
      }

      setRequiresNewPassword(true);
      setMessage("This account needs a new password before sign-in can complete.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteNewPassword = async () => {
    resetFeedback();
    setSubmitting(true);

    try {
      await completeNewPassword(newPassword);
      navigate(redirectTo, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to set a new password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-blue-100/80 bg-gradient-to-br from-slate-950 via-blue-950 to-blue-700 p-8 text-white panel-shadow sm:p-10">
          <p className="text-xs uppercase tracking-[0.22em] text-blue-200/80">Alimex</p>
          <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-tight">
            Secure tender pricing for sales, sourcing, and approvals.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-blue-100/80">
            Sign in with your Cognito account to access the full Alimex pricing workflow and the right permissions for your team role.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
              <ShieldCheck className="h-5 w-5 text-blue-100" />
              <p className="mt-3 text-sm font-medium">Cognito secured</p>
              <p className="mt-2 text-sm text-blue-100/70">Email sign-in with protected API access.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
              <KeyRound className="h-5 w-5 text-blue-100" />
              <p className="mt-3 text-sm font-medium">Temporary passwords supported</p>
              <p className="mt-2 text-sm text-blue-100/70">First-time users can complete the required password reset here.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
              <LogIn className="h-5 w-5 text-blue-100" />
              <p className="mt-3 text-sm font-medium">Audit friendly</p>
              <p className="mt-2 text-sm text-blue-100/70">Signed-in identity flows into tender activity logs.</p>
            </div>
          </div>
        </div>

        <Card className="self-start">
          <CardHeader className="flex-col gap-4">
            <div>
              <CardTitle>{requiresNewPassword ? "Set New Password" : "Sign In"}</CardTitle>
              <CardDescription>
                {requiresNewPassword
                  ? "Complete your first sign-in by choosing a new permanent password."
                  : "Use your Cognito email and password to access the tender pricing workspace."}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isConfigured ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Auth is not configured in `amplify_outputs.json` yet. Redeploy or regenerate outputs after provisioning Cognito.
              </div>
            ) : null}

            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-slate-800">Email</label>
              <Input
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@alimex.com"
                type="email"
                value={email}
                disabled={requiresNewPassword}
              />
            </div>

            {!requiresNewPassword ? (
              <div className="grid gap-1.5">
                <label className="text-sm font-medium text-slate-800">Password</label>
                <Input
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  type="password"
                  value={password}
                />
              </div>
            ) : (
              <div className="grid gap-1.5">
                <label className="text-sm font-medium text-slate-800">New Password</label>
                <Input
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Choose a new password"
                  type="password"
                  value={newPassword}
                />
              </div>
            )}

            {message ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p> : null}
            {error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

            <div className="flex flex-wrap gap-3">
              {!requiresNewPassword ? (
                <Button className="min-w-32" disabled={submitting || !isConfigured} onClick={() => void handleSignIn()} type="button">
                  {submitting ? "Signing In..." : "Sign In"}
                </Button>
              ) : (
                <Button className="min-w-40" disabled={submitting || !isConfigured} onClick={() => void handleCompleteNewPassword()} type="button">
                  {submitting ? "Saving..." : "Set New Password"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

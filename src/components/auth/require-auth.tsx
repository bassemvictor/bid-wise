import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../../lib/auth";

export const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const { status, isConfigured } = useAuth();
  const location = useLocation();

  if (!isConfigured) {
    return <Navigate replace to="/auth" state={{ from: location }} />;
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md rounded-[1.6rem] border border-border bg-white p-8 text-center panel-shadow">
          <p className="text-xs uppercase tracking-[0.2em] text-blue-600">Alimex</p>
          <h1 className="mt-4 text-2xl font-semibold text-slate-900">Checking your session</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Preparing your tender pricing workspace.
          </p>
        </div>
      </div>
    );
  }

  if (status !== "authenticated") {
    return <Navigate replace to="/auth" state={{ from: location }} />;
  }

  return children;
};

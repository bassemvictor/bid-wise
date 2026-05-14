import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

type DialogProps = {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "md" | "lg";
};

export const Dialog = ({
  children,
  open,
  onClose,
  title,
  description,
  size = "md",
}: DialogProps) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8">
      <button aria-label="Close dialog overlay" className="absolute inset-0" onClick={onClose} type="button" />
      <div
        className={cn(
          "relative z-10 w-full rounded-[1.4rem] border border-border bg-white panel-shadow",
          size === "lg" ? "max-w-4xl" : "max-w-2xl",
        )}
      >
        <div className="border-b border-border px-6 py-5">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="max-h-[80vh] overflow-y-auto px-6 py-6">{children}</div>
      </div>
    </div>
  );
};

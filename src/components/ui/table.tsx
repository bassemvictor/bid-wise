import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export const Table = ({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) => (
  <div className="overflow-x-auto">
    <table className={cn("w-full min-w-[640px] border-separate border-spacing-0", className)} {...props} />
  </div>
);

export const TableHeader = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn("[&_tr]:border-b [&_tr]:border-border", className)} {...props} />
);

export const TableBody = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn(className)} {...props} />
);

export const TableRow = ({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("border-b border-border last:border-0", className)} {...props} />
);

export const TableHead = ({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    className={cn("px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground", className)}
    {...props}
  />
);

export const TableCell = ({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("px-4 py-4 text-sm text-slate-700", className)} {...props} />
);

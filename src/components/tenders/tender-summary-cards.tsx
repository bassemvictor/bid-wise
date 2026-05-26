import { CheckCircle2, Clock3, FileStack, LoaderCircle, TriangleAlert } from "lucide-react";

import { Card, CardContent, CardDescription, CardTitle } from "../ui/card";
import type { TenderListSummary } from "../../../shared/types";

const items = [
  { key: "total", label: "Total Tenders", icon: FileStack, tone: "bg-blue-50 text-blue-700" },
  { key: "inProgress", label: "In Progress", icon: LoaderCircle, tone: "bg-amber-50 text-amber-700" },
  { key: "pendingApproval", label: "Pending Approval", icon: Clock3, tone: "bg-orange-50 text-orange-700" },
  { key: "approved", label: "Approved", icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
  { key: "overdue", label: "Overdue", icon: TriangleAlert, tone: "bg-rose-50 text-rose-700" },
] as const;

export const TenderSummaryCards = ({ summary }: { summary: TenderListSummary }) => (
  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    {items.map((item) => {
      const Icon = item.icon;

      return (
        <Card key={item.key}>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <CardDescription className="text-xs font-medium uppercase tracking-[0.14em]">
                {item.label}
              </CardDescription>
              <CardTitle className="mt-1 text-2xl sm:text-[1.75rem]">{summary[item.key]}</CardTitle>
            </div>
            <div className={`shrink-0 rounded-2xl p-2.5 ${item.tone}`}>
              <Icon className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      );
    })}
  </section>
);

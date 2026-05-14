import { CheckCircle2, Clock3, FileStack, LoaderCircle, TriangleAlert } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import type { TenderListSummary } from "../../../shared/types";

const items = [
  { key: "total", label: "Total Tenders", icon: FileStack, tone: "bg-blue-50 text-blue-700" },
  { key: "inProgress", label: "In Progress", icon: LoaderCircle, tone: "bg-amber-50 text-amber-700" },
  { key: "pendingApproval", label: "Pending Approval", icon: Clock3, tone: "bg-orange-50 text-orange-700" },
  { key: "approved", label: "Approved", icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
  { key: "overdue", label: "Overdue", icon: TriangleAlert, tone: "bg-rose-50 text-rose-700" },
] as const;

export const TenderSummaryCards = ({ summary }: { summary: TenderListSummary }) => (
  <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
    {items.map((item) => {
      const Icon = item.icon;

      return (
        <Card key={item.key}>
          <CardHeader className="items-center">
            <div>
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="mt-2 text-3xl">{summary[item.key]}</CardTitle>
            </div>
            <div className={`rounded-2xl p-3 ${item.tone}`}>
              <Icon className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent />
        </Card>
      );
    })}
  </section>
);

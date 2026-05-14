import { ArrowUpRight, ClipboardList, FileBarChart2, Layers3, Package2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { api, isApiConfigured } from "../lib/api";

type DashboardSummary = {
  tenantId: string;
  tenderCount: number;
  scenarioCount: number;
  approvalCount: number;
  supplierCount: number;
};

const metricCards = [
  {
    label: "Active Tenders",
    key: "tenderCount",
    icon: ClipboardList,
    tone: "bg-blue-50 text-blue-700",
  },
  {
    label: "Price Scenarios",
    key: "scenarioCount",
    icon: Layers3,
    tone: "bg-slate-100 text-slate-700",
  },
  {
    label: "Pending Approvals",
    key: "approvalCount",
    icon: FileBarChart2,
    tone: "bg-amber-50 text-amber-700",
  },
  {
    label: "Suppliers",
    key: "supplierCount",
    icon: Package2,
    tone: "bg-emerald-50 text-emerald-700",
  },
] as const;

export const DashboardPage = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isApiConfigured) {
      return;
    }

    void api
      .get<DashboardSummary>("/dashboard/summary?tenantId=alimex-demo")
      .then(setSummary)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          const value = summary ? summary[metric.key] : "0";

          return (
            <Card key={metric.label}>
              <CardHeader className="items-center">
                <div>
                  <CardDescription>{metric.label}</CardDescription>
                  <CardTitle className="mt-2 text-3xl">{value}</CardTitle>
                </div>
                <div className={`rounded-2xl p-3 ${metric.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ArrowUpRight className="h-4 w-4 text-success" />
                  Operational metrics will populate from the API.
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Tender Pipeline</CardTitle>
              <CardDescription>Live funnel driven by the backend, with no UI-side seeded records.</CardDescription>
            </div>
            <Badge variant="default">Operational View</Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {[
                { label: "Intake Submitted", value: 24 },
                { label: "Configuration Ready", value: 52 },
                { label: "Costed", value: 68 },
                { label: "Approved", value: 82 },
              ].map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{item.label}</span>
                    <span className="text-muted-foreground">{item.value}% workflow readiness</span>
                  </div>
                  <Progress value={item.value} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Environment Readiness</CardTitle>
              <CardDescription>Quick checklist for the deployment foundation.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-medium">Frontend API client</p>
              <p className="mt-1 text-muted-foreground">
                {isApiConfigured ? "Configured from VITE_API_BASE_URL." : "Waiting for VITE_API_BASE_URL."}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-medium">Backend API surface</p>
              <p className="mt-1 text-muted-foreground">
                Lambda router includes tenders, pricing scenarios, and dev-only seed operations.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-medium">DynamoDB model</p>
              <p className="mt-1 text-muted-foreground">Single-table keys use `PK` and `SK` with tenant scoping.</p>
            </div>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Operational Queue</CardTitle>
            <CardDescription>The table is intentionally empty until backend data exists.</CardDescription>
          </div>
          <Badge variant="neutral">No UI Seed Data</Badge>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tender</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium text-slate-900">No records loaded</TableCell>
                <TableCell>Connect the API or run the dev seed endpoint.</TableCell>
                <TableCell>Backend only</TableCell>
                <TableCell>Awaiting data</TableCell>
                <TableCell>
                  <Badge variant="warning">Setup</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

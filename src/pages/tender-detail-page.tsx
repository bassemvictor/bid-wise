import { ClipboardCheck, PackageSearch, ScanSearch } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { RouteTabs } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { api, isApiConfigured } from "../lib/api";
import { getPageTitle, getTenderSectionTabs } from "../lib/route-metadata";
import type {
  CostBuildUp,
  MaterialSourceSelection,
  ProductConfiguration,
  RollCalculation,
  ScenarioAlternative,
  TenderRequest,
} from "../../shared/types";

type SectionPayloads = {
  overview: TenderRequest;
  "product-configuration": ProductConfiguration;
  "material-roll-calculation": RollCalculation;
  "material-sourcing": MaterialSourceSelection;
  "cost-build-up": CostBuildUp;
  alternatives: ScenarioAlternative;
  "pricing-approval": { approvalsOpen: number; status: string };
};

const detailCards = [
  {
    label: "Configuration",
    icon: PackageSearch,
    description: "Product and accessory configuration records",
  },
  {
    label: "Material Sourcing",
    icon: ScanSearch,
    description: "Supplier choice and sourcing readiness",
  },
  {
    label: "Approval Trail",
    icon: ClipboardCheck,
    description: "Pricing workflow sign-off stage",
  },
];

export const TenderDetailPage = () => {
  const params = useParams();
  const { pathname } = useLocation();
  const tenderId = params.tenderId ?? "";
  const pathSegments = pathname.split("/").filter(Boolean);
  const section = (pathSegments[2] ?? "overview") as keyof SectionPayloads;
  const [payload, setPayload] = useState<SectionPayloads[keyof SectionPayloads] | null>(null);
  const [error, setError] = useState("");
  const title = useMemo(
    () => getPageTitle(section === "overview" ? `/tenders/${tenderId}` : `/tenders/${tenderId}/${section}`),
    [section, tenderId],
  );

  useEffect(() => {
    if (!isApiConfigured || !tenderId) {
      return;
    }

    const basePath =
      section === "overview" ? `/tenders/${tenderId}?tenantId=alimex-demo` : `/tenders/${tenderId}/${section}?tenantId=alimex-demo`;

    void api
      .get<SectionPayloads[keyof SectionPayloads]>(basePath)
      .then(setPayload)
      .catch((reason: Error) => setError(reason.message));
  }, [section, tenderId]);

  return (
    <div className="space-y-6">
      <RouteTabs items={getTenderSectionTabs(tenderId || "TDR-1001")} />

      <section className="grid gap-4 md:grid-cols-3">
        {detailCards.map((card) => {
          const Icon = card.icon;

          return (
            <Card key={card.label}>
              <CardHeader>
                <div>
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="mt-2">{title}</CardTitle>
                </div>
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                  <Icon className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>Data loads from the matching tender sub-resource when the API is configured.</CardDescription>
            </div>
            <Badge variant="default">Tender {tenderId || "Pending"}</Badge>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl bg-slate-50 p-4">
              <pre className="overflow-x-auto whitespace-pre-wrap break-words text-sm text-slate-700">
                {payload ? JSON.stringify(payload, null, 2) : "No backend record loaded for this section yet."}
              </pre>
            </div>
            {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Actions</CardTitle>
              <CardDescription>Workspace actions available as the implementation expands.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {["Update section payload", "Compare alternatives", "Request approval"].map((item) => (
              <div key={item} className="rounded-2xl border border-border bg-white px-4 py-3 text-sm font-medium text-slate-700">
                {item}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Section Checklist</CardTitle>
            <CardDescription>Ready-made table styling for pricing workflows.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Step</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium text-slate-900">Data contract</TableCell>
                <TableCell>Shared TypeScript model exists for this stage.</TableCell>
                <TableCell>
                  <Badge variant="success">Ready</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-slate-900">Backend record</TableCell>
                <TableCell>Populate via API or dev-only seed endpoint.</TableCell>
                <TableCell>
                  <Badge variant="warning">Pending</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

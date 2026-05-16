import {
  Calculator,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  PackageSearch,
  ScanSearch,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { RouteTabs } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { api, ApiError, isApiConfigured } from "../lib/api";
import { getPageTitle, getTenderSectionTabs } from "../lib/route-metadata";
import type {
  CostBuildUp,
  MaterialSourceSelection,
  ProductConfiguration,
  RollCalculation,
  ScenarioAlternative,
  TenderActivity,
  TenderRequest,
} from "../../shared/types";

type SectionPayloads = {
  overview: TenderRequest;
  "material-sourcing": MaterialSourceSelection;
  "cost-build-up": CostBuildUp;
  alternatives: ScenarioAlternative;
  "pricing-approval": { approvalsOpen: number; status: string };
};

type TenderOverviewData = {
  tender: TenderRequest | null;
  productConfiguration: ProductConfiguration | null;
  rollCalculation: RollCalculation | null;
  materialSourcing: MaterialSourceSelection | null;
  costBuildUp: CostBuildUp | null;
  activities: TenderActivity[];
};

const formatNumber = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined || !Number.isFinite(value) ? "-" : value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const formatCurrency = (value: number | null | undefined, digits = 2, suffix = "EGP") =>
  value === null || value === undefined || !Number.isFinite(value) ? "-" : `${value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${suffix}`;

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const formatAuditValue = (value: string | number | boolean | null) => {
  if (typeof value === "number") {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 4,
    });
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (value === null || value === "") {
    return "Empty";
  }

  return String(value);
};

const formatStatusVariant = (status: string) => {
  if (["APPROVED", "WON"].includes(status)) {
    return "success" as const;
  }

  if (["PENDING_APPROVAL", "PRICE_READY", "READY_FOR_PRICING"].includes(status)) {
    return "warning" as const;
  }

  return "default" as const;
};

const GridRow = ({
  expandable = false,
  expanded = false,
  keyValue,
  label,
  onToggle,
  status,
  summary,
}: {
  expandable?: boolean;
  expanded?: boolean;
  keyValue: string;
  label: string;
  onToggle?: () => void;
  status: string;
  summary: string;
}) => (
  <TableRow className={expandable ? "cursor-pointer hover:bg-slate-50" : undefined} onClick={onToggle}>
    <TableCell className="font-medium text-slate-900">
      <div className="flex items-center gap-2">
        {expandable ? (
          expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : null}
        <span>{label}</span>
      </div>
    </TableCell>
    <TableCell>{summary}</TableCell>
    <TableCell>{keyValue}</TableCell>
    <TableCell>
      <Badge variant={formatStatusVariant(status)}>{status}</Badge>
    </TableCell>
  </TableRow>
);

export const TenderDetailPage = () => {
  const params = useParams();
  const { pathname } = useLocation();
  const tenderId = params.tenderId ?? "";
  const pathSegments = pathname.split("/").filter(Boolean);
  const section = (pathSegments[2] ?? "overview") as keyof SectionPayloads;
  const [payload, setPayload] = useState<SectionPayloads[keyof SectionPayloads] | null>(null);
  const [overview, setOverview] = useState<TenderOverviewData | null>(null);
  const [error, setError] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>("material-sourcing");
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const title = useMemo(
    () => getPageTitle(section === "overview" ? `/tenders/${tenderId}` : `/tenders/${tenderId}/${section}`),
    [section, tenderId],
  );

  useEffect(() => {
    if (!isApiConfigured || !tenderId) {
      return;
    }

    const getOptional = async <T,>(path: string) => {
      try {
        return await api.get<T>(path);
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 404) {
          return null;
        }

        throw reason;
      }
    };

    setError("");

    if (section === "overview") {
      void Promise.all([
        getOptional<TenderRequest>(`/tenders/${tenderId}?tenantId=alimex-demo`),
        getOptional<ProductConfiguration>(`/tenders/${tenderId}/product-configuration?tenantId=alimex-demo`),
        getOptional<RollCalculation>(`/tenders/${tenderId}/roll-calculation?tenantId=alimex-demo`),
        getOptional<MaterialSourceSelection>(`/tenders/${tenderId}/material-sourcing?tenantId=alimex-demo`),
        getOptional<CostBuildUp>(`/tenders/${tenderId}/cost-build-up?tenantId=alimex-demo`),
        getOptional<TenderActivity[]>(`/tenders/${tenderId}/activities?tenantId=alimex-demo`),
      ])
        .then(([tender, productConfiguration, rollCalculation, materialSourcing, costBuildUp, activities]) =>
          setOverview({
            tender,
            productConfiguration,
            rollCalculation,
            materialSourcing,
            costBuildUp,
            activities: activities ?? [],
          }),
        )
        .catch((reason: Error) => setError(reason.message));
      return;
    }

    const basePath = `/tenders/${tenderId}/${section}?tenantId=alimex-demo`;
    void api
      .get<SectionPayloads[keyof SectionPayloads]>(basePath)
      .then(setPayload)
      .catch((reason: Error) => setError(reason.message));
  }, [section, tenderId]);

  const summaryCards = useMemo(() => {
    if (!overview?.tender) {
      return [];
    }

    return [
      {
        label: "Customer",
        value: overview.tender.customerName || "-",
        icon: PackageSearch,
      },
      {
        label: "Status",
        value: overview.tender.status,
        icon: ScanSearch,
      },
      {
        label: "Material Cost / Bag",
        value: formatCurrency(overview.materialSourcing?.materialCostPerBagEgp),
        icon: CircleDollarSign,
      },
      {
        label: "Total Cost / Order",
        value: formatCurrency(overview.costBuildUp?.totalCostPriceForOrder),
        icon: Calculator,
      },
    ];
  }, [overview]);

  const gridRows = useMemo(() => {
    if (!overview?.tender) {
      return [];
    }

    return [
      {
        id: "summary",
        label: "Summary Row",
        summary: `${overview.tender.tenderNumber} · ${overview.tender.requestType}`,
        keyValue: `${overview.productConfiguration?.quantity?.toLocaleString() ?? "-"} bags`,
        status: overview.tender.status,
      },
      {
        id: "tender-info",
        label: "Tender Information",
        summary: `${overview.tender.customerName} · Due ${overview.tender.tenderDueDate || "-"}`,
        keyValue: overview.tender.requestedDeliveryTime || "-",
        status: overview.tender.status,
      },
      {
        id: "product-configuration",
        label: "Product Configuration",
        summary: `${overview.productConfiguration?.productType ?? "-"} · ${overview.productConfiguration?.topDesign ?? "-"}`,
        keyValue: `${formatNumber(overview.productConfiguration?.bagDiameterMm, 4)} m x ${formatNumber(
          overview.productConfiguration?.bagLengthMm,
          4,
        )} m`,
        status: overview.productConfiguration ? "Loaded" : "Missing",
      },
      {
        id: "roll-calculation",
        label: "Roll Calculation",
        summary: `${formatNumber(overview.rollCalculation?.totalFabricRequiredM2)} m² required`,
        keyValue: `${formatNumber(overview.rollCalculation?.actualAreaPerBagM2, 4)} m² / bag`,
        status: overview.rollCalculation ? "Loaded" : "Missing",
      },
      {
        id: "material-sourcing",
        label: "Material Cost",
        summary: `${overview.materialSourcing?.selectedSources.length ?? 0} source line(s)`,
        keyValue: formatCurrency(overview.materialSourcing?.totalMaterialCostEgp),
        status: overview.materialSourcing ? "Loaded" : "Missing",
        expandable: true,
      },
      {
        id: "cost-build-up",
        label: "Cost Build-Up",
        summary: formatCurrency(overview.costBuildUp?.totalCostPricePerBag),
        keyValue: formatCurrency(overview.costBuildUp?.totalCostPriceForOrder),
        status: overview.costBuildUp ? "Loaded" : "Missing",
      },
    ];
  }, [overview]);

  if (section !== "overview") {
    return (
      <div className="space-y-6">
        <RouteTabs items={getTenderSectionTabs(tenderId || "TDR-1001")} />
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>Section payload loaded from the matching tender sub-resource.</CardDescription>
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RouteTabs items={getTenderSectionTabs(tenderId || "TDR-1001")} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <Card key={card.label}>
              <CardHeader>
                <div>
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="mt-2 text-xl">{card.value}</CardTitle>
                </div>
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                  <Icon className="h-5 w-5" />
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Tender Grid</CardTitle>
            <CardDescription>
              Consolidated tender, configuration, sourcing, and costing data with a summary row and expandable material cost details.
            </CardDescription>
          </div>
          <Badge variant="default">Tender {overview?.tender?.tenderNumber ?? tenderId}</Badge>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Key Value</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gridRows.map((row) => (
                <Fragment key={row.id}>
                  <GridRow
                    expandable={row.expandable}
                    expanded={expandedRow === row.id}
                    keyValue={row.keyValue}
                    label={row.label}
                    onToggle={
                      row.expandable
                        ? () => setExpandedRow((current) => (current === row.id ? null : row.id))
                        : undefined
                    }
                    status={row.status}
                    summary={row.summary}
                  />
                  {row.id === "material-sourcing" && expandedRow === row.id ? (
                    <TableRow>
                      <TableCell className="bg-slate-50" colSpan={4}>
                        <div className="space-y-4 rounded-2xl border border-border bg-white p-4">
                          <div className="grid gap-3 md:grid-cols-4">
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Weighted Avg</p>
                              <p className="mt-2 text-sm font-semibold text-slate-900">
                                {formatCurrency(overview?.materialSourcing?.weightedAverageUnitCostUsdPerM2, 4, "USD/m²")}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Landed Cost</p>
                              <p className="mt-2 text-sm font-semibold text-slate-900">
                                {formatCurrency(overview?.materialSourcing?.landedCostEgpPerM2, 2, "EGP/m²")}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Per Bag</p>
                              <p className="mt-2 text-sm font-semibold text-slate-900">
                                {formatCurrency(overview?.materialSourcing?.materialCostPerBagEgp)}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Lead Time</p>
                              <p className="mt-2 text-sm font-semibold text-slate-900">
                                {formatNumber(overview?.materialSourcing?.totalLeadTimeDays, 0)} days
                              </p>
                            </div>
                          </div>

                          <div className="overflow-x-auto rounded-2xl border border-border">
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                <tr>
                                  <th className="px-4 py-3">Source</th>
                                  <th className="px-4 py-3">Type</th>
                                  <th className="px-4 py-3">Qty Used</th>
                                  <th className="px-4 py-3">Unit Cost</th>
                                  <th className="px-4 py-3">Total Cost</th>
                                  <th className="px-4 py-3">Lead Time</th>
                                </tr>
                              </thead>
                              <tbody>
                                {overview?.materialSourcing?.selectedSources.length ? (
                                  overview.materialSourcing.selectedSources.map((source) => (
                                    <tr className="border-t border-border" key={source.sourceId}>
                                      <td className="px-4 py-3 font-medium text-slate-900">{source.sourceName}</td>
                                      <td className="px-4 py-3">
                                        <Badge variant={source.sourceType === "stock" ? "success" : "warning"}>
                                          {source.sourceType}
                                        </Badge>
                                      </td>
                                      <td className="px-4 py-3">{formatNumber(source.qtyUsedM2)} m²</td>
                                      <td className="px-4 py-3">{formatCurrency(source.unitCostUsdPerM2, 4, "USD/m²")}</td>
                                      <td className="px-4 py-3">{formatCurrency(source.totalCostUsd, 2, "USD")}</td>
                                      <td className="px-4 py-3">{formatNumber(source.leadTimeDays, 0)} days</td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>
                                      No material sourcing lines saved yet.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
          {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Activity Log</CardTitle>
            <CardDescription>
              Fine-grained audit trail for tender changes, including actor, section, and field-level diffs.
            </CardDescription>
          </div>
          <Badge variant="default">{overview?.activities.length ?? 0} event(s)</Badge>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Who</th>
                  <th className="px-4 py-3">Activity</th>
                  <th className="px-4 py-3">Section</th>
                  <th className="px-4 py-3">Summary</th>
                  <th className="px-4 py-3">Changes</th>
                </tr>
              </thead>
              <tbody>
                {overview?.activities.length ? (
                  overview.activities.map((activity) => {
                    const isExpanded = expandedActivityId === activity.activityId;

                    return (
                      <Fragment key={activity.activityId}>
                        <tr
                          className="cursor-pointer border-t border-border hover:bg-slate-50"
                          onClick={() =>
                            setExpandedActivityId((current) => (current === activity.activityId ? null : activity.activityId))
                          }
                        >
                          <td className="px-4 py-3 text-slate-700">{formatDateTime(activity.createdAt)}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{activity.actorName || activity.actorId}</div>
                            <div className="text-xs text-muted-foreground">
                              {activity.actorEmail || activity.actorId || "Unknown"}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={activity.activityType === "UPDATED" ? "warning" : "success"}>
                              {activity.activityType}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">{activity.section}</td>
                          <td className="px-4 py-3 text-slate-700">{activity.message}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="default">{activity.changeCount}</Badge>
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="border-t border-border bg-slate-50/70">
                            <td className="px-4 py-4" colSpan={6}>
                              {activity.changes.length ? (
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                  {activity.changes.map((change, index) => (
                                    <div className="rounded-2xl border border-border bg-white p-3" key={`${activity.activityId}-${index}`}>
                                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{change.fieldPath}</p>
                                      <div className="mt-2 grid gap-2">
                                        <div className="rounded-xl bg-slate-50 p-2">
                                          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Previous</p>
                                          <p className="mt-1 text-sm text-slate-700">{formatAuditValue(change.previousValue)}</p>
                                        </div>
                                        <div className="rounded-xl bg-blue-50 p-2">
                                          <p className="text-[11px] uppercase tracking-[0.16em] text-blue-700">New</p>
                                          <p className="mt-1 text-sm font-medium text-slate-900">{formatAuditValue(change.nextValue)}</p>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">No field-level changes captured for this event.</p>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                      No activity captured for this tender yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

import {
  ArrowRight,
  Calculator,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { NestedTenderGrid } from "../components/tenders/nested-tender-grid";
import { api, ApiError, isApiConfigured } from "../lib/api";
import { getPageTitle } from "../lib/route-metadata";
import { PricingApprovalPage } from "./pricing-approval-page";
import type {
  CostBuildUp,
  MaterialSourceSelection,
  PricingApproval,
  ProductConfiguration,
  RollCalculation,
  ScenarioAlternative,
  TenderRequest,
  TenderStatus,
  UserActivityAuditLog,
} from "../../shared/types";

type SectionPayloads = {
  overview: TenderRequest;
  "material-sourcing": MaterialSourceSelection;
  "cost-build-up": CostBuildUp;
  alternatives: ScenarioAlternative;
  "pricing-approval": PricingApproval;
};

type TenderOverviewData = {
  tender: TenderRequest | null;
  productConfiguration: ProductConfiguration | null;
  rollCalculation: RollCalculation | null;
  materialSourcing: MaterialSourceSelection | null;
  costBuildUp: CostBuildUp | null;
  alternatives: ScenarioAlternative | null;
  pricingApproval: PricingApproval | null;
  auditLog: UserActivityAuditLog[];
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

const formatStageLabel = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const getAuditActionVariant = (actionType: string) => {
  switch (actionType) {
    case "APPROVE":
      return "success" as const;
    case "REJECT":
      return "warning" as const;
    case "CREATE":
      return "default" as const;
    default:
      return "neutral" as const;
  }
};

const convertMetersToMillimeters = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return value;
  }

  const millimeters = value * 1000;
  return Number.isInteger(millimeters) ? millimeters : Number(millimeters.toFixed(2));
};

const toDisplayPayload = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(toDisplayPayload);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((accumulator, [key, entry]) => {
    if (key === "rollWidthM") {
      accumulator.rollWidthMm = convertMetersToMillimeters(entry);
      return accumulator;
    }

    if (key === "rollLengthM") {
      accumulator.rollLengthMm = convertMetersToMillimeters(entry);
      return accumulator;
    }

    accumulator[key] = toDisplayPayload(entry);
    return accumulator;
  }, {});
};

const getWorkflowPath = ({
  tenderId,
  status,
  section,
}: {
  tenderId: string;
  status?: TenderStatus | null;
  section?: keyof SectionPayloads;
}) => {
  if (status) {
    switch (status) {
      case "DRAFT_INTAKE":
      case "MISSING_INFORMATION":
        return `/tenders/intake/${tenderId}`;
      case "TECHNICAL_REVIEW":
        return `/tenders/${tenderId}/technical-review`;
      case "READY_FOR_PRICING":
        return `/tenders/${tenderId}/product-configuration`;
      case "PRODUCT_CONFIGURATION":
        return `/tenders/${tenderId}/material-sourcing`;
      case "MATERIAL_ROLL_CALCULATION":
      case "MATERIAL_SOURCING":
        return `/tenders/${tenderId}/cost-build-up`;
      case "COST_BUILDUP":
        return `/tenders/${tenderId}/alternatives`;
      case "ALTERNATIVES":
      case "PENDING_APPROVAL":
        return `/tenders/${tenderId}/pricing-approval`;
      case "APPROVED":
      case "OFFER_SUBMITTED":
      case "NEGOTIATION":
      case "WON":
      case "LOST":
      case "CANCELLED":
      case "PRICING_IN_PROGRESS":
      case "SOURCING_REVIEW":
      case "PRICE_READY":
        return `/tenders/${tenderId}`;
      default:
        return `/tenders/${tenderId}`;
    }
  }

  switch (section) {
    case "material-sourcing":
      return `/tenders/${tenderId}/material-sourcing`;
    case "cost-build-up":
      return `/tenders/${tenderId}/cost-build-up`;
    case "alternatives":
      return `/tenders/${tenderId}/alternatives`;
    case "pricing-approval":
      return `/tenders/${tenderId}/pricing-approval`;
    default:
      return `/tenders/intake/${tenderId}`;
  }
};

const TenderDetailContent = ({
  section,
  tenderId,
}: {
  section: keyof SectionPayloads;
  tenderId: string;
}) => {
  const { pathname } = useLocation();
  const [payload, setPayload] = useState<SectionPayloads[keyof SectionPayloads] | null>(null);
  const [overview, setOverview] = useState<TenderOverviewData | null>(null);
  const [error, setError] = useState("");
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [auditStageFilter, setAuditStageFilter] = useState("");
  const [auditUserFilter, setAuditUserFilter] = useState("");
  const [auditActionTypeFilter, setAuditActionTypeFilter] = useState("");
  const [auditDateFromFilter, setAuditDateFromFilter] = useState("");
  const [auditDateToFilter, setAuditDateToFilter] = useState("");
  const title = useMemo(
    () => getPageTitle(section === "overview" ? `/tenders/${tenderId}` : `/tenders/${tenderId}/${section}`),
    [section, tenderId],
  );
  const displayPayload = useMemo(() => (payload ? toDisplayPayload(payload) : null), [payload]);
  const navigate = useNavigate();
  const workflowPath = getWorkflowPath({
    tenderId,
    status: overview?.tender?.status,
    section,
  });

  const auditQueryString = useMemo(() => {
    const params = new URLSearchParams({ tenantId: "alimex-demo" });
    if (auditStageFilter) params.set("stage", auditStageFilter);
    if (auditUserFilter) params.set("user", auditUserFilter);
    if (auditActionTypeFilter) params.set("actionType", auditActionTypeFilter);
    if (auditDateFromFilter) params.set("dateFrom", `${auditDateFromFilter}T00:00:00.000Z`);
    if (auditDateToFilter) params.set("dateTo", `${auditDateToFilter}T23:59:59.999Z`);
    return params.toString();
  }, [auditActionTypeFilter, auditDateFromFilter, auditDateToFilter, auditStageFilter, auditUserFilter]);

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
        getOptional<ScenarioAlternative>(`/tenders/${tenderId}/alternatives?tenantId=alimex-demo`),
        getOptional<PricingApproval>(`/tenders/${tenderId}/pricing-approval?tenantId=alimex-demo`),
        getOptional<UserActivityAuditLog[]>(`/tenders/${tenderId}/audit-log?${auditQueryString}`),
      ])
        .then(
          ([
            tender,
            productConfiguration,
            rollCalculation,
            materialSourcing,
            costBuildUp,
            alternatives,
            pricingApproval,
            auditLog,
          ]) =>
          setOverview({
            tender,
            productConfiguration,
            rollCalculation,
            materialSourcing,
            costBuildUp,
            alternatives,
            pricingApproval,
            auditLog: auditLog ?? [],
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
  }, [auditQueryString, section, tenderId]);

  const summaryCards = useMemo(() => {
    if (!overview?.tender) {
      return [];
    }

    return [
      {
        label: "Customer",
        value: overview.tender.customerName || "-",
        icon: Calculator,
      },
      {
        label: "Status",
        value: overview.tender.status,
        icon: CircleDollarSign,
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

  if (section !== "overview") {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button onClick={() => navigate(workflowPath)} type="button">
            Edit Tender Workflow
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
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
                {displayPayload
                  ? JSON.stringify(displayPayload, null, 2)
                  : "No backend record loaded for this section yet."}
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
      <div className="flex justify-end">
        <Button onClick={() => navigate(workflowPath)} type="button">
          Edit Tender Workflow
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <Card key={card.label}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <CardDescription className="text-xs font-medium uppercase tracking-[0.14em]">
                    {card.label}
                  </CardDescription>
                  <CardTitle className="mt-1 break-words text-xl sm:text-2xl">{card.value}</CardTitle>
                </div>
                <div className="shrink-0 rounded-2xl bg-blue-50 p-2.5 text-blue-700">
                  <Icon className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <div className="min-w-0">
        <NestedTenderGrid
          alternatives={overview?.alternatives ?? null}
          costBuildUp={overview?.costBuildUp ?? null}
          materialSourcing={overview?.materialSourcing ?? null}
          pricingApproval={overview?.pricingApproval ?? null}
          productConfiguration={overview?.productConfiguration ?? null}
          tender={overview?.tender ?? null}
        />
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Activity Log</CardTitle>
            <CardDescription>
              User Activity Audit Log for meaningful business inputs and approval actions only.
            </CardDescription>
          </div>
          <Badge variant="default">{overview?.auditLog.length ?? 0} save action(s)</Badge>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <select
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
              onChange={(event) => setAuditStageFilter(event.target.value)}
              value={auditStageFilter}
            >
              <option value="">All stages</option>
              <option value="TENDER">Tender</option>
              <option value="PRODUCT_CONFIGURATION">Product Configuration</option>
              <option value="MATERIAL_SOURCE_SELECTION">Material Sourcing</option>
              <option value="COST_BUILDUP">Cost Build-Up</option>
              <option value="ALTERNATIVES">Alternatives</option>
              <option value="PRICING_APPROVAL">Pricing Approval</option>
              <option value="SYSTEM">System</option>
            </select>
            <input
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
              onChange={(event) => setAuditUserFilter(event.target.value)}
              placeholder="Filter by user"
              value={auditUserFilter}
            />
            <select
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
              onChange={(event) => setAuditActionTypeFilter(event.target.value)}
              value={auditActionTypeFilter}
            >
              <option value="">All actions</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
              <option value="APPROVE">Approve</option>
              <option value="REJECT">Reject</option>
            </select>
            <input
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
              onChange={(event) => setAuditDateFromFilter(event.target.value)}
              type="date"
              value={auditDateFromFilter}
            />
            <input
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
              onChange={(event) => setAuditDateToFilter(event.target.value)}
              type="date"
              value={auditDateToFilter}
            />
          </div>
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <div className="min-w-[980px] rounded-2xl border border-border">
              <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date/Time</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Changes</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {overview?.auditLog.length ? (
                  overview.auditLog.map((record) => {
                    const isExpanded = expandedAuditId === record.auditId;

                    return (
                      <Fragment key={record.auditId}>
                        <tr
                          className="cursor-pointer border-t border-border align-top transition-colors hover:bg-slate-50"
                          onClick={() => setExpandedAuditId((current) => (current === record.auditId ? null : record.auditId))}
                        >
                          <td className="px-4 py-3.5 text-slate-700">{formatDateTime(record.changedAt)}</td>
                          <td className="px-4 py-3.5">
                            <div className="font-medium text-slate-900">{record.changedByUserName || record.changedByUserId}</div>
                            <div className="text-xs text-muted-foreground">
                              {record.changedByUserEmail || record.changedByUserId || "Unknown"}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-sm text-slate-700">{formatStageLabel(record.stage)}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <Badge className="min-w-7 justify-center rounded-full px-2 py-1" variant="default">
                                {record.changeCount}
                              </Badge>
                              <span className="text-slate-700">
                                {record.changeCount === 1 ? "1 field updated" : `${record.changeCount} fields updated`}
                              </span>
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <Badge variant={getAuditActionVariant(record.actionType)}>
                              {record.actionType}
                            </Badge>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="border-t border-border bg-slate-50/70">
                            <td className="px-4 py-3" colSpan={5}>
                              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                {record.changes.map((change, index) => (
                                  <div
                                    className="grid gap-2 px-4 py-2.5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-3"
                                    key={`${record.auditId}-${change.fieldName}-${index}`}
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium text-slate-950">{change.fieldLabel}</div>
                                    </div>
                                    <div className="text-left md:text-center">
                                      <span className="inline-flex max-w-full items-center rounded-md bg-rose-50 px-2.5 py-1 text-sm font-semibold text-rose-700 line-through decoration-1 decoration-rose-500/80">
                                        {formatAuditValue(change.oldValue)}
                                      </span>
                                    </div>
                                    <div className="text-slate-400 md:text-center">
                                      <ArrowRight className="h-4 w-4" />
                                    </div>
                                    <div className="text-left md:text-right">
                                      <span className="inline-flex max-w-full items-center rounded-md bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700">
                                        {formatAuditValue(change.newValue)}
                                      </span>
                                    </div>
                                    {index < record.changes.length - 1 ? (
                                      <div className="md:col-span-4">
                                        <div className="border-t border-slate-100" />
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                      No user activity audit records captured for this tender yet.
                    </td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const TenderDetailPage = () => {
  const params = useParams();
  const { pathname } = useLocation();
  const tenderId = params.tenderId ?? "";
  const pathSegments = pathname.split("/").filter(Boolean);
  const section = (pathSegments[2] ?? "overview") as keyof SectionPayloads;

  if (section === "pricing-approval") {
    return <PricingApprovalPage />;
  }

  return <TenderDetailContent section={section} tenderId={tenderId} />;
};

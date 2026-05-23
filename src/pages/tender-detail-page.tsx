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
  TenderActivity,
  TenderRequest,
  TenderStatus,
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
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
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
        getOptional<TenderActivity[]>(`/tenders/${tenderId}/activities?tenantId=alimex-demo`),
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
            activities,
          ]) =>
          setOverview({
            tender,
            productConfiguration,
            rollCalculation,
            materialSourcing,
            costBuildUp,
            alternatives,
            pricingApproval,
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

      <NestedTenderGrid
        alternatives={overview?.alternatives ?? null}
        costBuildUp={overview?.costBuildUp ?? null}
        materialSourcing={overview?.materialSourcing ?? null}
        pricingApproval={overview?.pricingApproval ?? null}
        productConfiguration={overview?.productConfiguration ?? null}
        tender={overview?.tender ?? null}
      />

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

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

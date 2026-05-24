import { ArrowLeft, CheckCircle2, Clock3, Save, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type {
  CostBuildUp,
  MaterialSourceSelection,
  PricingApproval,
  PricingApprovalDecisionStatus,
  ProductConfiguration,
  ScenarioAlternative,
  TenderRequest,
} from "../../shared/types";
import { TenderWorkflowStepper } from "../components/tenders/tender-workflow-stepper";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { api, ApiError, isApiConfigured } from "../lib/api";
import {
  confirmDiscardUnsavedChanges,
  useUnsavedChangesWarning,
} from "../lib/use-unsaved-changes";
import { cn } from "../lib/utils";

type DecisionForm = {
  scenarioId: string;
  label: string;
  status: PricingApprovalDecisionStatus;
  profitPercent: number | null;
  customerCommissionPercent: number | null;
  salesPersonCommissionMode: "percent" | "fixed";
  salesPersonCommissionPercent: number | null;
  salesPersonCommissionFixedAmount: number | null;
  totalCost: number | null;
  pricePerBag: number | null;
  totalPrice: number | null;
  notes: string;
};

type PricingApprovalForm = {
  tenantId: string;
  tenderId: string;
  approvalId: string;
  currency: "EGP";
  notes: string;
  decisions: DecisionForm[];
};

const formatCurrency = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "Not calculated"
    : `${value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} EGP`;

const formatPercent = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "Not set"
    : `${value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}%`;

const formatSalesCommission = (decision: {
  salesPersonCommissionMode: "percent" | "fixed";
  salesPersonCommissionPercent: number | null;
  salesPersonCommissionFixedAmount: number | null;
}) =>
  decision.salesPersonCommissionMode === "fixed"
    ? formatCurrency(decision.salesPersonCommissionFixedAmount)
    : formatPercent(decision.salesPersonCommissionPercent);

const calculateProfit = (totalPrice: number | null, totalCost: number | null) =>
  totalPrice !== null && totalCost !== null ? totalPrice - totalCost : null;

const buildInitialForm = (
  tenderId: string,
  alternatives: ScenarioAlternative,
  saved?: PricingApproval | null,
): PricingApprovalForm => {
  const savedByScenario = new Map((saved?.decisions ?? []).map((decision) => [decision.scenarioId, decision]));

  return {
    tenantId: saved?.tenantId || alternatives.tenantId,
    tenderId,
    approvalId: saved?.approvalId || "base",
    currency: "EGP",
    notes: saved?.notes ?? "",
    decisions: alternatives.scenarios.map((scenario) => {
      const existing = savedByScenario.get(scenario.scenarioId);

      return {
        scenarioId: scenario.scenarioId,
        label: scenario.label,
        status: existing?.status ?? "pending",
        profitPercent: scenario.profitPercent,
        customerCommissionPercent: scenario.customerCommissionPercent,
        salesPersonCommissionMode: scenario.salesPersonCommissionMode ?? "percent",
        salesPersonCommissionPercent: scenario.salesPersonCommissionPercent,
        salesPersonCommissionFixedAmount: scenario.salesPersonCommissionFixedAmount,
        totalCost: scenario.totalCost,
        pricePerBag: scenario.pricePerBag,
        totalPrice: scenario.totalPrice,
        notes: existing?.notes ?? "",
      };
    }),
  };
};

const getStatusTone = (status: PricingApprovalDecisionStatus) => {
  if (status === "approved") {
    return "success";
  }

  if (status === "pending") {
    return "warning";
  }

  return "neutral";
};

const getStatusButtonClassName = (status: PricingApprovalDecisionStatus, active: boolean) => {
  if (!active) {
    return "";
  }

  if (status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
  }

  if (status === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100";
  }

  return "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100";
};

const productOverheadLineCode = (baseCode: "F" | "G" | "G2", productId: string) =>
  `${baseCode}::${productId}`;

export const PricingApprovalPage = () => {
  const navigate = useNavigate();
  const { tenderId = "" } = useParams();
  const [tender, setTender] = useState<TenderRequest | null>(null);
  const [costBuildUp, setCostBuildUp] = useState<CostBuildUp | null>(null);
  const [alternatives, setAlternatives] = useState<ScenarioAlternative | null>(null);
  const [productConfiguration, setProductConfiguration] = useState<ProductConfiguration | null>(null);
  const [materialSourcing, setMaterialSourcing] = useState<MaterialSourceSelection | null>(null);
  const [form, setForm] = useState<PricingApprovalForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saveMode, setSaveMode] = useState<"draft" | "final" | "approve" | null>(null);
  const [lastSavedSignature, setLastSavedSignature] = useState("null");

  useEffect(() => {
    if (!isApiConfigured || !tenderId) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      setError("");

      try {
        const [loadedTender, loadedCostBuildUp, loadedAlternatives, loadedProductConfiguration, loadedMaterialSourcing, savedApproval] = await Promise.all([
          api.get<TenderRequest>(`/tenders/${tenderId}?tenantId=alimex-demo`),
          api
            .get<CostBuildUp>(`/tenders/${tenderId}/cost-build-up?tenantId=alimex-demo`)
            .catch((reason) => {
              if (reason instanceof ApiError && reason.status === 404) {
                return null;
              }

              throw reason;
            }),
          api.get<ScenarioAlternative>(`/tenders/${tenderId}/alternatives?tenantId=alimex-demo`),
          api.get<ProductConfiguration>(`/tenders/${tenderId}/product-configuration?tenantId=alimex-demo`),
          api
            .get<MaterialSourceSelection>(`/tenders/${tenderId}/material-sourcing?tenantId=alimex-demo`)
            .catch((reason) => {
              if (reason instanceof ApiError && reason.status === 404) {
                return null;
              }

              throw reason;
            }),
          api
            .get<PricingApproval>(`/tenders/${tenderId}/pricing-approval?tenantId=alimex-demo`)
            .catch((reason) => {
              if (reason instanceof ApiError && reason.status === 404) {
                return null;
              }

              throw reason;
            }),
        ]);

        if (!isMounted) {
          return;
        }

        setTender(loadedTender);
        setCostBuildUp(loadedCostBuildUp);
        setAlternatives(loadedAlternatives);
        setProductConfiguration(loadedProductConfiguration);
        setMaterialSourcing(loadedMaterialSourcing);
        const nextForm = buildInitialForm(tenderId, loadedAlternatives, savedApproval);
        setForm(nextForm);
        setLastSavedSignature(JSON.stringify(nextForm));
      } catch (reason) {
        if (isMounted) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load pricing approval. Save alternatives first.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [tenderId]);

  const decisionCounts = useMemo(() => {
    const decisions = form?.decisions ?? [];

    return {
      total: decisions.length,
      approved: decisions.filter((decision) => decision.status === "approved").length,
      pending: decisions.filter((decision) => decision.status === "pending").length,
      denied: decisions.filter((decision) => decision.status === "denied").length,
    };
  }, [form]);

  const approvedTotal = useMemo(
    () =>
      (form?.decisions ?? [])
        .filter((decision) => decision.status === "approved")
        .reduce((sum, decision) => sum + (decision.totalPrice ?? 0), 0),
    [form],
  );

  const productSnapshots = productConfiguration?.productSnapshots ?? [];
  const sourcingBreakdown = materialSourcing?.componentSelections ?? [];
  const readCostLineValue = (code: string) =>
    costBuildUp?.costLines.find((line) => line.code === code)?.costPerBag ?? 0;

  const productCostCards = useMemo(
    () =>
      productSnapshots.map((product) => {
        const sourcingLines = sourcingBreakdown.filter((selection) => selection.productId === product.productId);
        const requestedQuantity = product.requestedQuantity ?? null;
        const sourcedMaterialTotal = sourcingLines.reduce(
          (total, selection) => total + (selection.totalMaterialCostEgp ?? 0),
          0,
        );
        const sourcedMaterialCostPerBag =
          requestedQuantity && requestedQuantity > 0 ? sourcedMaterialTotal / requestedQuantity : null;

        const packagingCost = readCostLineValue("D");
        const factoryOverhead =
          costBuildUp?.costLines.find((line) => line.code === productOverheadLineCode("F", product.productId))?.costPerBag ??
          product.factoryOverheadPerBag ??
          readCostLineValue("F");
        const manufacturingOverhead =
          costBuildUp?.costLines.find((line) => line.code === productOverheadLineCode("G", product.productId))?.costPerBag ??
          product.manufacturingOverheadPerBag ??
          readCostLineValue("G");
        const managementOverhead =
          costBuildUp?.costLines.find((line) => line.code === productOverheadLineCode("G2", product.productId))?.costPerBag ??
          product.managementOverheadPerBag ??
          readCostLineValue("G2");
        const salesCost = readCostLineValue("H");
        const rushCost = readCostLineValue("I_RUSH");
        const transportationCost = readCostLineValue("J");
        const installationCost = readCostLineValue("K");

        const materialPerBag = (sourcedMaterialCostPerBag ?? 0) + packagingCost;
        const operatingPerBag = factoryOverhead + manufacturingOverhead + managementOverhead + salesCost;
        const additionalPerBag = rushCost + transportationCost + installationCost;

        return {
          productId: product.productId,
          totalPerBag: materialPerBag + operatingPerBag + additionalPerBag,
        };
      }),
    [costBuildUp?.costLines, productSnapshots, sourcingBreakdown],
  );

  const orderTotalCost = useMemo(
    () => {
      if (!productSnapshots.length) {
        return (
          costBuildUp?.totalCostPriceForOrder ??
          (alternatives?.baseCostPerBag !== null &&
          alternatives?.baseCostPerBag !== undefined &&
          alternatives?.quantity !== null &&
          alternatives?.quantity !== undefined
            ? alternatives.baseCostPerBag * alternatives.quantity
            : null)
        );
      }

      const total = productSnapshots.reduce((sum, product) => {
        const productMaterialTotalCost = product.components.reduce((componentSum, component) => {
          const sourcedSelection = sourcingBreakdown.find(
            (selection) => selection.productId === product.productId && selection.componentId === component.componentId,
          );
          const accessoryPerBag = component.accessorySnapshot?.totalPricePerBagEgp ?? null;
          const requestedQuantity = product.requestedQuantity ?? sourcedSelection?.requestedQuantity ?? null;
          const sourcedTotalCost = sourcedSelection?.totalMaterialCostEgp ?? null;
          const sourcedRequestedQuantity = sourcedSelection?.requestedQuantity ?? null;
          const sourcedUnitCost =
            sourcedSelection?.materialCostPerBagEgp ??
            (sourcedTotalCost !== null &&
            sourcedRequestedQuantity !== null &&
            sourcedRequestedQuantity > 0
              ? sourcedTotalCost / sourcedRequestedQuantity
              : null);
          const unitCost = sourcedUnitCost ?? accessoryPerBag;
          const totalCost =
            sourcedTotalCost ??
            (requestedQuantity !== null && unitCost !== null ? requestedQuantity * unitCost : null);

          return componentSum + (totalCost ?? 0);
        }, 0);

        const productMaterialUnitCost =
          product.requestedQuantity !== null && product.requestedQuantity !== undefined && product.requestedQuantity > 0
            ? productMaterialTotalCost / product.requestedQuantity
            : null;
        const costSummary = productCostCards.find((item) => item.productId === product.productId);
        const totalUnitCost = costSummary?.totalPerBag ?? productMaterialUnitCost;
        const totalCost =
          totalUnitCost !== null &&
          product.requestedQuantity !== null &&
          product.requestedQuantity !== undefined &&
          product.requestedQuantity > 0
            ? totalUnitCost * product.requestedQuantity
            : productMaterialTotalCost;

        return sum + (totalCost ?? 0);
      }, 0);

      return total > 0 ? total : costBuildUp?.totalCostPriceForOrder ?? null;
    },
    [alternatives, costBuildUp?.totalCostPriceForOrder, productCostCards, productSnapshots, sourcingBreakdown],
  );

  const hasApprovedScenario = decisionCounts.approved > 0;
  const currentSignature = useMemo(() => JSON.stringify(form), [form]);
  const isDirty = currentSignature !== lastSavedSignature;

  useUnsavedChangesWarning(isDirty);

  const updateDecision = (scenarioId: string, patch: Partial<DecisionForm>) => {
    setForm((current) =>
      current
        ? {
            ...current,
            decisions: current.decisions.map((decision) => {
              if (patch.status === "approved") {
                if (decision.scenarioId === scenarioId) {
                  return { ...decision, ...patch };
                }

                if (decision.status === "approved") {
                  return { ...decision, status: "pending" };
                }
              }

              return decision.scenarioId === scenarioId ? { ...decision, ...patch } : decision;
            }),
          }
        : current,
    );
  };

  const buildPayload = (mode: "draft" | "final" | "approve"): PricingApproval | null => {
    if (!form) {
      return null;
    }

    const approvalsOpen = form.decisions.filter((decision) => decision.status === "pending").length;
    const approvedCount = form.decisions.filter((decision) => decision.status === "approved").length;
    const deniedCount = form.decisions.filter((decision) => decision.status === "denied").length;
    const status: PricingApproval["status"] =
      mode === "approve"
        ? "approved"
        :
      approvalsOpen === 0 && approvedCount > 0 && deniedCount === 0
        ? "approved"
        : approvedCount > 0 && (approvalsOpen > 0 || deniedCount > 0)
          ? "partial"
          : deniedCount > 0 && approvedCount === 0 && approvalsOpen === 0
            ? "denied"
            : "pending";

    return {
      entityType: "PricingApproval",
      tenantId: form.tenantId,
      tenderId,
      approvalId: form.approvalId,
      currency: "EGP",
      approvalsOpen,
      status,
      decisions: form.decisions.map((decision) => ({
        scenarioId: decision.scenarioId,
        label: decision.label,
        status: decision.status,
        pricePerBag: decision.pricePerBag,
        totalPrice: decision.totalPrice,
        notes: decision.notes.trim(),
      })),
      notes: form.notes.trim(),
      createdAt: "",
      updatedAt: "",
    };
  };

  const save = async (mode: "draft" | "final" | "approve") => {
    const payload = buildPayload(mode);

    if (!payload) {
      return;
    }

    setSaveMode(mode);
    setError("");
    setMessage("");

    if (!isApiConfigured) {
      setError("Set VITE_API_BASE_URL before saving pricing approval.");
      setSaveMode(null);
      return;
    }

    if (mode === "approve" && !hasApprovedScenario) {
      setError("Approve at least one scenario before approving the whole tender.");
      setSaveMode(null);
      return;
    }

    try {
      const response = await api.put<PricingApproval>(`/tenders/${tenderId}/pricing-approval`, payload);
      if (alternatives) {
        const nextForm = buildInitialForm(tenderId, alternatives, response);
        setForm(nextForm);
        setLastSavedSignature(JSON.stringify(nextForm));
      }
      setTender((current) =>
        current
          ? {
              ...current,
              status: response.status === "approved" ? "APPROVED" : "PENDING_APPROVAL",
            }
          : current,
      );

      setMessage(
        mode === "draft"
          ? "Pricing approval saved."
          : mode === "approve"
            ? "Tender approved. At least one approved scenario is now locked in for this tender."
            : "Pricing approval saved. Scenario decisions are now reflected on the tender.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save pricing approval.");
    } finally {
      setSaveMode(null);
    }
  };

  return (
    <div className="space-y-6">
      <TenderWorkflowStepper
        currentStep={6}
        currentStepCompleted={tender?.status === "APPROVED"}
        tenderId={tenderId}
        isDirty={isDirty}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Pricing Approval</CardTitle>
              <CardDescription>
                Review every pricing scenario and mark each one as pending, approved, or denied.
              </CardDescription>
            </div>
            <Badge variant="warning">{tender?.status ?? "PENDING_APPROVAL"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="rounded-2xl bg-slate-50 p-6 text-sm text-muted-foreground">
              Loading pricing approval...
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}

          {!isLoading && form ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Tender</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{tender?.tenderNumber || tenderId}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Scenarios</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{decisionCounts.total}</p>
                </div>
                <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-emerald-700/80">Approved</p>
                  <p className="mt-2 text-sm font-semibold text-emerald-800">{decisionCounts.approved}</p>
                </div>
                <div className="rounded-2xl bg-amber-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-amber-700/80">Pending</p>
                  <p className="mt-2 text-sm font-semibold text-amber-800">{decisionCounts.pending}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Approved Total</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(approvedTotal)}</p>
                </div>
              </div>

              <Card className="border-border/80 shadow-none">
                <CardHeader>
                  <div className="grid w-full gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                    <div>
                      <CardTitle>Scenario Comparison</CardTitle>
                      <CardDescription>
                        Review the same scenario comparison used in Alternatives and add approval decisions with notes.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scenario</TableHead>
                        <TableHead>Profit %</TableHead>
                        <TableHead>Customer Comm. %</TableHead>
                        <TableHead>Sales Comm.</TableHead>
                        <TableHead>Order Cost</TableHead>
                        <TableHead>Order Price</TableHead>
                        <TableHead>Order Profit</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="min-w-[16rem]">Approval Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {form.decisions.map((decision) => (
                        <TableRow key={decision.scenarioId}>
                          <TableCell className="font-medium text-slate-900">
                            <div className="space-y-2">
                              <span>{decision.label || "Unnamed scenario"}</span>
                              <Badge variant={getStatusTone(decision.status)}>{decision.status.toUpperCase()}</Badge>
                            </div>
                          </TableCell>
                          <TableCell>{formatPercent(decision.profitPercent)}</TableCell>
                          <TableCell>{formatPercent(decision.customerCommissionPercent)}</TableCell>
                          <TableCell>{formatSalesCommission(decision)}</TableCell>
                          <TableCell>{formatCurrency(decision.totalCost ?? orderTotalCost)}</TableCell>
                          <TableCell>{formatCurrency(decision.totalPrice)}</TableCell>
                          <TableCell>
                            {formatCurrency(calculateProfit(decision.totalPrice, decision.totalCost ?? orderTotalCost))}
                          </TableCell>
                          <TableCell>
                            <div className="flex min-w-[8rem] flex-col gap-2">
                              <Button
                                className={cn("justify-start", getStatusButtonClassName("pending", decision.status === "pending"))}
                                onClick={() => updateDecision(decision.scenarioId, { status: "pending" })}
                                type="button"
                                variant="outline"
                              >
                                <Clock3 className="h-4 w-4" />
                                Pending
                              </Button>
                              <Button
                                className={cn("justify-start", getStatusButtonClassName("approved", decision.status === "approved"))}
                                onClick={() => updateDecision(decision.scenarioId, { status: "approved" })}
                                type="button"
                                variant="outline"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                Approve
                              </Button>
                              <Button
                                className={cn("justify-start", getStatusButtonClassName("denied", decision.status === "denied"))}
                                onClick={() => updateDecision(decision.scenarioId, { status: "denied" })}
                                type="button"
                                variant="outline"
                              >
                                <XCircle className="h-4 w-4" />
                                Deny
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Textarea
                              rows={3}
                              value={decision.notes}
                              onChange={(event) => updateDecision(decision.scenarioId, { notes: event.target.value })}
                              placeholder="Reason for approval, hold, or rejection"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <label className="space-y-2 text-sm font-medium text-slate-700">
                Overall Notes
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => (current ? { ...current, notes: event.target.value } : current))
                  }
                  placeholder="Summary comments for the overall approval decision"
                />
              </label>

              <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-4">
                <Button
                  onClick={() => {
                    if (!confirmDiscardUnsavedChanges(isDirty)) {
                      return;
                    }

                    navigate(`/tenders/${tenderId}/alternatives`);
                  }}
                  type="button"
                  variant="outline"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => void save("draft")}
                    type="button"
                    variant="outline"
                  >
                    <Save className="h-4 w-4" />
                    {saveMode === "draft" ? "Saving..." : "Save Draft"}
                  </Button>
                  <Button onClick={() => void save("final")} type="button">
                    <CheckCircle2 className="h-4 w-4" />
                    {saveMode === "final" ? "Saving..." : "Save Approval"}
                  </Button>
                  <Button
                    disabled={!hasApprovedScenario || saveMode === "approve"}
                    onClick={() => void save("approve")}
                    type="button"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {saveMode === "approve" ? "Approving..." : "Approve Tender"}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

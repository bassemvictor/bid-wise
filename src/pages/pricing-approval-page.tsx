import { ArrowLeft, CheckCircle2, Clock3, Save, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type {
  PricingApproval,
  PricingApprovalDecisionStatus,
  ScenarioAlternative,
  TenderRequest,
} from "../../shared/types";
import { TenderWorkflowStepper } from "../components/tenders/tender-workflow-stepper";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Textarea } from "../components/ui/textarea";
import { api, ApiError, isApiConfigured } from "../lib/api";
import { cn } from "../lib/utils";

type DecisionForm = {
  scenarioId: string;
  label: string;
  status: PricingApprovalDecisionStatus;
  profitPercent: number | null;
  factorOfSafetyPercent: number | null;
  customerCommissionPercent: number | null;
  salesPersonCommissionPercent: number | null;
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
        factorOfSafetyPercent: scenario.factorOfSafetyPercent,
        customerCommissionPercent: scenario.customerCommissionPercent,
        salesPersonCommissionPercent: scenario.salesPersonCommissionPercent,
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

export const PricingApprovalPage = () => {
  const navigate = useNavigate();
  const { tenderId = "" } = useParams();
  const [tender, setTender] = useState<TenderRequest | null>(null);
  const [alternatives, setAlternatives] = useState<ScenarioAlternative | null>(null);
  const [form, setForm] = useState<PricingApprovalForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saveMode, setSaveMode] = useState<"draft" | "final" | "approve" | null>(null);

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
        const [loadedTender, loadedAlternatives, savedApproval] = await Promise.all([
          api.get<TenderRequest>(`/tenders/${tenderId}?tenantId=alimex-demo`),
          api.get<ScenarioAlternative>(`/tenders/${tenderId}/alternatives?tenantId=alimex-demo`),
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
        setAlternatives(loadedAlternatives);
        setForm(buildInitialForm(tenderId, loadedAlternatives, savedApproval));
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

  const orderTotalCost = useMemo(
    () =>
      alternatives?.baseCostPerBag !== null &&
      alternatives?.baseCostPerBag !== undefined &&
      alternatives?.quantity !== null &&
      alternatives?.quantity !== undefined
        ? alternatives.baseCostPerBag * alternatives.quantity
        : null,
    [alternatives],
  );

  const hasApprovedScenario = decisionCounts.approved > 0;

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
        setForm(buildInitialForm(tenderId, alternatives, response));
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

              <div className="space-y-4">
                {form.decisions.map((decision) => (
                  <div key={decision.scenarioId} className="rounded-[1.35rem] border border-border bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-slate-900">{decision.label || "Unnamed scenario"}</h3>
                          <Badge variant={getStatusTone(decision.status)}>{decision.status.toUpperCase()}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                          <span>Total Cost: {formatCurrency(orderTotalCost)}</span>
                          <span>Total Price: {formatCurrency(decision.totalPrice)}</span>
                          <span>
                            Profit: {formatCurrency(
                              decision.totalPrice !== null && orderTotalCost !== null
                                ? decision.totalPrice - orderTotalCost
                                : null,
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          className={cn("min-w-[7.5rem]", getStatusButtonClassName("pending", decision.status === "pending"))}
                          onClick={() => updateDecision(decision.scenarioId, { status: "pending" })}
                          type="button"
                          variant="outline"
                        >
                          <Clock3 className="h-4 w-4" />
                          Pending
                        </Button>
                        <Button
                          className={cn("min-w-[7.5rem]", getStatusButtonClassName("approved", decision.status === "approved"))}
                          onClick={() => updateDecision(decision.scenarioId, { status: "approved" })}
                          type="button"
                          variant="outline"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          className={cn("min-w-[7.5rem]", getStatusButtonClassName("denied", decision.status === "denied"))}
                          onClick={() => updateDecision(decision.scenarioId, { status: "denied" })}
                          type="button"
                          variant="outline"
                        >
                          <XCircle className="h-4 w-4" />
                          Deny
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[repeat(2,minmax(0,1fr))_minmax(16rem,1.4fr)]">
                      <div className="rounded-2xl border border-border bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Profit %</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{formatPercent(decision.profitPercent)}</p>
                      </div>
                      <div className="rounded-2xl border border-border bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Factor of Safety %</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatPercent(decision.factorOfSafetyPercent)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Customer Commission %</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatPercent(decision.customerCommissionPercent)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Sales Commission %</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatPercent(decision.salesPersonCommissionPercent)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Cost</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(orderTotalCost)}</p>
                      </div>
                      <div className="rounded-2xl border border-border bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Price</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(decision.totalPrice)}</p>
                      </div>
                      <div className="rounded-2xl border border-border bg-white px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Profit</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {formatCurrency(
                            decision.totalPrice !== null && orderTotalCost !== null
                              ? decision.totalPrice - orderTotalCost
                              : null,
                          )}
                        </p>
                      </div>
                      <label className="space-y-2 text-sm font-medium text-slate-700 lg:col-span-2">
                        Approval Notes
                        <Textarea
                          rows={2}
                          value={decision.notes}
                          onChange={(event) => updateDecision(decision.scenarioId, { notes: event.target.value })}
                          placeholder="Reason for approval, hold, or rejection"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

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
                <Button onClick={() => navigate(`/tenders/${tenderId}/alternatives`)} type="button" variant="outline">
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

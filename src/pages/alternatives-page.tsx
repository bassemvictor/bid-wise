import { ArrowLeft, ArrowRight, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { TenderWorkflowStepper } from "../components/tenders/tender-workflow-stepper";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { api, ApiError, isApiConfigured } from "../lib/api";
import type { CostBuildUp, ScenarioAlternative, TenderRequest } from "../../shared/types";

type AlternativeScenarioForm = {
  scenarioId: string;
  label: string;
  profitPercent: string;
  factorOfSafetyPercent: string;
  customerCommissionPercent: string;
  salesPersonCommissionPercent: string;
  pricePerBag: string;
  totalPrice: string;
  notes: string;
};

type AlternativesForm = {
  tenantId: string;
  tenderId: string;
  alternativeId: string;
  currency: "EGP";
  quantity: string;
  baseCostPerBag: string;
  notes: string;
  scenarios: AlternativeScenarioForm[];
};

type ScenarioDrawerState = {
  mode: "add" | "edit";
  scenarioId: string;
};

type CalculatedScenario = {
  scenarioId: string;
  label: string;
  profitPercent: number | null;
  factorOfSafetyPercent: number | null;
  customerCommissionPercent: number | null;
  salesPersonCommissionPercent: number | null;
  markupPercent: number | null;
  marginPercent: number | null;
  pricePerBag: number | null;
  totalCost: number | null;
  profitValue: number | null;
  totalPrice: number | null;
  notes: string;
};

const numberOrNull = (value: string) => {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatMetric = (value: number | null, digits = 2, suffix = "") =>
  value === null || !Number.isFinite(value)
    ? "Not calculated"
    : `${value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}${suffix}`;

const createScenario = (index: number): AlternativeScenarioForm => ({
  scenarioId: crypto.randomUUID(),
  label: `Scenario ${index + 1}`,
  profitPercent: "",
  factorOfSafetyPercent: "",
  customerCommissionPercent: "",
  salesPersonCommissionPercent: "",
  pricePerBag: "",
  totalPrice: "",
  notes: "",
});

const initialForm = (tenderId: string): AlternativesForm => ({
  tenantId: "alimex-demo",
  tenderId,
  alternativeId: "base",
  currency: "EGP",
  quantity: "",
  baseCostPerBag: "",
  notes: "",
  scenarios: [createScenario(0)],
});

const toForm = (payload: ScenarioAlternative): AlternativesForm => ({
  tenantId: payload.tenantId,
  tenderId: payload.tenderId,
  alternativeId: payload.alternativeId,
  currency: payload.currency,
  quantity: payload.quantity?.toString() ?? "",
  baseCostPerBag: payload.baseCostPerBag?.toString() ?? "",
  notes: payload.notes ?? "",
  scenarios:
    payload.scenarios.length > 0
      ? payload.scenarios.map((scenario) => ({
          scenarioId: scenario.scenarioId,
          label: scenario.label,
          profitPercent: scenario.profitPercent?.toString() ?? "",
          factorOfSafetyPercent: scenario.factorOfSafetyPercent?.toString() ?? "",
          customerCommissionPercent: scenario.customerCommissionPercent?.toString() ?? "",
          salesPersonCommissionPercent: scenario.salesPersonCommissionPercent?.toString() ?? "",
          pricePerBag: scenario.pricePerBag?.toString() ?? "",
          totalPrice: scenario.totalPrice?.toString() ?? "",
          notes: scenario.notes ?? "",
        }))
      : [createScenario(0)],
});

const ScenarioDrawer = ({
  state,
  draft,
  preview,
  onClose,
  onSave,
  onDelete,
  onUpdate,
}: {
  state: ScenarioDrawerState | null;
  draft: AlternativeScenarioForm | null;
  preview: CalculatedScenario | null;
  onClose: () => void;
  onSave: () => void;
  onDelete: (() => void) | null;
  onUpdate: (patch: Partial<AlternativeScenarioForm>) => void;
}) => {
  if (!state || !draft || !preview) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/30">
      <button
        aria-label="Close scenario drawer overlay"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <aside className="relative z-10 flex h-full w-full flex-col border-l border-border bg-white shadow-2xl sm:max-w-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {state.mode === "add" ? "Add Scenario" : "Edit Scenario"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Fine-tune the pricing assumptions for this scenario here.
            </p>
          </div>
          <button
            className="rounded-xl border border-border bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-border bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Markup</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {formatMetric(preview.markupPercent, 2, "%")}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Cost</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {formatMetric(preview.totalCost, 2, " EGP")}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Price</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {formatMetric(preview.totalPrice, 2, " EGP")}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
                Scenario Name
                <Input
                  value={draft.label}
                  onChange={(event) => onUpdate({ label: event.target.value })}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Profit %
                <Input
                  inputMode="decimal"
                  value={draft.profitPercent}
                  onChange={(event) => onUpdate({ profitPercent: event.target.value })}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Factor of Safety %
                <Input
                  inputMode="decimal"
                  value={draft.factorOfSafetyPercent}
                  onChange={(event) => onUpdate({ factorOfSafetyPercent: event.target.value })}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Customer Commission %
                <Input
                  inputMode="decimal"
                  value={draft.customerCommissionPercent}
                  onChange={(event) => onUpdate({ customerCommissionPercent: event.target.value })}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Sales Person Commission %
                <Input
                  inputMode="decimal"
                  value={draft.salesPersonCommissionPercent}
                  onChange={(event) => onUpdate({ salesPersonCommissionPercent: event.target.value })}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
                Notes
                <Textarea
                  rows={4}
                  value={draft.notes}
                  onChange={(event) => onUpdate({ notes: event.target.value })}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              Save this scenario to update the summary and comparison below.
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {onDelete ? (
                <Button onClick={onDelete} type="button" variant="ghost">
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              ) : null}
              <Button onClick={onClose} type="button" variant="outline">
                Cancel
              </Button>
              <Button onClick={onSave} type="button">
                Save Scenario
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

export const AlternativesPage = () => {
  const navigate = useNavigate();
  const { tenderId = "" } = useParams();
  const [form, setForm] = useState<AlternativesForm>(() => initialForm(tenderId));
  const [tender, setTender] = useState<TenderRequest | null>(null);
  const [costBuildUp, setCostBuildUp] = useState<CostBuildUp | null>(null);
  const [drawerState, setDrawerState] = useState<ScenarioDrawerState | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [saveMode, setSaveMode] = useState<"draft" | "continue" | null>(null);

  useEffect(() => {
    setForm(initialForm(tenderId));
  }, [tenderId]);

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
        const [loadedTender, loadedCostBuildUp, saved] = await Promise.all([
          api.get<TenderRequest>(`/tenders/${tenderId}?tenantId=alimex-demo`),
          api
            .get<CostBuildUp>(`/tenders/${tenderId}/cost-build-up?tenantId=alimex-demo`)
            .catch((reason) => {
              if (reason instanceof ApiError && reason.status === 404) {
                return null;
              }

              throw reason;
            }),
          api
            .get<ScenarioAlternative>(`/tenders/${tenderId}/alternatives?tenantId=alimex-demo`)
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

        if (!loadedCostBuildUp) {
          setError("Complete Cost Build-Up before preparing alternatives.");
        }

        if (saved) {
          setForm(toForm(saved));
          return;
        }

        setForm({
          ...initialForm(tenderId),
          tenantId: loadedTender.tenantId,
          quantity: loadedCostBuildUp?.quantity?.toString() ?? "",
          baseCostPerBag: loadedCostBuildUp?.totalCostPricePerBag?.toString() ?? "",
        });
      } catch (reason) {
        if (isMounted) {
          setError(reason instanceof Error ? reason.message : "Unable to load alternatives.");
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

  const quantity = numberOrNull(form.quantity);
  const baseCostPerBag = numberOrNull(form.baseCostPerBag);

  const scenarios = useMemo(
    (): CalculatedScenario[] =>
      form.scenarios.map((scenario) => {
        const profitPercent = numberOrNull(scenario.profitPercent) ?? 0;
        const factorOfSafetyPercent = numberOrNull(scenario.factorOfSafetyPercent) ?? 0;
        const customerCommissionPercent = numberOrNull(scenario.customerCommissionPercent) ?? 0;
        const salesPersonCommissionPercent = numberOrNull(scenario.salesPersonCommissionPercent) ?? 0;
        const markupPercent =
          profitPercent +
          factorOfSafetyPercent +
          customerCommissionPercent +
          salesPersonCommissionPercent;
        const pricePerBag =
          baseCostPerBag !== null ? baseCostPerBag * (1 + markupPercent / 100) : null;
        const totalCost =
          baseCostPerBag !== null && quantity !== null ? baseCostPerBag * quantity : null;
        const totalPrice =
          pricePerBag !== null && quantity !== null ? pricePerBag * quantity : null;
        const profitValue =
          totalPrice !== null && totalCost !== null ? totalPrice - totalCost : null;
        const marginPercent =
          pricePerBag !== null && baseCostPerBag !== null && pricePerBag > 0
            ? ((pricePerBag - baseCostPerBag) / pricePerBag) * 100
            : null;

        return {
          ...scenario,
          profitPercent,
          factorOfSafetyPercent,
          customerCommissionPercent,
          salesPersonCommissionPercent,
          markupPercent,
          marginPercent,
          pricePerBag,
          totalCost,
          profitValue,
          totalPrice,
        };
      }),
    [baseCostPerBag, form.scenarios, quantity],
  );

  const activeDrawerScenario = useMemo(
    () =>
      drawerState
        ? form.scenarios.find((scenario) => scenario.scenarioId === drawerState.scenarioId) ?? null
        : null,
    [drawerState, form.scenarios],
  );

  const activeDrawerPreview = useMemo(
    () =>
      drawerState
        ? scenarios.find((scenario) => scenario.scenarioId === drawerState.scenarioId) ?? null
        : null,
    [drawerState, scenarios],
  );

  const updateScenario = (scenarioId: string, patch: Partial<AlternativeScenarioForm>) => {
    setForm((current) => ({
      ...current,
      scenarios: current.scenarios.map((scenario) =>
        scenario.scenarioId === scenarioId ? { ...scenario, ...patch } : scenario,
      ),
    }));
  };

  const addScenario = () => {
    const nextScenario = createScenario(form.scenarios.length);
    setForm((current) => ({
      ...current,
      scenarios: [...current.scenarios, nextScenario],
    }));
    setDrawerState({
      mode: "add",
      scenarioId: nextScenario.scenarioId,
    });
  };

  const removeScenario = (scenarioId: string) => {
    setForm((current) => ({
      ...current,
      scenarios:
        current.scenarios.length === 1
          ? current.scenarios
          : current.scenarios.filter((scenario) => scenario.scenarioId !== scenarioId),
    }));
  };

  const openScenarioDrawer = (scenarioId: string) => {
    setDrawerState({
      mode: "edit",
      scenarioId,
    });
  };

  const closeScenarioDrawer = () => {
    if (drawerState?.mode === "add") {
      const scenario = form.scenarios.find((entry) => entry.scenarioId === drawerState.scenarioId);
      const isBlank =
        scenario &&
        !scenario.profitPercent.trim() &&
        !scenario.factorOfSafetyPercent.trim() &&
        !scenario.customerCommissionPercent.trim() &&
        !scenario.salesPersonCommissionPercent.trim() &&
        !scenario.notes.trim() &&
        scenario.label.trim() === `Scenario ${form.scenarios.length}`;

      if (isBlank && form.scenarios.length > 1) {
        removeScenario(drawerState.scenarioId);
      }
    }

    setDrawerState(null);
  };

  const payload = useMemo<ScenarioAlternative>(
    () => ({
      entityType: "ScenarioAlternative",
      tenantId: form.tenantId,
      tenderId,
      alternativeId: form.alternativeId,
      currency: form.currency,
      quantity,
      baseCostPerBag,
      notes: form.notes.trim(),
      scenarios: scenarios.map((scenario) => ({
        scenarioId: scenario.scenarioId,
        label: scenario.label.trim(),
        profitPercent: scenario.profitPercent,
        factorOfSafetyPercent: scenario.factorOfSafetyPercent,
        customerCommissionPercent: scenario.customerCommissionPercent,
        salesPersonCommissionPercent: scenario.salesPersonCommissionPercent,
        pricePerBag: scenario.pricePerBag,
        totalPrice: scenario.totalPrice,
        notes: scenario.notes.trim(),
      })),
      createdAt: "",
      updatedAt: "",
    }),
    [baseCostPerBag, form.alternativeId, form.currency, form.notes, form.tenantId, quantity, scenarios, tenderId],
  );

  const validate = () => {
    if (baseCostPerBag === null || quantity === null) {
      setError("Cost Build-Up must provide a base cost per bag and quantity before alternatives can be saved.");
      return false;
    }

    if (form.scenarios.some((scenario) => !scenario.label.trim())) {
      setError("Each scenario needs a scenario name.");
      return false;
    }

    return true;
  };

  const saveDrawerScenario = () => {
    if (!activeDrawerScenario?.label.trim()) {
      setError("Each scenario needs a scenario name.");
      return;
    }

    setError("");
    setDrawerState(null);
  };

  const removeDrawerScenario = () => {
    if (!drawerState) {
      return;
    }

    removeScenario(drawerState.scenarioId);
    setDrawerState(null);
  };

  const save = async (mode: "draft" | "continue") => {
    setError("");
    setMessage("");
    setSaveMode(mode);

    if (!isApiConfigured) {
      setError("Set VITE_API_BASE_URL before saving alternatives.");
      setSaveMode(null);
      return;
    }

    if (!validate()) {
      setSaveMode(null);
      return;
    }

    try {
      const response = await api.put<ScenarioAlternative>(
        `/tenders/${tenderId}/alternatives`,
        payload,
      );

      setForm(toForm(response));
      setMessage(mode === "draft" ? "Alternatives saved." : "Alternatives saved. Continuing to pricing approval.");

      if (mode === "continue") {
        navigate(`/tenders/${tenderId}/pricing-approval`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save alternatives.");
    } finally {
      setSaveMode(null);
    }
  };

  return (
    <div className="space-y-6">
      <TenderWorkflowStepper currentStep={5} tenderId={tenderId} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Alternatives</CardTitle>
            <CardDescription>
              Build one or more pricing scenarios from the current cost build-up using profit, safety, and commission assumptions.
            </CardDescription>
          </div>
          <Badge variant="default">ALTERNATIVES</Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="rounded-2xl bg-slate-50 p-6 text-sm text-muted-foreground">
              Loading alternatives...
            </div>
          ) : null}

          {!isLoading ? (
            <>
              <Card className="border-border/80 shadow-none">
                <CardHeader>
                  <div className="grid w-full gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                    <div>
                      <CardTitle>Scenario Comparison</CardTitle>
                      <CardDescription>
                        Side-by-side comparison of final price per bag and total order value for each scenario.
                      </CardDescription>
                    </div>
                    <Button className="justify-self-end" onClick={addScenario} type="button">
                      <Plus className="h-4 w-4" />
                      Add Scenario
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scenario</TableHead>
                        <TableHead>Profit %</TableHead>
                        <TableHead>Safety %</TableHead>
                        <TableHead>Customer Comm. %</TableHead>
                        <TableHead>Sales Comm. %</TableHead>
                        <TableHead>Order Cost</TableHead>
                        <TableHead>Order Price</TableHead>
                        <TableHead>Order Profit</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scenarios.map((scenario) => (
                        <TableRow key={scenario.scenarioId}>
                          <TableCell className="font-medium text-slate-900">{scenario.label || "Unnamed scenario"}</TableCell>
                          <TableCell>{formatMetric(scenario.profitPercent, 2, "%")}</TableCell>
                          <TableCell>{formatMetric(scenario.factorOfSafetyPercent, 2, "%")}</TableCell>
                          <TableCell>{formatMetric(scenario.customerCommissionPercent, 2, "%")}</TableCell>
                          <TableCell>{formatMetric(scenario.salesPersonCommissionPercent, 2, "%")}</TableCell>
                          <TableCell>{formatMetric(scenario.totalCost, 2, " EGP")}</TableCell>
                          <TableCell>{formatMetric(scenario.totalPrice, 2, " EGP")}</TableCell>
                          <TableCell>{formatMetric(scenario.profitValue, 2, " EGP")}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                aria-label={`Edit ${scenario.label || "scenario"}`}
                                className="h-9 w-9 px-0"
                                onClick={() => openScenarioDrawer(scenario.scenarioId)}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                aria-label={`Delete ${scenario.label || "scenario"}`}
                                className="h-9 w-9 px-0"
                                onClick={() => removeScenario(scenario.scenarioId)}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <label className="space-y-2 text-sm font-medium text-slate-700">
                Alternative Notes
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>
            </>
          ) : null}

          <div className="flex flex-col gap-4 rounded-[1.2rem] border border-border bg-white p-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm">
              {message ? <p className="mt-2 text-emerald-600">{message}</p> : null}
              {error ? <p className="mt-2 text-rose-600">{error}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="ghost" onClick={() => navigate(`/tenders/${tenderId}/cost-build-up`)}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button type="button" variant="outline" disabled={saveMode !== null} onClick={() => void save("draft")}>
                <Save className="h-4 w-4" />
                {saveMode === "draft" ? "Saving..." : "Save Draft"}
              </Button>
              <Button type="button" disabled={saveMode !== null} onClick={() => void save("continue")}>
                <ArrowRight className="h-4 w-4" />
                {saveMode === "continue" ? "Saving..." : "Next: Pricing Approval"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ScenarioDrawer
        state={drawerState}
        draft={activeDrawerScenario}
        preview={activeDrawerPreview}
        onClose={closeScenarioDrawer}
        onDelete={form.scenarios.length > 1 && drawerState?.mode === "edit" ? removeDrawerScenario : null}
        onSave={saveDrawerScenario}
        onUpdate={(patch) => {
          if (!drawerState) {
            return;
          }

          updateScenario(drawerState.scenarioId, patch);
        }}
      />
    </div>
  );
};

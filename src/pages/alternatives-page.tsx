import { ArrowLeft, ArrowRight, Plus, Save, Trash2 } from "lucide-react";
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

export const AlternativesPage = () => {
  const navigate = useNavigate();
  const { tenderId = "" } = useParams();
  const [form, setForm] = useState<AlternativesForm>(() => initialForm(tenderId));
  const [tender, setTender] = useState<TenderRequest | null>(null);
  const [costBuildUp, setCostBuildUp] = useState<CostBuildUp | null>(null);
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
    () =>
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
        const totalPrice =
          pricePerBag !== null && quantity !== null ? pricePerBag * quantity : null;

        return {
          ...scenario,
          profitPercent,
          factorOfSafetyPercent,
          customerCommissionPercent,
          salesPersonCommissionPercent,
          markupPercent,
          pricePerBag,
          totalPrice,
        };
      }),
    [baseCostPerBag, form.scenarios, quantity],
  );

  const topScenario = useMemo(
    () =>
      [...scenarios]
        .filter((scenario) => scenario.pricePerBag !== null)
        .sort((left, right) => (right.pricePerBag ?? 0) - (left.pricePerBag ?? 0))[0] ?? null,
    [scenarios],
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
    setForm((current) => ({
      ...current,
      scenarios: [...current.scenarios, createScenario(current.scenarios.length)],
    }));
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
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Tender</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{tender?.tenderNumber || tenderId}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Quantity</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatMetric(quantity, 0, " bags")}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Base Cost / Bag</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatMetric(baseCostPerBag, 2, " EGP")}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Top Scenario</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{topScenario?.label || "Not set"}</p>
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Scenario Builder</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Create one or more alternatives and compare the resulting bag price and total order value.
                    </p>
                  </div>
                  <Button onClick={addScenario} type="button">
                    <Plus className="h-4 w-4" />
                    Add Scenario
                  </Button>
                </div>

                <div className="space-y-4">
                  {scenarios.map((scenario, index) => (
                    <div key={scenario.scenarioId} className="rounded-2xl border border-border bg-white p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {scenario.label || `Scenario ${index + 1}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Total markup: {formatMetric(scenario.markupPercent, 2, "%")}
                          </p>
                        </div>
                        <Button
                          onClick={() => removeScenario(scenario.scenarioId)}
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <label className="space-y-2 text-sm font-medium text-slate-700 xl:col-span-2">
                          Scenario Name
                          <Input
                            value={scenario.label}
                            onChange={(event) => updateScenario(scenario.scenarioId, { label: event.target.value })}
                          />
                        </label>
                        <label className="space-y-2 text-sm font-medium text-slate-700">
                          Profit %
                          <Input
                            inputMode="decimal"
                            value={form.scenarios.find((entry) => entry.scenarioId === scenario.scenarioId)?.profitPercent ?? ""}
                            onChange={(event) => updateScenario(scenario.scenarioId, { profitPercent: event.target.value })}
                          />
                        </label>
                        <label className="space-y-2 text-sm font-medium text-slate-700">
                          Factor of Safety %
                          <Input
                            inputMode="decimal"
                            value={form.scenarios.find((entry) => entry.scenarioId === scenario.scenarioId)?.factorOfSafetyPercent ?? ""}
                            onChange={(event) =>
                              updateScenario(scenario.scenarioId, { factorOfSafetyPercent: event.target.value })
                            }
                          />
                        </label>
                        <label className="space-y-2 text-sm font-medium text-slate-700">
                          Customer Commission %
                          <Input
                            inputMode="decimal"
                            value={form.scenarios.find((entry) => entry.scenarioId === scenario.scenarioId)?.customerCommissionPercent ?? ""}
                            onChange={(event) =>
                              updateScenario(scenario.scenarioId, { customerCommissionPercent: event.target.value })
                            }
                          />
                        </label>
                        <label className="space-y-2 text-sm font-medium text-slate-700">
                          Sales Person Commission %
                          <Input
                            inputMode="decimal"
                            value={form.scenarios.find((entry) => entry.scenarioId === scenario.scenarioId)?.salesPersonCommissionPercent ?? ""}
                            onChange={(event) =>
                              updateScenario(scenario.scenarioId, { salesPersonCommissionPercent: event.target.value })
                            }
                          />
                        </label>
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Price / Bag</p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {formatMetric(scenario.pricePerBag, 2, " EGP")}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Price</p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {formatMetric(scenario.totalPrice, 2, " EGP")}
                          </p>
                        </div>
                        <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-5">
                          Notes
                          <Textarea
                            rows={2}
                            value={scenario.notes}
                            onChange={(event) => updateScenario(scenario.scenarioId, { notes: event.target.value })}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Card className="border-border/80 shadow-none">
                <CardHeader>
                  <div>
                    <CardTitle>Scenario Comparison</CardTitle>
                    <CardDescription>
                      Side-by-side comparison of final price per bag and total order value for each scenario.
                    </CardDescription>
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
                        <TableHead>Price / Bag</TableHead>
                        <TableHead>Total</TableHead>
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
                          <TableCell>{formatMetric(scenario.pricePerBag, 2, " EGP")}</TableCell>
                          <TableCell>{formatMetric(scenario.totalPrice, 2, " EGP")}</TableCell>
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
              <p className="font-medium text-slate-900">
                Save one or more scenarios here before moving to the pricing approval stage.
              </p>
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
    </div>
  );
};

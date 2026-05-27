import { ArrowLeft, ArrowRight, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { TenderWorkflowStepper } from "../components/tenders/tender-workflow-stepper";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { api, ApiError, isApiConfigured } from "../lib/api";
import { cn } from "../lib/utils";
import {
  confirmDiscardUnsavedChanges,
  useUnsavedChangesWarning,
} from "../lib/use-unsaved-changes";
import type {
  CostBuildUp,
  MaterialSourceSelection,
  ProductConfiguration,
  ScenarioAlternative,
  TenderRequest,
} from "../../shared/types";

type AlternativeScenarioForm = {
  scenarioId: string;
  label: string;
  profitPercent: string;
  customerCommissionPercent: string;
  salesPersonCommissionMode: "percent" | "fixed";
  salesPersonCommissionPercent: string;
  salesPersonCommissionFixedAmount: string;
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
  customerCommissionPercent: number | null;
  salesPersonCommissionMode: "percent" | "fixed";
  salesPersonCommissionPercent: number | null;
  salesPersonCommissionFixedAmount: number | null;
  markupPercent: number | null;
  marginPercent: number | null;
  pricePerBag: number | null;
  totalCost: number | null;
  profitValue: number | null;
  totalPrice: number | null;
  notes: string;
};

const productOverheadLineCode = (baseCode: "F" | "G" | "G2", productId: string) =>
  `${baseCode}::${productId}`;

const numberOrNull = (value: string) => {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const divideOrNull = (total: number | null, count: number | null) => {
  if (
    total === null ||
    count === null ||
    !Number.isFinite(total) ||
    !Number.isFinite(count) ||
    count === 0
  ) {
    return null;
  }

  return total / count;
};

const formatMetric = (value: number | null, digits = 2, suffix = "") =>
  value === null || !Number.isFinite(value)
    ? "Not calculated"
    : `${value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}${suffix}`;

type SalesCommissionDefaults = {
  salesPersonCommissionMode: "percent" | "fixed";
  salesPersonCommissionPercent: string;
  salesPersonCommissionFixedAmount: string;
};

const defaultSalesCommissionDefaults: SalesCommissionDefaults = {
  salesPersonCommissionMode: "percent",
  salesPersonCommissionPercent: "",
  salesPersonCommissionFixedAmount: "",
};

const inferSalesCommissionDefaults = (
  tender: TenderRequest | null,
  costBuildUp: CostBuildUp | null,
): SalesCommissionDefaults => {
  const percentValue =
    tender?.salesPercentage ??
    costBuildUp?.costLines.find((line) => line.code === "H_PERCENT")?.costPerBag ??
    null;
  const fixedValue =
    tender?.salesFixed ??
    costBuildUp?.costLines.find((line) => line.code === "H_FIXED")?.costPerBag ??
    null;

  return {
    salesPersonCommissionMode:
      fixedValue !== null && fixedValue !== undefined ? "fixed" : "percent",
    salesPersonCommissionPercent: percentValue?.toString() ?? "",
    salesPersonCommissionFixedAmount: fixedValue?.toString() ?? "",
  };
};

const formatSalesCommission = (scenario: {
  salesPersonCommissionMode: "percent" | "fixed";
  salesPersonCommissionPercent: number | null;
  salesPersonCommissionFixedAmount: number | null;
}) =>
  scenario.salesPersonCommissionMode === "fixed"
    ? formatMetric(scenario.salesPersonCommissionFixedAmount, 2, " EGP")
    : formatMetric(scenario.salesPersonCommissionPercent, 2, "%");

const createScenario = (
  index: number,
  defaults: SalesCommissionDefaults = defaultSalesCommissionDefaults,
): AlternativeScenarioForm => ({
  scenarioId: crypto.randomUUID(),
  label: `Scenario ${index + 1}`,
  profitPercent: "",
  customerCommissionPercent: "",
  salesPersonCommissionMode: defaults.salesPersonCommissionMode,
  salesPersonCommissionPercent: defaults.salesPersonCommissionPercent,
  salesPersonCommissionFixedAmount: defaults.salesPersonCommissionFixedAmount,
  pricePerBag: "",
  totalPrice: "",
  notes: "",
});

const initialForm = (
  tenderId: string,
  salesDefaults: SalesCommissionDefaults = defaultSalesCommissionDefaults,
): AlternativesForm => ({
  tenantId: "alimex-demo",
  tenderId,
  alternativeId: "base",
  currency: "EGP",
  quantity: "",
  baseCostPerBag: "",
  notes: "",
  scenarios: [createScenario(0, salesDefaults)],
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
          customerCommissionPercent: scenario.customerCommissionPercent?.toString() ?? "",
          salesPersonCommissionMode: scenario.salesPersonCommissionMode ?? "percent",
          salesPersonCommissionPercent: scenario.salesPersonCommissionPercent?.toString() ?? "",
          salesPersonCommissionFixedAmount: scenario.salesPersonCommissionFixedAmount?.toString() ?? "",
          pricePerBag: scenario.pricePerBag?.toString() ?? "",
          totalPrice: scenario.totalPrice?.toString() ?? "",
          notes: scenario.notes ?? "",
        }))
      : [createScenario(0)],
});

const syncFormWithCostBuildUp = (
  form: AlternativesForm,
  costBuildUp: CostBuildUp | null,
): AlternativesForm => ({
  ...form,
  quantity: costBuildUp?.quantity?.toString() ?? form.quantity,
  baseCostPerBag: costBuildUp?.totalCostPricePerBag?.toString() ?? form.baseCostPerBag,
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
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5 sm:py-5">
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

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
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
                Customer Commission %
                <Input
                  inputMode="decimal"
                  value={draft.customerCommissionPercent}
                  onChange={(event) => onUpdate({ customerCommissionPercent: event.target.value })}
                />
              </label>
              <div className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Sales Commission</span>
                <div className="inline-flex rounded-xl border border-border bg-slate-50 p-1">
                  <button
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm transition-colors",
                      draft.salesPersonCommissionMode === "percent"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-muted-foreground hover:text-slate-900",
                    )}
                    onClick={() => onUpdate({ salesPersonCommissionMode: "percent" })}
                    type="button"
                  >
                    Percentage
                  </button>
                  <button
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm transition-colors",
                      draft.salesPersonCommissionMode === "fixed"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-muted-foreground hover:text-slate-900",
                    )}
                    onClick={() => onUpdate({ salesPersonCommissionMode: "fixed" })}
                    type="button"
                  >
                    Fixed
                  </button>
                </div>
                <Input
                  inputMode="decimal"
                  value={
                    draft.salesPersonCommissionMode === "percent"
                      ? draft.salesPersonCommissionPercent
                      : draft.salesPersonCommissionFixedAmount
                  }
                  onChange={(event) =>
                    onUpdate(
                      draft.salesPersonCommissionMode === "percent"
                        ? { salesPersonCommissionPercent: event.target.value }
                        : { salesPersonCommissionFixedAmount: event.target.value },
                    )
                  }
                />
              </div>
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

        <div className="border-t border-border px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Save this scenario to update the summary and comparison below.
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {onDelete ? (
                <Button className="w-full sm:w-auto" onClick={onDelete} type="button" variant="ghost">
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              ) : null}
              <Button className="w-full sm:w-auto" onClick={onClose} type="button" variant="outline">
                Cancel
              </Button>
              <Button className="w-full sm:w-auto" onClick={onSave} type="button">
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
  const [productConfiguration, setProductConfiguration] = useState<ProductConfiguration | null>(null);
  const [materialSourcing, setMaterialSourcing] = useState<MaterialSourceSelection | null>(null);
  const [drawerState, setDrawerState] = useState<ScenarioDrawerState | null>(null);
  const [costHelpScenarioId, setCostHelpScenarioId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [saveMode, setSaveMode] = useState<"draft" | "continue" | null>(null);
  const [lastSavedSignature, setLastSavedSignature] = useState(() =>
    JSON.stringify(initialForm(tenderId)),
  );

  useEffect(() => {
    setForm(initialForm(tenderId));
    setLastSavedSignature(JSON.stringify(initialForm(tenderId)));
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
        const [loadedTender, loadedCostBuildUp, loadedProductConfiguration, loadedMaterialSourcing, saved] = await Promise.all([
          api.get<TenderRequest>(`/tenders/${tenderId}?tenantId=alimex-demo`),
          api
            .get<CostBuildUp>(`/tenders/${tenderId}/cost-build-up?tenantId=alimex-demo`)
            .catch((reason) => {
              if (reason instanceof ApiError && reason.status === 404) {
                return null;
              }

              throw reason;
            }),
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
        setProductConfiguration(loadedProductConfiguration);
        setMaterialSourcing(loadedMaterialSourcing);

        if (!loadedCostBuildUp) {
          setError("Complete Cost Build-Up before preparing alternatives.");
        }

        if (saved) {
          const nextForm = syncFormWithCostBuildUp(toForm(saved), loadedCostBuildUp);
          setForm(nextForm);
          setLastSavedSignature(JSON.stringify(nextForm));
          return;
        }

        const salesDefaults = inferSalesCommissionDefaults(loadedTender, loadedCostBuildUp);
        const nextForm = syncFormWithCostBuildUp({
          ...initialForm(tenderId, salesDefaults),
          tenantId: loadedTender.tenantId,
        }, loadedCostBuildUp);
        setForm(nextForm);
        setLastSavedSignature(JSON.stringify(nextForm));
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
  const readCostLineValue = (code: string) =>
    costBuildUp?.costLines.find((line) => line.code === code)?.costPerBag ?? 0;
  const effectiveQuantity = costBuildUp?.quantity ?? quantity;
  const effectiveBaseCostPerBag = costBuildUp?.totalCostPricePerBag ?? baseCostPerBag;
  const salesCommissionDefaults = useMemo(
    () => inferSalesCommissionDefaults(tender, costBuildUp),
    [costBuildUp, tender],
  );
  const includedSalesCostPerBag = readCostLineValue("H");
  const productSnapshots = productConfiguration?.productSnapshots ?? [];
  const sourcingBreakdown = materialSourcing?.componentSelections ?? [];

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
        const operatingPerBag =
          factoryOverhead + manufacturingOverhead + managementOverhead + salesCost;
        const additionalPerBag = rushCost + transportationCost + installationCost;
        const totalPerBag = materialPerBag + operatingPerBag + additionalPerBag;

        return {
          productId: product.productId,
          totalPerBag,
        };
      }),
    [costBuildUp?.costLines, productSnapshots, sourcingBreakdown],
  );

  const orderTotalCost = useMemo(() => {
    if (!productSnapshots.length) {
      return costBuildUp?.totalCostPriceForOrder ?? null;
    }

    const total = productSnapshots.reduce((sum, product) => {
      const productSnapshot = productSnapshots.find((item) => item.productId === product.productId);
      const components = productSnapshot?.components ?? [];
      const productMaterialTotalCost = components.reduce((componentSum, component) => {
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
  }, [costBuildUp?.totalCostPriceForOrder, productCostCards, productSnapshots, sourcingBreakdown]);

  const baseIncludedSalesTotal = useMemo(
    () =>
      effectiveQuantity !== null && effectiveQuantity > 0
        ? includedSalesCostPerBag * effectiveQuantity
        : null,
    [effectiveQuantity, includedSalesCostPerBag],
  );

  const salesCommissionBasisTotal = useMemo(() => {
    if (effectiveQuantity === null || effectiveQuantity <= 0) {
      return null;
    }

    const materialPerBag = readCostLineValue("I_TOTAL");
    const manufacturingPerBag = readCostLineValue("G");
    const additionalPerBag = readCostLineValue("III_TOTAL");

    return (materialPerBag + manufacturingPerBag + additionalPerBag) * effectiveQuantity;
  }, [costBuildUp?.costLines, effectiveQuantity]);

  const scenarios = useMemo(
    (): CalculatedScenario[] =>
      form.scenarios.map((scenario) => {
        const profitPercent = numberOrNull(scenario.profitPercent) ?? 0;
        const customerCommissionPercent = numberOrNull(scenario.customerCommissionPercent) ?? 0;
        const salesPersonCommissionPercent = numberOrNull(scenario.salesPersonCommissionPercent) ?? 0;
        const salesPersonCommissionFixedAmount = numberOrNull(scenario.salesPersonCommissionFixedAmount) ?? 0;
        const percentageMarkup = profitPercent + customerCommissionPercent;
        const salesCommissionAmount =
          scenario.salesPersonCommissionMode === "fixed"
            ? salesPersonCommissionFixedAmount
            : salesCommissionBasisTotal !== null
              ? salesCommissionBasisTotal * (salesPersonCommissionPercent / 100)
              : null;
        const totalCost =
          orderTotalCost !== null
            ? orderTotalCost - (baseIncludedSalesTotal ?? 0) + (salesCommissionAmount ?? (baseIncludedSalesTotal ?? 0))
            : null;
        const totalPrice =
          totalCost !== null
            ? totalCost * (1 + percentageMarkup / 100)
            : null;
        const pricePerBag =
          totalPrice !== null && effectiveQuantity !== null && effectiveQuantity > 0
            ? totalPrice / effectiveQuantity
            : null;
        const profitValue =
          totalPrice !== null && totalCost !== null ? totalPrice - totalCost : null;
        const markupPercent =
          totalCost !== null && totalCost > 0 && totalPrice !== null
            ? ((totalPrice - totalCost) / totalCost) * 100
            : null;
        const marginPercent =
          pricePerBag !== null && effectiveBaseCostPerBag !== null && pricePerBag > 0
            ? ((pricePerBag - effectiveBaseCostPerBag) / pricePerBag) * 100
            : null;

        return {
          ...scenario,
          profitPercent,
          customerCommissionPercent,
          salesPersonCommissionMode: scenario.salesPersonCommissionMode,
          salesPersonCommissionPercent,
          salesPersonCommissionFixedAmount,
          markupPercent,
          marginPercent,
          pricePerBag,
          totalCost,
          profitValue,
          totalPrice,
        };
      }),
    [baseIncludedSalesTotal, effectiveBaseCostPerBag, effectiveQuantity, form.scenarios, orderTotalCost, salesCommissionBasisTotal],
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

  const activeCostHelpScenario = useMemo(
    () =>
      costHelpScenarioId
        ? scenarios.find((scenario) => scenario.scenarioId === costHelpScenarioId) ?? null
        : null,
    [costHelpScenarioId, scenarios],
  );
  const orderCostPerBag = divideOrNull(activeCostHelpScenario?.totalCost ?? null, effectiveQuantity);
  const orderPricePerBag = divideOrNull(activeCostHelpScenario?.totalPrice ?? null, effectiveQuantity);

  const updateScenario = (scenarioId: string, patch: Partial<AlternativeScenarioForm>) => {
    setForm((current) => ({
      ...current,
      scenarios: current.scenarios.map((scenario) =>
        scenario.scenarioId === scenarioId ? { ...scenario, ...patch } : scenario,
      ),
    }));
  };

  const addScenario = () => {
    const nextScenario = createScenario(form.scenarios.length, salesCommissionDefaults);
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
        !scenario.customerCommissionPercent.trim() &&
        !scenario.salesPersonCommissionPercent.trim() &&
        !scenario.salesPersonCommissionFixedAmount.trim() &&
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
      quantity: effectiveQuantity ?? costBuildUp?.quantity ?? quantity,
      baseCostPerBag: effectiveBaseCostPerBag,
      notes: form.notes.trim(),
      scenarios: scenarios.map((scenario) => ({
        scenarioId: scenario.scenarioId,
        label: scenario.label.trim(),
        profitPercent: scenario.profitPercent,
        customerCommissionPercent: scenario.customerCommissionPercent,
        salesPersonCommissionMode: scenario.salesPersonCommissionMode,
        salesPersonCommissionPercent: scenario.salesPersonCommissionPercent,
        salesPersonCommissionFixedAmount: scenario.salesPersonCommissionFixedAmount,
        totalCost: scenario.totalCost,
        pricePerBag: scenario.pricePerBag,
        totalPrice: scenario.totalPrice,
        notes: scenario.notes.trim(),
      })),
      createdAt: "",
      updatedAt: "",
    }),
    [costBuildUp, effectiveBaseCostPerBag, effectiveQuantity, form.alternativeId, form.currency, form.notes, form.tenantId, quantity, scenarios, tenderId],
  );
  const currentSignature = useMemo(() => JSON.stringify(form), [form]);
  const isDirty = currentSignature !== lastSavedSignature;

  useUnsavedChangesWarning(isDirty);

  const validate = () => {
    if (
      costBuildUp?.totalCostPricePerBag === null ||
      costBuildUp?.totalCostPricePerBag === undefined ||
      costBuildUp?.totalCostPriceForOrder === null ||
      costBuildUp?.totalCostPriceForOrder === undefined ||
      costBuildUp?.quantity === null ||
      costBuildUp?.quantity === undefined
    ) {
      setError("Cost Build-Up must provide the current per-bag cost, order total, and quantity before alternatives can be saved.");
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

      const nextForm = syncFormWithCostBuildUp(toForm(response), costBuildUp);
      setForm(nextForm);
      setLastSavedSignature(JSON.stringify(nextForm));
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
      <TenderWorkflowStepper currentStep={5} tenderId={tenderId} isDirty={isDirty} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Alternatives</CardTitle>
            <CardDescription>
              Build one or more pricing scenarios from the current cost build-up using profit and commission assumptions.
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
                    <Button className="w-full justify-self-start sm:w-auto md:justify-self-end" onClick={addScenario} type="button">
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
                          <TableHead>Customer Comm. %</TableHead>
                          <TableHead>Sales Comm.</TableHead>
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
                          <TableCell>{formatMetric(scenario.customerCommissionPercent, 2, "%")}</TableCell>
                          <TableCell>{formatSalesCommission(scenario)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span>{formatMetric(scenario.totalCost, 2, " EGP")}</span>
                              <button
                                aria-label={`Explain order cost for ${scenario.label || "scenario"}`}
                                className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-slate-50 text-[11px] font-medium text-muted-foreground transition hover:border-slate-300 hover:text-slate-700"
                                onClick={() => setCostHelpScenarioId(scenario.scenarioId)}
                                type="button"
                              >
                                ?
                              </button>
                            </div>
                          </TableCell>
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
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                className="w-full sm:w-auto"
                type="button"
                variant="ghost"
                onClick={() => {
                  if (!confirmDiscardUnsavedChanges(isDirty)) {
                    return;
                  }

                  navigate(`/tenders/${tenderId}/cost-build-up`);
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button className="w-full sm:w-auto" type="button" variant="outline" disabled={saveMode !== null} onClick={() => void save("draft")}>
                <Save className="h-4 w-4" />
                {saveMode === "draft" ? "Saving..." : "Save Draft"}
              </Button>
              <Button className="w-full sm:w-auto" type="button" disabled={saveMode !== null} onClick={() => void save("continue")}>
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

      <Dialog
        open={activeCostHelpScenario !== null}
        onClose={() => setCostHelpScenarioId(null)}
        title={activeCostHelpScenario ? `${activeCostHelpScenario.label} Pricing Breakdown` : "Pricing Breakdown"}
        description="These values show the per-bag amount before scenario markup, the adjusted per-bag price after markup, and how each total is calculated."
      >
        <div className="space-y-4 text-sm text-slate-700">
          <div className="rounded-2xl border border-border bg-slate-50 p-4">
            <p className="font-medium text-slate-900">Order Cost Formula</p>
            <p className="mt-2">
              Order Cost = Order Total ÷ Quantity
            </p>
            <p className="mt-2 text-base font-semibold text-slate-900">
              {formatMetric(activeCostHelpScenario?.totalCost ?? null, 2, " EGP")} ÷ {formatMetric(effectiveQuantity, 0, " bags")} = {formatMetric(orderCostPerBag, 2, " EGP per bag")}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-slate-50 p-4">
            <p className="font-medium text-slate-900">Order Price Formula</p>
            <p className="mt-2">
              Order Price = Order Price Total ÷ Quantity
            </p>
            <p className="mt-2 text-base font-semibold text-slate-900">
              {formatMetric(activeCostHelpScenario?.totalPrice ?? null, 2, " EGP")} ÷ {formatMetric(effectiveQuantity, 0, " bags")} = {formatMetric(orderPricePerBag, 2, " EGP per bag")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-white p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Before Markup</p>
              <p className="mt-2 text-base font-semibold text-slate-900">
                {formatMetric(orderCostPerBag, 2, " EGP per bag")}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">After Markup</p>
              <p className="mt-2 text-base font-semibold text-slate-900">
                {formatMetric(orderPricePerBag, 2, " EGP per bag")}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Quantity</p>
              <p className="mt-2 text-base font-semibold text-slate-900">
                {formatMetric(effectiveQuantity, 0, " bags")}
              </p>
            </div>
          </div>

          <p className="text-muted-foreground">
            These per-bag values are derived the same way as the blue summary card: total divided by quantity.
          </p>
        </div>
      </Dialog>
    </div>
  );
};

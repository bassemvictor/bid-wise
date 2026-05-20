import {
  ArrowLeft,
  ArrowRight,
  Box,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Search,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { TenderWorkflowStepper } from "../components/tenders/tender-workflow-stepper";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { api, ApiError, isApiConfigured } from "../lib/api";
import { cn } from "../lib/utils";
import type {
  BagBodySourcingSelection,
  ImportPreset,
  Material,
  MaterialSourceSelection,
  MaterialSourceType,
  Product,
  ProductConfiguration,
  RollCalculation,
  SelectedMaterialSource,
  StockItem,
  Supplier,
  TenderRequest,
} from "../../shared/types";

type SourceTab = "all" | "stock" | "import";

type SelectedSourceForm = {
  sourceId: string;
  sourceName: string;
  sourceType: MaterialSourceType;
  supplierId: string;
  materialId: string;
  rollWidthM: string;
  rollLengthM: string;
  rollCount: string;
  allocatedBags: string;
  unitCostUsdPerM2: string;
  leadTimeDays: string;
  customsEstimate: string;
};

type ComponentSourcingForm = {
  componentId: string;
  componentName: string;
  componentType?: string;
  productId: string;
  productName: string;
  materialId: string;
  requestedQuantity: string;
  bagDiameterMm: string;
  bagLengthMm: string;
  seamAllowanceMm: string;
  topBottomAllowanceMm: string;
  selectedSources: SelectedSourceForm[];
};

type MaterialSourcingForm = {
  tenantId: string;
  tenderId: string;
  productConfigId: string;
  sourcingStrategy: "single-source" | "combine-sources";
  exchangeRate: string;
  currencySafetyFactorPercent: string;
  freightCostPerM2Egp: string;
  otherChargesPerM2Egp: string;
  componentSelections: ComponentSourcingForm[];
};

type SourceOption = {
  sourceId: string;
  sourceName: string;
  sourceType: MaterialSourceType;
  supplierId: string;
  materialId: string;
  materialCategory: Material["category"] | null;
  rollWidthM: number | null;
  rollLengthM: number | null;
  unitCostUsdPerM2: number | null;
  leadTimeDays: number | null;
  customsEstimate: number | null;
  availabilityLabel: string;
};

type SourceLineMetrics = {
  bagsAcrossRollWidth: number | null;
  bagsAlongRollLength: number | null;
  bagsPerRoll: number | null;
  actualAreaPerBagM2: number | null;
  allocatedBags: number | null;
  requestedAllocatedBags: number | null;
  qtyUsedM2: number | null;
  totalCostUsd: number | null;
  totalCostEgp: number | null;
  costPerBagEgp: number | null;
  capacityBags: number | null;
  remainingCapacityBags: number | null;
  remainingRollLengthM: number | null;
};

type SourceDrawerState = {
  componentIndex: number;
  sourceIndex?: number;
  draftSource: SelectedSourceForm;
};

type SourcePickerState = {
  componentIndex: number;
  selectedSourceId: string | null;
};

type ComponentMetrics = {
  bagWidthMm: number | null;
  bagLengthWithAllowanceMm: number | null;
  requestedQuantity: number | null;
  actualAreaPerBagM2: number | null;
  materialCostPerBagEgp: number | null;
  totalMaterialCostEgp: number | null;
  totalAllocatedQtyM2: number | null;
  weightedAverageUnitCostUsdPerM2: number | null;
  leadTimeDays: number | null;
  sourceMetrics: SourceLineMetrics[];
};

type StockUsageSummary = {
  usedBags: number;
  remainingCapacityBags: number | null;
  remainingRollLengthM: number | null;
};

const isFabricMaterialCategory = (category?: Material["category"] | null) => category === "Fabric Material";

const getMaterialCategoryById = (materialId: string, materials: Material[]) =>
  materials.find((material) => material.materialId === materialId)?.category ?? null;

const getStockPreviewAvailability = (
  source: SourceOption,
  bagWidthMm: number | null,
  bagLengthWithAllowanceMm: number | null,
  existingUsedBags: number,
) => {
  const bagsAcrossRollWidth =
    source.rollWidthM !== null && bagWidthMm !== null && bagWidthMm > 0
      ? Math.floor(source.rollWidthM / bagWidthMm)
      : null;
  const bagsAlongRollLength =
    source.rollLengthM !== null && bagLengthWithAllowanceMm !== null && bagLengthWithAllowanceMm > 0
      ? Math.floor(source.rollLengthM / bagLengthWithAllowanceMm)
      : null;
  const capacityBags =
    bagsAcrossRollWidth !== null &&
    bagsAlongRollLength !== null &&
    bagsAcrossRollWidth > 0 &&
    bagsAlongRollLength > 0
      ? bagsAcrossRollWidth * bagsAlongRollLength
      : null;
  const remainingCapacityBags =
    capacityBags !== null ? Math.max(capacityBags - existingUsedBags, 0) : null;
  const usedRows =
    bagsAcrossRollWidth !== null && bagsAcrossRollWidth > 0
      ? Math.ceil(existingUsedBags / bagsAcrossRollWidth)
      : null;
  const remainingRows =
    bagsAlongRollLength !== null && usedRows !== null
      ? Math.max(bagsAlongRollLength - usedRows, 0)
      : null;
  const remainingRollLengthM =
    remainingRows !== null && bagLengthWithAllowanceMm !== null
      ? remainingRows * bagLengthWithAllowanceMm
      : null;

  return {
    remainingCapacityBags,
    remainingRollLengthM,
  };
};

const initialForm = (tenderId: string): MaterialSourcingForm => ({
  tenantId: "alimex-demo",
  tenderId,
  productConfigId: "base",
  sourcingStrategy: "single-source",
  exchangeRate: "",
  currencySafetyFactorPercent: "",
  freightCostPerM2Egp: "",
  otherChargesPerM2Egp: "",
  componentSelections: [],
});

const applyTenderRateDefaults = (
  form: MaterialSourcingForm,
  tender: TenderRequest | null,
): MaterialSourcingForm => ({
  ...form,
  exchangeRate: tender?.exchangeRate?.toString() ?? "",
  currencySafetyFactorPercent: tender?.currencySafetyFactorPercent?.toString() ?? "",
});

const numberOrNull = (value: string) => {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatMetric = (value: number | null, digits = 2, suffix = "") =>
  value === null || !Number.isFinite(value) ? "Not calculated" : `${value.toFixed(digits)}${suffix}`;

const formatCompactSpec = (component: ComponentSourcingForm) => {
  const quantity = component.requestedQuantity || "Not set";
  const diameter = component.bagDiameterMm || "-";
  const length = component.bagLengthMm || "-";

  if (isBagStyleComponent(component)) {
    return `${quantity} bags · ${diameter} × ${length} m`;
  }

  return `${quantity} units`;
};

const OverflowMenu = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <details className="relative">
    <summary
      aria-label={label}
      className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl border border-border bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
    >
      <MoreHorizontal className="h-4 w-4" />
    </summary>
    <div className="absolute right-0 top-11 z-20 min-w-[160px] rounded-xl border border-border bg-white p-1 shadow-lg">
      {children}
    </div>
  </details>
);

const TenderSummaryBar = ({
  totalTenderCost,
  satisfiedCount,
  totalCount,
  onSync,
}: {
  totalTenderCost: number | null;
  satisfiedCount: number;
  totalCount: number;
  onSync: () => void;
}) => (
  <div className="sticky top-3 z-20 rounded-2xl border border-border bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
        <div className="min-w-[180px]">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Tender Cost</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{formatMetric(totalTenderCost, 2, " EGP")}</p>
        </div>
        <div className="min-w-[180px]">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Satisfied Components</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {satisfiedCount} / {totalCount}
          </p>
        </div>
      </div>
      <Button onClick={onSync} type="button" variant="outline">
        Sync
      </Button>
    </div>
  </div>
);

const getComponentStatus = (
  component: ComponentSourcingForm,
  metrics: ComponentMetrics | undefined,
) => {
  const requested = metrics?.requestedQuantity ?? numberOrNull(component.requestedQuantity) ?? 0;
  const allocated =
    metrics?.sourceMetrics.reduce((total, line) => total + (line.allocatedBags ?? 0), 0) ?? 0;

  if (!component.selectedSources.length || allocated <= 0) {
    return { label: "Not sourced", variant: "warning" as const };
  }

  if (requested > 0 && allocated >= requested) {
    return { label: "Sourced", variant: "success" as const };
  }

  return { label: "Partial", variant: "neutral" as const };
};

const getRequestedAndAppliedTotals = (
  component: ComponentSourcingForm,
  metrics: ComponentMetrics | undefined,
) => {
  const requested = metrics?.requestedQuantity ?? numberOrNull(component.requestedQuantity) ?? 0;
  const applied =
    metrics?.sourceMetrics.reduce((total, line) => total + (line.allocatedBags ?? 0), 0) ?? 0;

  return { requested, applied };
};

const SourceSelectionDrawer = ({
  component,
  metrics,
  sources,
  visibleSources,
  activeTab,
  materials,
  sourcingStrategy,
  searchValue,
  selectedSourceId,
  stockUsageSummary,
  onClose,
  onDone,
  onOpenAddedSource,
  onRemoveAddedSource,
  onUpdateAddedSource,
  onSearchChange,
  onSelectSource,
  onTabChange,
  onConfirm,
}: {
  component: ComponentSourcingForm;
  metrics: ComponentMetrics | undefined;
  sources: SourceOption[];
  visibleSources: SourceOption[];
  activeTab: SourceTab;
  materials: Material[];
  sourcingStrategy: MaterialSourcingForm["sourcingStrategy"];
  searchValue: string;
  selectedSourceId: string | null;
  stockUsageSummary: Map<string, StockUsageSummary>;
  onClose: () => void;
  onDone: () => void;
  onOpenAddedSource: (sourceIndex: number) => void;
  onRemoveAddedSource: (sourceIndex: number) => void;
  onUpdateAddedSource: (sourceIndex: number, patch: Partial<SelectedSourceForm>) => void;
  onSearchChange: (value: string) => void;
  onSelectSource: (sourceId: string) => void;
  onTabChange: (tab: SourceTab) => void;
  onConfirm: () => void;
}) => {
  const title = `Select Source - ${component.componentName}`;
  const totals = getRequestedAndAppliedTotals(component, metrics);
  const addedSourcesBadge = getQuantityCoverageBadge(totals.requested, totals.applied);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/30">
      <button aria-label="Close source picker overlay" className="absolute inset-0" onClick={onClose} type="button" />
      <aside className="relative z-10 flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-[640px] sm:border-l sm:border-border">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {resolveMaterialLabel(component.materialId, materials) || component.productName}
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
          <div className="space-y-4">
            <div
              className={cn(
                "rounded-[1.4rem] border p-5",
                component.selectedSources.length
                  ? "border-border bg-white"
                  : "border-rose-200 bg-rose-50/70",
              )}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-xl">
                  <p className="text-[1.75rem] font-semibold leading-none text-slate-900">Saved Options</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {component.selectedSources.length
                      ? "Current selections for this component stay compact here."
                      : "No sources added yet. Select one below to get started."}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-700">
                    Requested: {totals.requested.toLocaleString()} · Applied: {totals.applied.toLocaleString()} /{" "}
                    {totals.requested.toLocaleString()}
                  </p>
                </div>
                <div className="shrink-0">
                  {component.selectedSources.length ? (
                    <Badge className="px-4 py-2 text-sm" variant={addedSourcesBadge.variant}>
                      {addedSourcesBadge.label}
                    </Badge>
                  ) : (
                    <Badge className="px-4 py-2 text-sm" variant="warning">Empty</Badge>
                  )}
                </div>
              </div>

              {component.selectedSources.length ? (
                <div className="mt-5 space-y-3">
                  {component.selectedSources.map((source, sourceIndex) => (
                    <div
                      key={`${source.sourceId}-${sourceIndex}`}
                      className="rounded-[1.35rem] border border-border bg-white px-4 py-3 shadow-sm"
                    >
                      <button
                        className="w-full text-left"
                        onClick={() => onOpenAddedSource(sourceIndex)}
                        type="button"
                      >
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <p className="truncate text-base font-semibold tracking-[-0.02em] text-slate-900">
                            {source.sourceName}
                          </p>
                          <span className="inline-flex items-center gap-2">
                            <Box className="h-4 w-4 text-slate-400" />
                            <span className="text-sm text-slate-500">
                              {source.sourceType === "stock" ? "Stock" : "Import"}
                            </span>
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-sm text-slate-500">
                            {isBagStyleComponent(component)
                              ? `${source.rollWidthM || "-"} m x ${source.rollLengthM || "-"} m`
                              : "Accessory source"}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-sm text-slate-500">
                            {isBagStyleComponent(component)
                              ? `${source.unitCostUsdPerM2 || "-"} USD/m²`
                              : `${source.unitCostUsdPerM2 || "-"} EGP/bag`}
                          </span>
                        </div>
                      </button>
                      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
                        <label className="flex min-w-0 items-center gap-3 text-sm font-medium text-slate-700">
                          <span className="whitespace-nowrap text-sm font-medium text-slate-500">
                            {isBagStyleComponent(component) ? "Applied Bags" : "Allocated Qty"}
                          </span>
                          <Input
                            className="h-10 w-24 rounded-xl border-slate-200 bg-white text-base font-semibold text-slate-900"
                            inputMode="numeric"
                            disabled
                            value={
                              metrics?.sourceMetrics[sourceIndex]?.allocatedBags?.toString() ??
                              (sourcingStrategy === "single-source"
                                ? component.requestedQuantity
                                : source.allocatedBags)
                            }
                          />
                          <span className="whitespace-nowrap text-sm text-slate-500">
                            / {component.requestedQuantity || "0"}
                          </span>
                        </label>
                        <div className="ml-auto flex shrink-0 items-center gap-2">
                          <button
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:text-rose-600"
                            onClick={() => onRemoveAddedSource(sourceIndex)}
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <button
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:text-slate-900"
                            onClick={() => onOpenAddedSource(sourceIndex)}
                            type="button"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search supplier..."
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {[
                { value: "all", label: `All (${sources.length})` },
                {
                  value: "stock",
                  label: `Stock (${sources.filter((source) => source.sourceType === "stock").length})`,
                },
                {
                  value: "import",
                  label: `Import (${sources.filter((source) => source.sourceType === "import").length})`,
                },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={
                    activeTab === tab.value
                      ? "rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white"
                      : "rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600"
                  }
                  onClick={() => onTabChange(tab.value as SourceTab)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {visibleSources.length ? (
                visibleSources.map((source) => {
                  const isFabricSource = isFabricMaterialCategory(source.materialCategory);
                  const previewAvailability =
                    source.sourceType === "stock"
                      ? getStockPreviewAvailability(
                          source,
                          metrics?.bagWidthMm ?? null,
                          metrics?.bagLengthWithAllowanceMm ?? null,
                          stockUsageSummary.get(source.sourceId)?.usedBags ?? 0,
                        )
                      : null;
                  const availability =
                    source.sourceType === "stock"
                      ? isFabricSource
                        ? `${formatMetric(previewAvailability?.remainingCapacityBags ?? null, 0, " bags")} / ${formatMetric(previewAvailability?.remainingRollLengthM ?? null, 2, " m")} remaining`
                        : "Available in stock"
                      : source.availabilityLabel;
                  const isSelected = selectedSourceId === source.sourceId;

                  return (
                    <button
                      key={source.sourceId}
                      className={cn(
                        "w-full rounded-2xl border px-4 py-4 text-left transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-white hover:bg-slate-50",
                      )}
                      onClick={() => onSelectSource(source.sourceId)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">{source.sourceName}</p>
                            <Badge variant={source.sourceType === "stock" ? "success" : "neutral"}>
                              {source.sourceType === "stock" ? "Stock" : "Import"}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">
                            {isFabricSource
                              ? `${formatMetric(source.rollWidthM, 2, " m")} width • ${formatMetric(source.rollLengthM, 2, " m")} length`
                              : "Accessory source"}
                          </p>
                          <p className="mt-2 text-base font-semibold text-slate-900">
                            {isFabricSource
                              ? formatMetric(source.unitCostUsdPerM2, 3, " USD/m²")
                              : formatMetric(source.unitCostUsdPerM2, 2, " EGP/bag")}
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">Availability: {availability}</p>
                        </div>
                        <div
                          className={cn(
                            "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                            isSelected ? "border-primary" : "border-slate-300",
                          )}
                        >
                          <span
                            className={cn(
                              "h-2.5 w-2.5 rounded-full",
                              isSelected ? "bg-primary" : "bg-transparent",
                            )}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  No source options match the current filters.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-border px-5 py-4">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button onClick={onDone} type="button" variant="outline">
              Done Adding Sources
            </Button>
            <Button disabled={!selectedSourceId} onClick={onConfirm} type="button">
              Select Source
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
};

const buildSelectedSourceFromOption = (option: SourceOption): SelectedSourceForm => ({
  sourceId: option.sourceId,
  sourceName: option.sourceName,
  sourceType: option.sourceType,
  supplierId: option.supplierId,
  materialId: option.materialId,
  rollWidthM: option.rollWidthM?.toString() ?? "",
  rollLengthM: option.rollLengthM?.toString() ?? "",
  rollCount: "1",
  allocatedBags: "",
  unitCostUsdPerM2: option.unitCostUsdPerM2?.toString() ?? "",
  leadTimeDays: option.leadTimeDays?.toString() ?? "",
  customsEstimate: option.customsEstimate?.toString() ?? "",
});

const upsertSelectedSource = (
  component: ComponentSourcingForm,
  source: SelectedSourceForm,
  sourcingStrategy: MaterialSourcingForm["sourcingStrategy"],
  sourceIndex?: number,
) => {
  if (sourcingStrategy === "single-source") {
    return {
      ...component,
      selectedSources: [
        {
          ...source,
          allocatedBags: component.requestedQuantity,
        },
      ],
    };
  }

  if (sourceIndex !== undefined) {
    return {
      ...component,
      selectedSources: component.selectedSources.map((item, index) =>
        index === sourceIndex ? source : item,
      ),
    };
  }

  const existingIndex = component.selectedSources.findIndex((item) => item.sourceId === source.sourceId);
  if (existingIndex >= 0) {
    return {
      ...component,
      selectedSources: component.selectedSources.map((item, index) =>
        index === existingIndex ? source : item,
      ),
    };
  }

  return {
    ...component,
    selectedSources: [...component.selectedSources, source],
  };
};

const calculateSourceLineMetrics = ({
  component,
  source,
  sourcingStrategy,
  requestedQuantity,
  bagWidthMm,
  bagLengthWithAllowanceMm,
  existingUsedBags,
  effectiveExchangeRate,
  freightCostPerM2Egp,
  otherChargesPerM2Egp,
  isFabricMaterial,
}: {
  component: ComponentSourcingForm;
  source: SelectedSourceForm;
  sourcingStrategy: MaterialSourcingForm["sourcingStrategy"];
  requestedQuantity: number | null;
  bagWidthMm: number | null;
  bagLengthWithAllowanceMm: number | null;
  existingUsedBags: number;
  effectiveExchangeRate: number | null;
  freightCostPerM2Egp: number | null;
  otherChargesPerM2Egp: number | null;
  isFabricMaterial: boolean;
}) => {
  const rollWidthM = numberOrNull(source.rollWidthM);
  const rollLengthM = numberOrNull(source.rollLengthM);
  const unitCostUsdPerM2 = numberOrNull(source.unitCostUsdPerM2);
  const customsEstimate = numberOrNull(source.customsEstimate) ?? 0;
  const rollCount =
    source.sourceType === "stock" ? 1 : Math.max(1, Math.floor(numberOrNull(source.rollCount) ?? 1));
  const bagsAcrossRollWidth =
    isFabricMaterial && rollWidthM !== null && bagWidthMm !== null && bagWidthMm > 0
      ? Math.floor(rollWidthM / bagWidthMm)
      : null;
  const bagsAlongRollLength =
    isFabricMaterial && rollLengthM !== null && bagLengthWithAllowanceMm !== null && bagLengthWithAllowanceMm > 0
      ? Math.floor(rollLengthM / bagLengthWithAllowanceMm)
      : null;
  const bagsPerRoll =
    bagsAcrossRollWidth !== null &&
    bagsAlongRollLength !== null &&
    bagsAcrossRollWidth > 0 &&
    bagsAlongRollLength > 0
      ? bagsAcrossRollWidth * bagsAlongRollLength
      : null;
  const actualAreaPerBagM2 =
    isFabricMaterial && rollWidthM !== null && rollLengthM !== null && bagsPerRoll !== null && bagsPerRoll > 0
      ? (rollWidthM * rollLengthM) / bagsPerRoll
      : null;
  const capacityBags = isFabricMaterial
    ? bagsPerRoll !== null
      ? bagsPerRoll * rollCount
      : null
    : requestedQuantity;
  const requestedAllocatedBags =
    sourcingStrategy === "combine-sources" ? numberOrNull(source.allocatedBags) : requestedQuantity;
  const usedBeforeThisLine = source.sourceType === "stock" ? existingUsedBags : 0;
  const remainingCapacityForThisLine =
    capacityBags !== null ? Math.max(capacityBags - usedBeforeThisLine, 0) : null;
  const allocatedBags =
    remainingCapacityForThisLine !== null
      ? requestedAllocatedBags === null
        ? Math.min(requestedQuantity ?? remainingCapacityForThisLine, remainingCapacityForThisLine)
        : Math.min(requestedAllocatedBags, remainingCapacityForThisLine)
      : requestedAllocatedBags ?? requestedQuantity;
  const qtyUsedM2 =
    isFabricMaterial && actualAreaPerBagM2 !== null && allocatedBags !== null ? actualAreaPerBagM2 * allocatedBags : null;
  const landedCostPerM2Egp =
    isFabricMaterial && unitCostUsdPerM2 !== null && effectiveExchangeRate !== null
      ? unitCostUsdPerM2 * effectiveExchangeRate +
        (freightCostPerM2Egp ?? 0) +
        customsEstimate +
        (otherChargesPerM2Egp ?? 0)
      : null;
  const totalCostEgp =
    isFabricMaterial
      ? qtyUsedM2 !== null && landedCostPerM2Egp !== null
        ? qtyUsedM2 * landedCostPerM2Egp
        : null
      : allocatedBags !== null && unitCostUsdPerM2 !== null
        ? allocatedBags * unitCostUsdPerM2
        : null;
  const usedRows =
    allocatedBags !== null && bagsAcrossRollWidth !== null && bagsAcrossRollWidth > 0
      ? Math.ceil(allocatedBags / bagsAcrossRollWidth)
      : null;
  const totalRows = bagsAlongRollLength !== null ? bagsAlongRollLength * rollCount : null;
  const remainingRows =
    totalRows !== null && usedRows !== null ? Math.max(totalRows - usedRows, 0) : null;
  const remainingRollLengthM =
    isFabricMaterial && remainingRows !== null && bagLengthWithAllowanceMm !== null
      ? remainingRows * bagLengthWithAllowanceMm
      : null;

  return {
    component,
    source,
    allocatedBags,
    actualAreaPerBagM2,
    totalCostEgp,
    capacityBags,
    remainingCapacityBags:
      remainingCapacityForThisLine !== null && allocatedBags !== null
        ? Math.max(remainingCapacityForThisLine - allocatedBags, 0)
        : remainingCapacityForThisLine,
    remainingRollLengthM,
  };
};

const getQuantityCoverageBadge = (
  requestedQuantity: number | null,
  allocatedQuantity: number,
) => {
  if (requestedQuantity === null || requestedQuantity <= 0) {
    return {
      label: "Quantity not set",
      variant: "neutral" as const,
    };
  }

  if (allocatedQuantity >= requestedQuantity) {
    return {
      label: "Quantity satisfied",
      variant: "success" as const,
    };
  }

  if (allocatedQuantity > 0) {
    return {
      label: `Short by ${(requestedQuantity - allocatedQuantity).toLocaleString()} bags`,
      variant: "warning" as const,
    };
  }

  return {
    label: "Not sourced yet",
    variant: "neutral" as const,
  };
};

const getTotalCostBadge = (totalMaterialCostEgp: number | null, allocatedQuantity: number) => {
  if (allocatedQuantity <= 0 || totalMaterialCostEgp === null || !Number.isFinite(totalMaterialCostEgp)) {
    return {
      label: "Cost pending",
      variant: "neutral" as const,
    };
  }

  return {
    label: `${totalMaterialCostEgp.toFixed(2)} EGP total`,
    variant: "default" as const,
  };
};

const isBagBody = (component: Product["components"][number]) =>
  component.componentType.trim().toLowerCase().includes("bag body") ||
  component.componentName.trim().toLowerCase().includes("bag body");

const isSourcedComponent = (_component: Product["components"][number]) => true;

const resolveMaterialId = (value: string, materials: Material[]) => {
  const match = materials.find(
    (material) => material.materialId === value || material.materialName === value,
  );
  return match?.materialId ?? value;
};

const resolveMaterialLabel = (value: string, materials: Material[]) =>
  materials.find((material) => material.materialId === value)?.materialName ?? value;

const isBagStyleComponent = (component: ComponentSourcingForm) =>
  Boolean(
    component.bagDiameterMm.trim() ||
      component.bagLengthMm.trim() ||
      component.seamAllowanceMm.trim() ||
      component.topBottomAllowanceMm.trim(),
  );

const buildComponentSelectionsFromProducts = (
  configuration: ProductConfiguration,
  materials: Material[],
): ComponentSourcingForm[] =>
  configuration.productSnapshots.flatMap((product) => {
    const sourcedComponents = product.components.filter(isSourcedComponent);
    const productFallbackMaterialId =
      sourcedComponents
        .map((component) => resolveMaterialId(component.material, materials))
        .find(Boolean) ||
      resolveMaterialId(configuration.mainFabricMaterialId, materials);

    return sourcedComponents.map((component) => ({
      componentId: component.componentId,
      componentName: component.componentName,
      componentType: component.componentType,
      productId: product.productId,
      productName: product.productName,
      materialId: resolveMaterialId(component.material, materials) || productFallbackMaterialId,
      requestedQuantity:
        product.requestedQuantity !== null && product.requestedQuantity !== undefined
          ? String(product.requestedQuantity)
          : configuration.quantity !== null && configuration.quantity !== undefined
            ? String(configuration.quantity)
            : "",
      bagDiameterMm:
        component.specifications.diameter !== null && component.specifications.diameter !== undefined
          ? String(component.specifications.diameter)
          : "",
      bagLengthMm:
        component.specifications.length !== null && component.specifications.length !== undefined
          ? String(component.specifications.length)
          : "",
      seamAllowanceMm:
        component.specifications.seamAllowanceMm !== null &&
        component.specifications.seamAllowanceMm !== undefined
          ? String(component.specifications.seamAllowanceMm)
          : "",
      topBottomAllowanceMm:
        component.specifications.topBottomAllowanceMm !== null &&
        component.specifications.topBottomAllowanceMm !== undefined
          ? String(component.specifications.topBottomAllowanceMm)
          : "",
      selectedSources: [],
    }));
  });

const buildComponentSelectionFromSnapshot = (
  product: ProductConfiguration["productSnapshots"][number],
  component: Product["components"][number],
  configuration: ProductConfiguration,
  materials: Material[],
): ComponentSourcingForm => {
  const sourcedComponents = product.components.filter(isSourcedComponent);
  const productFallbackMaterialId =
    sourcedComponents
      .map((entry) => resolveMaterialId(entry.material, materials))
      .find(Boolean) ||
    resolveMaterialId(configuration.mainFabricMaterialId, materials);

  return {
    componentId: component.componentId,
    componentName: component.componentName,
    componentType: component.componentType,
    productId: product.productId,
    productName: product.productName,
    materialId: resolveMaterialId(component.material, materials) || productFallbackMaterialId,
    requestedQuantity:
      product.requestedQuantity !== null && product.requestedQuantity !== undefined
        ? String(product.requestedQuantity)
        : configuration.quantity !== null && configuration.quantity !== undefined
          ? String(configuration.quantity)
          : "",
    bagDiameterMm:
      component.specifications.diameter !== null && component.specifications.diameter !== undefined
        ? String(component.specifications.diameter)
        : "",
    bagLengthMm:
      component.specifications.length !== null && component.specifications.length !== undefined
        ? String(component.specifications.length)
        : "",
    seamAllowanceMm:
      component.specifications.seamAllowanceMm !== null &&
      component.specifications.seamAllowanceMm !== undefined
        ? String(component.specifications.seamAllowanceMm)
        : "",
    topBottomAllowanceMm:
      component.specifications.topBottomAllowanceMm !== null &&
      component.specifications.topBottomAllowanceMm !== undefined
        ? String(component.specifications.topBottomAllowanceMm)
        : "",
    selectedSources: [],
  };
};

const toForm = (payload: MaterialSourceSelection): MaterialSourcingForm => ({
  tenantId: payload.tenantId,
  tenderId: payload.tenderId,
  productConfigId: payload.productConfigId,
  sourcingStrategy: payload.sourcingStrategy,
  exchangeRate: payload.exchangeRate?.toString() ?? "",
  currencySafetyFactorPercent: payload.currencySafetyFactorPercent?.toString() ?? "",
  freightCostPerM2Egp: payload.freightCostPerM2Egp?.toString() ?? "",
  otherChargesPerM2Egp: payload.otherChargesPerM2Egp?.toString() ?? "",
  componentSelections:
    payload.componentSelections?.map((selection) => ({
      componentId: selection.componentId,
      componentName: selection.componentName,
      componentType: undefined,
      productId: selection.productId,
      productName: selection.productName,
      materialId: selection.materialId,
      requestedQuantity: selection.requestedQuantity?.toString() ?? "",
      bagDiameterMm: selection.bagDiameterMm?.toString() ?? "",
      bagLengthMm: selection.bagLengthMm?.toString() ?? "",
      seamAllowanceMm: selection.seamAllowanceMm?.toString() ?? "",
      topBottomAllowanceMm: selection.topBottomAllowanceMm?.toString() ?? "",
      selectedSources: selection.selectedSources.map((source) => ({
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        sourceType: source.sourceType,
        supplierId: source.supplierId ?? "",
        materialId: source.materialId ?? selection.materialId,
        rollWidthM: source.rollWidthM?.toString() ?? "",
        rollLengthM: source.rollLengthM?.toString() ?? "",
        rollCount: source.rollCount?.toString() ?? (source.sourceType === "stock" ? "1" : ""),
        allocatedBags: source.allocatedBags?.toString() ?? "",
        unitCostUsdPerM2: source.unitCostUsdPerM2?.toString() ?? "",
        leadTimeDays: source.leadTimeDays?.toString() ?? "",
        customsEstimate: source.customsEstimate?.toString() ?? "",
      })),
    })) ?? [],
});

const buildSourceOptions = (
  component: ComponentSourcingForm,
  stockItems: StockItem[],
  importPresets: ImportPreset[],
  suppliers: Supplier[],
  materials: Material[],
  fallbackMaterialId?: string,
): SourceOption[] => {
  const targetMaterialId = component.materialId || fallbackMaterialId || "";

  const stockSources = stockItems
    .filter((item) => !targetMaterialId || item.materialId === targetMaterialId)
    .map((item) => {
      const supplier = suppliers.find((record) => record.supplierId === item.supplierId);
      const material = materials.find((record) => record.materialId === item.materialId);

      return {
        sourceId: item.stockId,
        sourceName: `${supplier?.supplierName ?? item.supplierId} · ${material?.materialName ?? item.materialId}`,
        sourceType: "stock" as const,
        supplierId: item.supplierId,
        materialId: item.materialId,
        materialCategory: material?.category ?? null,
        rollWidthM: item.rollWidthM,
        rollLengthM: item.rollLengthM,
        unitCostUsdPerM2: item.unitCostUsdPerM2 ?? null,
        leadTimeDays: 0,
        customsEstimate: 0,
        availabilityLabel: "In stock",
      };
    });

  const importSources = importPresets
    .filter((item) => !targetMaterialId || item.materialId === targetMaterialId)
    .map((item) => {
      const supplier = suppliers.find((record) => record.supplierId === item.supplierId);
      const material = materials.find((record) => record.materialId === item.materialId);

      return {
        sourceId: item.importPresetId,
        sourceName: `${supplier?.supplierName ?? item.supplierId} · ${material?.materialName ?? item.materialId}`,
        sourceType: "import" as const,
        supplierId: item.supplierId,
        materialId: item.materialId,
        materialCategory: material?.category ?? null,
        rollWidthM: item.rollWidthM,
        rollLengthM: item.rollLengthM,
        unitCostUsdPerM2: item.unitCostUsdPerM2,
        leadTimeDays: item.leadTimeDays,
        customsEstimate: item.customsEstimate ?? 0,
        availabilityLabel: "Import preset",
      };
    });

  return [...stockSources, ...importSources];
};

const SourceManagementDrawer = ({
  component,
  componentIndex,
  metrics,
  draftSource,
  draftMetrics,
  sourcingStrategy,
  onClose,
  onBack,
  onDelete,
  onSave,
  onRemoveSource,
  onUpdateDraft,
  isFabricMaterial,
}: {
  component: ComponentSourcingForm;
  componentIndex: number;
  metrics: ComponentMetrics | undefined;
  draftSource: SelectedSourceForm;
  draftMetrics: ReturnType<typeof calculateSourceLineMetrics>;
  sourcingStrategy: "single-source" | "combine-sources";
  onClose: () => void;
  onBack?: () => void;
  onDelete?: () => void;
  onSave: () => void;
  onRemoveSource: (componentIndex: number, sourceIndex: number) => void;
  onUpdateDraft: (patch: Partial<SelectedSourceForm>) => void;
  isFabricMaterial: boolean;
}) => {
  const isBagStyle = isBagStyleComponent(component) && isFabricMaterial;
  const allocatedQuantity =
    metrics?.sourceMetrics.reduce((total, line) => total + (line.allocatedBags ?? 0), 0) ?? 0;
  const quantityCoverageBadge = getQuantityCoverageBadge(metrics?.requestedQuantity ?? null, allocatedQuantity);
  const totalCostBadge = getTotalCostBadge(draftMetrics.totalCostEgp ?? null, draftMetrics.allocatedBags ?? 0);
  const optionCoverageBadge = getQuantityCoverageBadge(
    numberOrNull(component.requestedQuantity),
    draftMetrics.allocatedBags ?? 0,
  );

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/30">
      <button
        aria-label="Close source drawer overlay"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <aside className="relative z-10 flex h-full w-full flex-col border-l border-border bg-white shadow-2xl sm:max-w-[640px]">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5">
          <div>
            {onBack ? (
              <button
                className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
                onClick={onBack}
                type="button"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : null}
            <h3 className="text-lg font-semibold text-slate-900">{draftSource.sourceName}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {component.productName} · {component.componentName} ·{" "}
              {draftSource.sourceType === "stock" ? "In Stock" : "Import"}
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
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-border bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {isBagStyle ? "Bag Width" : "Requested Qty"}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {isBagStyle
                    ? formatMetric(metrics?.bagWidthMm ?? null, 4, " m")
                    : formatMetric(numberOrNull(component.requestedQuantity), 0, " units")}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {isBagStyle ? "Actual Area / Bag" : "Lead Time"}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {isBagStyle
                    ? formatMetric(draftMetrics.actualAreaPerBagM2 ?? null, 4, " m²")
                    : formatMetric(numberOrNull(draftSource.leadTimeDays), 0, " days")}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Cost</p>
                <div className="mt-2">
                  <Badge variant={totalCostBadge.variant}>{totalCostBadge.label}</Badge>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {isBagStyle ? "Coverage" : "Source Type"}
                </p>
                <div className="mt-2">
                  {isBagStyle ? (
                    <Badge variant={optionCoverageBadge.variant}>{optionCoverageBadge.label}</Badge>
                  ) : (
                    <Badge variant="neutral">{draftSource.sourceType === "stock" ? "Stock" : "Import"}</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[1.15rem] border border-border bg-slate-50/80 p-4">
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-slate-900">Option Details</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review the selected sourcing option here, then save it back to the main page.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  {isFabricMaterial ? "Roll Width (m)" : "Cost per Bag (EGP)"}
                  <Input
                    inputMode="decimal"
                    value={isFabricMaterial ? draftSource.rollWidthM : draftSource.unitCostUsdPerM2}
                    onChange={(event) =>
                      onUpdateDraft(
                        isFabricMaterial
                          ? { rollWidthM: event.target.value }
                          : { unitCostUsdPerM2: event.target.value },
                      )
                    }
                  />
                </label>
                {isFabricMaterial ? (
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Roll Length (m)
                    <Input
                      inputMode="decimal"
                      value={draftSource.rollLengthM}
                      onChange={(event) => onUpdateDraft({ rollLengthM: event.target.value })}
                    />
                  </label>
                ) : null}
                {isFabricMaterial ? (
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Roll Count
                    <Input
                      inputMode="numeric"
                      disabled={draftSource.sourceType === "stock"}
                      value={draftSource.sourceType === "stock" ? "1" : draftSource.rollCount}
                      onChange={(event) => onUpdateDraft({ rollCount: event.target.value })}
                    />
                  </label>
                ) : null}
                {isFabricMaterial ? (
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Unit Cost (USD/m²)
                    <Input
                      inputMode="decimal"
                      value={draftSource.unitCostUsdPerM2}
                      onChange={(event) => onUpdateDraft({ unitCostUsdPerM2: event.target.value })}
                    />
                  </label>
                ) : null}
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Lead Time (days)
                  <Input
                    inputMode="decimal"
                    value={draftSource.leadTimeDays}
                    onChange={(event) => onUpdateDraft({ leadTimeDays: event.target.value })}
                  />
                </label>
                {isFabricMaterial ? (
                  <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                    Customs Estimate (EGP/m²)
                    <Input
                      inputMode="decimal"
                      value={draftSource.customsEstimate}
                      onChange={(event) => onUpdateDraft({ customsEstimate: event.target.value })}
                    />
                  </label>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-border bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {isBagStyle ? "Remaining Capacity" : "Allocated Qty"}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {isBagStyle
                      ? formatMetric(draftMetrics.remainingCapacityBags ?? null, 0, " bags")
                      : formatMetric(draftMetrics.allocatedBags ?? null, 0, " units")}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {isBagStyle ? "Remaining Length" : "Unit Cost"}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {isBagStyle
                      ? formatMetric(draftMetrics.remainingRollLengthM ?? null, 2, " m")
                      : formatMetric(numberOrNull(draftSource.unitCostUsdPerM2), 2, " EGP/bag")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {onDelete ? "Save this option to add or update its summary line." : "Save this option to add its summary line."}
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
                Save Option
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

export const MaterialSourcingPage = () => {
  const navigate = useNavigate();
  const { tenderId = "" } = useParams();
  const [activeTab, setActiveTab] = useState<SourceTab>("all");
  const [pickerSearch, setPickerSearch] = useState("");
  const [form, setForm] = useState<MaterialSourcingForm>(() => initialForm(tenderId));
  const [tender, setTender] = useState<TenderRequest | null>(null);
  const [productConfiguration, setProductConfiguration] = useState<ProductConfiguration | null>(null);
  const [collapsedProducts, setCollapsedProducts] = useState<Record<string, boolean>>({});
  const [costBreakdownComponentIndex, setCostBreakdownComponentIndex] = useState<number | null>(null);
  const [sourcePickerState, setSourcePickerState] = useState<SourcePickerState | null>(null);
  const [drawerState, setDrawerState] = useState<SourceDrawerState | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [importPresets, setImportPresets] = useState<ImportPreset[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
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
        const [
          loadedTender,
          loadedConfiguration,
          loadedMaterials,
          loadedStock,
          loadedImportPresets,
          loadedSuppliers,
          saved,
        ] = await Promise.all([
          api.get<TenderRequest>(`/tenders/${tenderId}?tenantId=alimex-demo`),
          api.get<ProductConfiguration>(`/tenders/${tenderId}/product-configuration?tenantId=alimex-demo`),
          api.get<Material[]>(`/materials?tenantId=alimex-demo`),
          api.get<StockItem[]>(`/stock?tenantId=alimex-demo`),
          api.get<ImportPreset[]>(`/import-presets?tenantId=alimex-demo`),
          api.get<Supplier[]>(`/suppliers?tenantId=alimex-demo`),
          api
            .get<MaterialSourceSelection>(`/tenders/${tenderId}/material-sourcing?tenantId=alimex-demo`)
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

        const activeMaterials = loadedMaterials.filter((item) => item.active);
        setTender(loadedTender);
        setProductConfiguration(loadedConfiguration);
        setMaterials(activeMaterials);
        setStockItems(loadedStock.filter((item) => item.active));
        setImportPresets(loadedImportPresets.filter((item) => item.active));
        setSuppliers(loadedSuppliers.filter((item) => item.active));

        if (saved?.componentSelections?.length) {
          setForm(applyTenderRateDefaults(toForm(saved), loadedTender));
          return;
        }

        setForm((current) => applyTenderRateDefaults({
          ...current,
          productConfigId: loadedConfiguration.productConfigId,
          componentSelections: buildComponentSelectionsFromProducts(loadedConfiguration, activeMaterials),
        }, loadedTender));
      } catch (reason) {
        if (isMounted) {
          setError(reason instanceof Error ? reason.message : "Unable to load material sourcing.");
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

  const exchangeRate = numberOrNull(form.exchangeRate);
  const currencySafetyFactorPercent = numberOrNull(form.currencySafetyFactorPercent);
  const freightCostPerM2Egp = numberOrNull(form.freightCostPerM2Egp);
  const otherChargesPerM2Egp = numberOrNull(form.otherChargesPerM2Egp);
  const effectiveExchangeRate =
    exchangeRate !== null && currencySafetyFactorPercent !== null
      ? exchangeRate * (1 + currencySafetyFactorPercent / 100)
      : null;
  const componentMetrics = useMemo<ComponentMetrics[]>(() => {
    const stockUsageBySource = new Map<string, number>();

    return form.componentSelections.map((component) => {
      const isFabricMaterial = isFabricMaterialCategory(getMaterialCategoryById(component.materialId, materials));
      const bagDiameterMm = numberOrNull(component.bagDiameterMm);
      const bagLengthMm = numberOrNull(component.bagLengthMm);
      const seamAllowanceMm = numberOrNull(component.seamAllowanceMm);
      const topBottomAllowanceMm = numberOrNull(component.topBottomAllowanceMm);
      const requestedQuantity = numberOrNull(component.requestedQuantity);
      const bagWidthMm =
        bagDiameterMm !== null && seamAllowanceMm !== null
          ? bagDiameterMm * Math.PI + seamAllowanceMm
          : null;
      const bagLengthWithAllowanceMm =
        bagLengthMm !== null && topBottomAllowanceMm !== null
          ? bagLengthMm + 2 * topBottomAllowanceMm
          : null;

      let totalAllocatedQtyM2 = 0;
      let totalCostEgp = 0;
      let weightedUnitCostArea = 0;
      let totalAllocatedBags = 0;
      let totalLeadTimeDays = 0;

      const sourceMetrics = component.selectedSources.map((source) => {
        const rollWidthM = numberOrNull(source.rollWidthM);
        const rollLengthM = numberOrNull(source.rollLengthM);
        const unitCostUsdPerM2 = numberOrNull(source.unitCostUsdPerM2);
        const leadTimeDays = numberOrNull(source.leadTimeDays);
        const customsEstimate = numberOrNull(source.customsEstimate) ?? 0;
        const rollCount =
          source.sourceType === "stock"
            ? 1
            : Math.max(1, Math.floor(numberOrNull(source.rollCount) ?? 1));

        const bagsAcrossRollWidth =
          isFabricMaterial && rollWidthM !== null && bagWidthMm !== null && bagWidthMm > 0
            ? Math.floor(rollWidthM / bagWidthMm)
            : null;
        const bagsAlongRollLength =
          isFabricMaterial && rollLengthM !== null && bagLengthWithAllowanceMm !== null && bagLengthWithAllowanceMm > 0
            ? Math.floor(rollLengthM / bagLengthWithAllowanceMm)
            : null;
        const bagsPerRoll =
          bagsAcrossRollWidth !== null &&
          bagsAlongRollLength !== null &&
          bagsAcrossRollWidth > 0 &&
          bagsAlongRollLength > 0
            ? bagsAcrossRollWidth * bagsAlongRollLength
            : null;
        const actualAreaPerBagM2 =
          isFabricMaterial && rollWidthM !== null && rollLengthM !== null && bagsPerRoll !== null && bagsPerRoll > 0
            ? (rollWidthM * rollLengthM) / bagsPerRoll
            : null;
        const capacityBags = isFabricMaterial
          ? bagsPerRoll !== null
            ? bagsPerRoll * rollCount
            : null
          : requestedQuantity;
        const requestedAllocatedBags =
          form.sourcingStrategy === "combine-sources"
            ? numberOrNull(source.allocatedBags)
            : requestedQuantity;
        const alreadyUsedFromStock =
          source.sourceType === "stock" ? stockUsageBySource.get(source.sourceId) ?? 0 : 0;
        const remainingCapacityForThisLine =
          capacityBags !== null
            ? Math.max(capacityBags - alreadyUsedFromStock, 0)
            : null;
        const allocatedBags =
          remainingCapacityForThisLine !== null
            ? requestedAllocatedBags === null
              ? Math.min(requestedQuantity ?? remainingCapacityForThisLine, remainingCapacityForThisLine)
              : Math.min(requestedAllocatedBags, remainingCapacityForThisLine)
            : requestedAllocatedBags ?? requestedQuantity;
        const qtyUsedM2 =
          isFabricMaterial && actualAreaPerBagM2 !== null && allocatedBags !== null
            ? actualAreaPerBagM2 * allocatedBags
            : null;
        const totalCostUsdForLine =
          isFabricMaterial && qtyUsedM2 !== null && unitCostUsdPerM2 !== null
            ? qtyUsedM2 * unitCostUsdPerM2
            : null;
        const landedCostPerM2Egp =
          isFabricMaterial && unitCostUsdPerM2 !== null && effectiveExchangeRate !== null
            ? unitCostUsdPerM2 * effectiveExchangeRate +
              (freightCostPerM2Egp ?? 0) +
              customsEstimate +
              (otherChargesPerM2Egp ?? 0)
            : null;
        const totalCostEgpForLine =
          isFabricMaterial
            ? qtyUsedM2 !== null && landedCostPerM2Egp !== null
              ? qtyUsedM2 * landedCostPerM2Egp
              : null
            : allocatedBags !== null && unitCostUsdPerM2 !== null
              ? allocatedBags * unitCostUsdPerM2
              : null;
        const costPerBagEgp =
          isFabricMaterial
            ? actualAreaPerBagM2 !== null && landedCostPerM2Egp !== null
              ? actualAreaPerBagM2 * landedCostPerM2Egp
              : null
            : unitCostUsdPerM2;

        if (qtyUsedM2 !== null) {
          totalAllocatedQtyM2 += qtyUsedM2;
        }

        if (totalCostEgpForLine !== null) {
          totalCostEgp += totalCostEgpForLine;
        }

        if (isFabricMaterial && qtyUsedM2 !== null && unitCostUsdPerM2 !== null) {
          weightedUnitCostArea += qtyUsedM2 * unitCostUsdPerM2;
        }

        if (allocatedBags !== null) {
          totalAllocatedBags += allocatedBags;
        }

        if (source.sourceType === "stock" && allocatedBags !== null) {
          stockUsageBySource.set(source.sourceId, alreadyUsedFromStock + allocatedBags);
        }

        if (leadTimeDays !== null) {
          totalLeadTimeDays = Math.max(totalLeadTimeDays, leadTimeDays);
        }

        const usedRows =
          allocatedBags !== null &&
          bagsAcrossRollWidth !== null &&
          bagsAcrossRollWidth > 0
            ? Math.ceil(allocatedBags / bagsAcrossRollWidth)
            : null;
        const totalRows =
          bagsAlongRollLength !== null ? bagsAlongRollLength * rollCount : null;
        const remainingRows =
          totalRows !== null && usedRows !== null ? Math.max(totalRows - usedRows, 0) : null;
        const remainingRollLengthM =
          isFabricMaterial && remainingRows !== null && bagLengthWithAllowanceMm !== null
            ? remainingRows * bagLengthWithAllowanceMm
            : null;

        return {
          bagsAcrossRollWidth,
          bagsAlongRollLength,
          bagsPerRoll,
          actualAreaPerBagM2,
          allocatedBags,
          requestedAllocatedBags,
          qtyUsedM2,
          totalCostUsd: totalCostUsdForLine,
          totalCostEgp: totalCostEgpForLine,
          costPerBagEgp,
          capacityBags,
          remainingCapacityBags: remainingCapacityForThisLine !== null && allocatedBags !== null
            ? Math.max(remainingCapacityForThisLine - allocatedBags, 0)
            : remainingCapacityForThisLine,
          remainingRollLengthM,
        } satisfies SourceLineMetrics;
      });

      return {
        bagWidthMm,
        bagLengthWithAllowanceMm,
        requestedQuantity,
        actualAreaPerBagM2:
          totalAllocatedBags > 0 ? totalAllocatedQtyM2 / totalAllocatedBags : null,
        materialCostPerBagEgp:
          requestedQuantity !== null && requestedQuantity > 0 ? totalCostEgp / requestedQuantity : null,
        totalMaterialCostEgp:
          requestedQuantity !== null && requestedQuantity > 0 ? totalCostEgp : null,
        totalAllocatedQtyM2: totalAllocatedQtyM2 || null,
        weightedAverageUnitCostUsdPerM2:
          totalAllocatedQtyM2 > 0 ? weightedUnitCostArea / totalAllocatedQtyM2 : null,
        leadTimeDays: totalLeadTimeDays || null,
        sourceMetrics,
      };
    });
  }, [
    effectiveExchangeRate,
    form.componentSelections,
    form.sourcingStrategy,
    freightCostPerM2Egp,
    materials,
    otherChargesPerM2Egp,
  ]);

  const stockUsageSummary = useMemo(() => {
    const summary = new Map<string, StockUsageSummary>();

    form.componentSelections.forEach((component, componentIndex) => {
      const metrics = componentMetrics[componentIndex];

      component.selectedSources.forEach((source, sourceIndex) => {
        if (source.sourceType !== "stock") {
          return;
        }

        const lineMetrics = metrics?.sourceMetrics[sourceIndex];
        const previous = summary.get(source.sourceId);
        const nextUsed = (previous?.usedBags ?? 0) + (lineMetrics?.allocatedBags ?? 0);

        summary.set(source.sourceId, {
          usedBags: nextUsed,
          remainingCapacityBags: lineMetrics?.remainingCapacityBags ?? previous?.remainingCapacityBags ?? null,
          remainingRollLengthM: lineMetrics?.remainingRollLengthM ?? previous?.remainingRollLengthM ?? null,
        });
      });
    });

    return summary;
  }, [componentMetrics, form.componentSelections]);

  const drawerPreviewMetrics = useMemo(() => {
    if (!drawerState) {
      return null;
    }

    const component = form.componentSelections[drawerState.componentIndex];
    const metrics = componentMetrics[drawerState.componentIndex];
    if (!component) {
      return null;
    }

    const bagWidthMm = metrics?.bagWidthMm ?? null;
    const bagLengthWithAllowanceMm = metrics?.bagLengthWithAllowanceMm ?? null;
    const requestedQuantity = numberOrNull(component.requestedQuantity);
    const existingUsedBags =
      drawerState.draftSource.sourceType === "stock"
        ? Math.max(
            (stockUsageSummary.get(drawerState.draftSource.sourceId)?.usedBags ?? 0) -
              (drawerState.sourceIndex !== undefined
                ? componentMetrics[drawerState.componentIndex]?.sourceMetrics[drawerState.sourceIndex]?.allocatedBags ?? 0
                : 0),
            0,
          )
        : 0;

    return calculateSourceLineMetrics({
      component,
      source: drawerState.draftSource,
      sourcingStrategy: form.sourcingStrategy,
      requestedQuantity,
      bagWidthMm,
      bagLengthWithAllowanceMm,
      existingUsedBags,
      effectiveExchangeRate,
      freightCostPerM2Egp,
      otherChargesPerM2Egp,
      isFabricMaterial: isFabricMaterialCategory(getMaterialCategoryById(component.materialId, materials)),
    });
  }, [
    componentMetrics,
    drawerState,
    effectiveExchangeRate,
    form.componentSelections,
    form.sourcingStrategy,
    freightCostPerM2Egp,
    materials,
    otherChargesPerM2Egp,
    stockUsageSummary,
  ]);

  const componentGroups = useMemo(
    () =>
      form.componentSelections.reduce<
        Array<{
          productId: string;
          productName: string;
          requestedQuantity: string;
          items: Array<{ component: ComponentSourcingForm; componentIndex: number }>;
        }>
      >((groups, component, componentIndex) => {
        const existing = groups.find((group) => group.productId === component.productId);

        if (existing) {
          existing.items.push({ component, componentIndex });
          return groups;
        }

        groups.push({
          productId: component.productId,
          productName: component.productName,
          requestedQuantity: component.requestedQuantity,
          items: [{ component, componentIndex }],
        });
        return groups;
      }, []),
    [form.componentSelections],
  );

  const aggregate = useMemo(() => {
    const totalRequiredBags = componentMetrics.reduce(
      (total, metrics) => total + (metrics.requestedQuantity ?? 0),
      0,
    );
    const totalAllocatedQtyM2 = componentMetrics.reduce(
      (total, metrics) => total + (metrics.totalAllocatedQtyM2 ?? 0),
      0,
    );
    const totalMaterialCostEgp = componentMetrics.reduce(
      (total, metrics) => total + (metrics.totalMaterialCostEgp ?? 0),
      0,
    );
    const weightedUnitCostArea = componentMetrics.reduce((total, metrics) => {
      if (
        metrics.weightedAverageUnitCostUsdPerM2 !== null &&
        metrics.totalAllocatedQtyM2 !== null
      ) {
        return total + metrics.weightedAverageUnitCostUsdPerM2 * metrics.totalAllocatedQtyM2;
      }

      return total;
    }, 0);
    const totalLeadTimeDays = componentMetrics.reduce(
      (max, metrics) => Math.max(max, metrics.leadTimeDays ?? 0),
      0,
    );

    return {
      totalRequiredBags: totalRequiredBags || null,
      actualAreaPerBagM2:
        totalRequiredBags > 0 ? totalAllocatedQtyM2 / totalRequiredBags : null,
      totalAllocatedQtyM2: totalAllocatedQtyM2 || null,
      materialCostPerBagEgp:
        totalRequiredBags > 0 ? totalMaterialCostEgp / totalRequiredBags : null,
      totalMaterialCostEgp: totalMaterialCostEgp || null,
      weightedAverageUnitCostUsdPerM2:
        totalAllocatedQtyM2 > 0 ? weightedUnitCostArea / totalAllocatedQtyM2 : null,
      landedCostEgpPerM2:
        totalAllocatedQtyM2 > 0 ? totalMaterialCostEgp / totalAllocatedQtyM2 : null,
      totalLeadTimeDays: totalLeadTimeDays || null,
    };
  }, [componentMetrics]);

  const satisfiedComponentsCount = useMemo(
    () =>
      componentMetrics.filter((metrics) => {
        const requested = metrics.requestedQuantity ?? 0;
        const allocated = metrics.sourceMetrics.reduce((total, line) => total + (line.allocatedBags ?? 0), 0);
        return requested > 0 && allocated >= requested;
      }).length,
    [componentMetrics],
  );

  const costBreakdownComponent =
    costBreakdownComponentIndex === null ? null : form.componentSelections[costBreakdownComponentIndex] ?? null;
  const costBreakdownMetrics =
    costBreakdownComponentIndex === null ? null : componentMetrics[costBreakdownComponentIndex] ?? null;
  const totalCostUsdForBreakdown =
    costBreakdownMetrics?.sourceMetrics.reduce((total, line) => total + (line.totalCostUsd ?? 0), 0) ?? null;
  const totalCostEgpForBreakdown =
    costBreakdownMetrics?.sourceMetrics.reduce((total, line) => total + (line.totalCostEgp ?? 0), 0) ?? null;
  const usdCostPerBagForBreakdown =
    costBreakdownMetrics?.requestedQuantity && totalCostUsdForBreakdown !== null
      ? totalCostUsdForBreakdown / costBreakdownMetrics.requestedQuantity
      : null;
  const convertedCostPerBagForBreakdown =
    usdCostPerBagForBreakdown !== null && effectiveExchangeRate !== null
      ? usdCostPerBagForBreakdown * effectiveExchangeRate
      : null;
  const freightPerBagForBreakdown =
    costBreakdownMetrics?.requestedQuantity &&
    costBreakdownMetrics.totalAllocatedQtyM2 !== null &&
    freightCostPerM2Egp !== null
      ? (costBreakdownMetrics.totalAllocatedQtyM2 * freightCostPerM2Egp) /
        costBreakdownMetrics.requestedQuantity
      : null;
  const otherChargesPerBagForBreakdown =
    costBreakdownMetrics?.requestedQuantity &&
    costBreakdownMetrics.totalAllocatedQtyM2 !== null &&
    otherChargesPerM2Egp !== null
      ? (costBreakdownMetrics.totalAllocatedQtyM2 * otherChargesPerM2Egp) /
        costBreakdownMetrics.requestedQuantity
      : null;
  const customsPerBagForBreakdown =
    costBreakdownMetrics?.requestedQuantity &&
    totalCostEgpForBreakdown !== null &&
    totalCostUsdForBreakdown !== null &&
    effectiveExchangeRate !== null
      ? (totalCostEgpForBreakdown -
          totalCostUsdForBreakdown * effectiveExchangeRate -
          (costBreakdownMetrics.totalAllocatedQtyM2 ?? 0) * (freightCostPerM2Egp ?? 0) -
          (costBreakdownMetrics.totalAllocatedQtyM2 ?? 0) * (otherChargesPerM2Egp ?? 0)) /
        costBreakdownMetrics.requestedQuantity
      : null;
  const isBagBodyCostBreakdown =
    Boolean(costBreakdownComponent && isBagStyleComponent(costBreakdownComponent)) &&
    isFabricMaterialCategory(
      getMaterialCategoryById(costBreakdownComponent?.materialId ?? "", materials),
    );
  const pricePerBagExpression =
    isBagBodyCostBreakdown && costBreakdownComponent && costBreakdownMetrics?.sourceMetrics.length
      ? `${costBreakdownComponent.selectedSources
          .map((source, index) => {
            const lineMetrics = costBreakdownMetrics.sourceMetrics[index];
            return `(${formatMetric(lineMetrics?.allocatedBags ?? null, 0, " bags")} × ${formatMetric(
              lineMetrics?.actualAreaPerBagM2 ?? null,
              4,
              " m²/bag",
            )} × ${formatMetric(numberOrNull(source.unitCostUsdPerM2), 4, " USD/m²")})`;
          })
          .join(" + ")} ÷ requested quantity [${formatMetric(
          costBreakdownMetrics.requestedQuantity ?? null,
          0,
          " bags",
        )}]`
      : "";

  const pickerSourceOptions = useMemo(() => {
    if (!sourcePickerState) {
      return [];
    }

    const component = form.componentSelections[sourcePickerState.componentIndex];
    if (!component) {
      return [];
    }

    const fallbackMaterialId =
      component.materialId ||
      form.componentSelections.find((item) => item.materialId)?.materialId ||
      productConfiguration?.mainFabricMaterialId ||
      "";
    return buildSourceOptions(
      component,
      stockItems,
      importPresets,
      suppliers,
      materials,
      fallbackMaterialId,
    );
  }, [
    form.componentSelections,
    importPresets,
    materials,
    productConfiguration?.mainFabricMaterialId,
    sourcePickerState,
    stockItems,
    suppliers,
  ]);

  const visiblePickerSources = useMemo(() => {
    const normalizedSearch = pickerSearch.trim().toLowerCase();

    return pickerSourceOptions.filter((source) => {
      const matchesTab = activeTab === "all" ? true : source.sourceType === activeTab;
      const matchesSearch =
        normalizedSearch.length === 0 ? true : source.sourceName.toLowerCase().includes(normalizedSearch);

      return matchesTab && matchesSearch;
    });
  }, [activeTab, pickerSearch, pickerSourceOptions]);

  const updateField = <K extends keyof MaterialSourcingForm>(key: K, value: MaterialSourcingForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const removeSource = (componentIndex: number, sourceIndex: number) => {
    setForm((current) => ({
      ...current,
      componentSelections: current.componentSelections.map((component, index) =>
        index === componentIndex
          ? {
              ...component,
              selectedSources: component.selectedSources.filter((_, currentSourceIndex) => currentSourceIndex !== sourceIndex),
            }
          : component,
      ),
    }));
  };

  const syncProductWithProductConfiguration = (productId: string) => {
    if (!productConfiguration) {
      setError("Load Product Configuration before syncing a product.");
      return;
    }

    const currentProductComponents = form.componentSelections.filter(
      (component) => component.productId === productId,
    );
    if (!currentProductComponents.length) {
      return;
    }

    const productSnapshot = productConfiguration.productSnapshots.find(
      (product) => product.productId === productId,
    );
    const sourcedComponents = productSnapshot?.components.filter(isSourcedComponent) ?? [];

    if (!productSnapshot || !sourcedComponents.length) {
      setForm((current) => ({
        ...current,
        componentSelections: current.componentSelections.filter(
          (component) => component.productId !== productId,
        ),
      }));
      setMessage(
        `${currentProductComponents[0]?.productName ?? "This product"} no longer has sourceable components in Product Configuration, so its sourcing snapshot was removed.`,
      );
      setError("");
      return;
    }

    const syncedComponents = sourcedComponents.map((component) =>
      buildComponentSelectionFromSnapshot(
        productSnapshot,
        component,
        productConfiguration,
        materials,
      ),
    );

    setForm((current) => ({
      ...current,
      componentSelections: [
        ...current.componentSelections.filter((component) => component.productId !== productId),
        ...syncedComponents,
      ],
    }));
    setMessage(
      `${productSnapshot.productName} synced from Product Configuration. Save sourcing to rebuild downstream pricing.`,
    );
    setError("");
  };

  const openSourceDrawer = (componentIndex: number, option: SourceOption) => {
    const component = form.componentSelections[componentIndex];
    if (!component) {
      return;
    }

    const existingIndex =
      form.sourcingStrategy === "single-source"
        ? component.selectedSources.findIndex((source) => source.sourceId === option.sourceId)
        : component.selectedSources.findIndex((source) => source.sourceId === option.sourceId);
    const existingSource = existingIndex >= 0 ? component.selectedSources[existingIndex] : null;
    const baseDraftSource = existingSource ? { ...existingSource } : buildSelectedSourceFromOption(option);
    const draftSource =
      form.sourcingStrategy === "combine-sources"
        ? {
            ...baseDraftSource,
            allocatedBags: getAutoAllocatedBagsForSource(
              componentIndex,
              baseDraftSource,
              existingIndex >= 0 ? existingIndex : undefined,
            ),
          }
        : baseDraftSource;

    setDrawerState({
      componentIndex,
      sourceIndex: existingIndex >= 0 ? existingIndex : undefined,
      draftSource,
    });
  };

  const openSourcePicker = (componentIndex: number) => {
    setActiveTab("all");
    setPickerSearch("");
    setSourcePickerState({
      componentIndex,
      selectedSourceId: null,
    });
  };

  const confirmPickerSource = () => {
    if (!sourcePickerState?.selectedSourceId) {
      return;
    }

    const component = form.componentSelections[sourcePickerState.componentIndex];
    if (!component) {
      return;
    }

    const sourceOptions = buildSourceOptions(
      component,
      stockItems,
      importPresets,
      suppliers,
      materials,
      component.materialId || productConfiguration?.mainFabricMaterialId || "",
    );
    const selectedOption = sourceOptions.find((source) => source.sourceId === sourcePickerState.selectedSourceId);

    if (!selectedOption) {
      return;
    }

    setSourcePickerState(null);
    openSourceDrawer(sourcePickerState.componentIndex, selectedOption);
  };

  const getAutoAllocatedBagsForSource = (
    componentIndex: number,
    source: SelectedSourceForm,
    sourceIndex?: number,
  ) => {
    const component = form.componentSelections[componentIndex];
    const metrics = componentMetrics[componentIndex];

    if (!component) {
      return "";
    }

    if (form.sourcingStrategy === "single-source") {
      return component.requestedQuantity;
    }

    const requestedQuantity = numberOrNull(component.requestedQuantity) ?? 0;
    const otherAllocated = component.selectedSources.reduce((total, _item, currentSourceIndex) => {
      if (currentSourceIndex === sourceIndex) {
        return total;
      }

      return total + (metrics?.sourceMetrics[currentSourceIndex]?.allocatedBags ?? 0);
    }, 0);
    const remainingNeeded = Math.max(requestedQuantity - otherAllocated, 0);
    const existingUsedBags =
      source.sourceType === "stock"
        ? Math.max(
            (stockUsageSummary.get(source.sourceId)?.usedBags ?? 0) -
              (sourceIndex !== undefined ? metrics?.sourceMetrics[sourceIndex]?.allocatedBags ?? 0 : 0),
            0,
          )
        : 0;
    const nextMetrics = calculateSourceLineMetrics({
      component,
      source: {
        ...source,
        allocatedBags: remainingNeeded > 0 ? String(remainingNeeded) : "",
      },
      sourcingStrategy: "combine-sources",
      requestedQuantity,
      bagWidthMm: metrics?.bagWidthMm ?? null,
      bagLengthWithAllowanceMm: metrics?.bagLengthWithAllowanceMm ?? null,
      existingUsedBags,
      effectiveExchangeRate,
      freightCostPerM2Egp,
      otherChargesPerM2Egp,
      isFabricMaterial: isFabricMaterialCategory(getMaterialCategoryById(component.materialId, materials)),
    });

    return nextMetrics.allocatedBags !== null ? String(nextMetrics.allocatedBags) : "";
  };

  const updateDrawerDraft = (patch: Partial<SelectedSourceForm>) => {
    setDrawerState((current) =>
      current
        ? {
            ...current,
            draftSource: {
              ...current.draftSource,
              ...patch,
              allocatedBags: getAutoAllocatedBagsForSource(
                current.componentIndex,
                { ...current.draftSource, ...patch },
                current.sourceIndex,
              ),
            },
          }
        : current,
    );
  };

  const updateAddedSource = (componentIndex: number, sourceIndex: number, patch: Partial<SelectedSourceForm>) => {
    setForm((current) => ({
      ...current,
      componentSelections: current.componentSelections.map((component, index) =>
        index === componentIndex
          ? (() => {
              const requestedQuantity = numberOrNull(component.requestedQuantity) ?? 0;
              const otherAllocated = component.selectedSources.reduce((total, source, currentSourceIndex) => {
                if (currentSourceIndex === sourceIndex) {
                  return total;
                }

                return total + (numberOrNull(source.allocatedBags) ?? 0);
              }, 0);
              const maxAllowed = Math.max(requestedQuantity - otherAllocated, 0);
              return {
                ...component,
                selectedSources: component.selectedSources.map((source, currentSourceIndex) =>
                  currentSourceIndex === sourceIndex
                    ? {
                        ...source,
                        ...patch,
                        allocatedBags: getAutoAllocatedBagsForSource(
                          componentIndex,
                          { ...source, ...patch, allocatedBags: String(maxAllowed) },
                          sourceIndex,
                        ),
                      }
                    : source,
                ),
              };
            })()
          : component,
      ),
    }));
  };

  const saveDrawerSource = () => {
    if (!drawerState) {
      return;
    }

    const componentIndex = drawerState.componentIndex;

    setForm((current) => ({
      ...current,
      componentSelections: current.componentSelections.map((component, index) =>
        index === drawerState.componentIndex
          ? upsertSelectedSource(
              component,
              drawerState.draftSource,
              current.sourcingStrategy,
              drawerState.sourceIndex,
            )
          : component,
      ),
    }));
    setDrawerState(null);
    returnToSourcePicker(componentIndex);
  };

  const removeDrawerSource = () => {
    if (!drawerState || drawerState.sourceIndex === undefined) {
      setDrawerState(null);
      return;
    }

    const componentIndex = drawerState.componentIndex;
    removeSource(drawerState.componentIndex, drawerState.sourceIndex);
    setDrawerState(null);
    returnToSourcePicker(componentIndex);
  };

  const openSavedSourceDrawer = (componentIndex: number, sourceIndex: number) => {
    const component = form.componentSelections[componentIndex];
    const source = component?.selectedSources[sourceIndex];
    if (!component || !source) {
      return;
    }

    setDrawerState({
      componentIndex,
      sourceIndex,
      draftSource: { ...source },
    });
  };

  const returnToSourcePicker = (componentIndex: number) => {
    setDrawerState(null);
    setActiveTab("all");
    setPickerSearch("");
    setSourcePickerState({
      componentIndex,
      selectedSourceId: null,
    });
  };

  const toggleProductCollapse = (productId: string) => {
    setCollapsedProducts((current) => ({
      ...current,
      [productId]: !current[productId],
    }));
  };

  const syncAllProducts = () => {
    componentGroups.forEach((group) => {
      syncProductWithProductConfiguration(group.productId);
    });
  };

  const payload = useMemo<MaterialSourceSelection>(() => {
    const componentSelections: BagBodySourcingSelection[] = form.componentSelections.map(
      (component, componentIndex) => {
        const metrics = componentMetrics[componentIndex];
        const selectedSources: SelectedMaterialSource[] = component.selectedSources.map((source, sourceIndex) => {
          const lineMetrics = metrics?.sourceMetrics[sourceIndex];

          return {
            sourceId: source.sourceId,
            sourceName: source.sourceName,
            sourceType: source.sourceType,
            componentId: component.componentId,
            componentName: component.componentName,
            productId: component.productId,
            productName: component.productName,
            supplierId: source.supplierId,
            materialId: source.materialId,
            rollWidthM: numberOrNull(source.rollWidthM),
            rollLengthM: numberOrNull(source.rollLengthM),
            rollCount: source.sourceType === "stock" ? 1 : Math.max(1, Math.floor(numberOrNull(source.rollCount) ?? 1)),
            customsEstimate: numberOrNull(source.customsEstimate),
            bagsAcrossRollWidth: lineMetrics?.bagsAcrossRollWidth ?? null,
            bagsAlongRollLength: lineMetrics?.bagsAlongRollLength ?? null,
            bagsPerRoll: lineMetrics?.bagsPerRoll ?? null,
            allocatedBags: lineMetrics?.allocatedBags ?? null,
            actualAreaPerBagM2: lineMetrics?.actualAreaPerBagM2 ?? null,
            qtyUsedM2: lineMetrics?.qtyUsedM2 ?? null,
            unitCostUsdPerM2: numberOrNull(source.unitCostUsdPerM2),
            totalCostUsd: lineMetrics?.totalCostUsd ?? null,
            leadTimeDays: numberOrNull(source.leadTimeDays),
          };
        });

        return {
          componentId: component.componentId,
          componentName: component.componentName,
          productId: component.productId,
          productName: component.productName,
          materialId: component.materialId,
          requestedQuantity: numberOrNull(component.requestedQuantity),
          bagDiameterMm: numberOrNull(component.bagDiameterMm),
          bagLengthMm: numberOrNull(component.bagLengthMm),
          seamAllowanceMm: numberOrNull(component.seamAllowanceMm),
          topBottomAllowanceMm: numberOrNull(component.topBottomAllowanceMm),
          bagWidthMm: metrics?.bagWidthMm ?? null,
          bagLengthWithAllowanceMm: metrics?.bagLengthWithAllowanceMm ?? null,
          actualAreaPerBagM2: metrics?.actualAreaPerBagM2 ?? null,
          materialCostPerBagEgp: metrics?.materialCostPerBagEgp ?? null,
          totalMaterialCostEgp: metrics?.totalMaterialCostEgp ?? null,
          selectedSources,
        };
      },
    );

    const flatSources = componentSelections.flatMap((selection) => selection.selectedSources);

    return {
      entityType: "MATERIAL_SOURCE_SELECTION",
      tenantId: form.tenantId,
      tenderId,
      productConfigId: form.productConfigId,
      materialId: componentSelections[0]?.materialId ?? "",
      sourcingStrategy: form.sourcingStrategy,
      selectedSources: flatSources,
      componentSelections,
      actualAreaPerBagM2: aggregate.actualAreaPerBagM2,
      totalRequiredBags: aggregate.totalRequiredBags,
      totalAllocatedQtyM2: aggregate.totalAllocatedQtyM2,
      weightedAverageUnitCostUsdPerM2: aggregate.weightedAverageUnitCostUsdPerM2,
      exchangeRate,
      currencySafetyFactorPercent,
      effectiveExchangeRate,
      freightCostPerM2Egp,
      customsCostPerM2Egp: null,
      otherChargesPerM2Egp,
      landedCostEgpPerM2: aggregate.landedCostEgpPerM2,
      materialCostPerBagEgp: aggregate.materialCostPerBagEgp,
      totalMaterialCostEgp: aggregate.totalMaterialCostEgp,
      totalLeadTimeDays: aggregate.totalLeadTimeDays,
      createdAt: "",
      updatedAt: "",
    };
  }, [
    aggregate,
    componentMetrics,
    currencySafetyFactorPercent,
    effectiveExchangeRate,
    exchangeRate,
    form,
    freightCostPerM2Egp,
    otherChargesPerM2Egp,
    tenderId,
  ]);

  const rollPayload = useMemo<RollCalculation>(() => {
    const preferredComponentIndex = form.componentSelections.findIndex(
      (component) =>
        component.bagDiameterMm.trim() ||
        component.bagLengthMm.trim() ||
        component.seamAllowanceMm.trim() ||
        component.topBottomAllowanceMm.trim(),
    );
    const resolvedIndex = preferredComponentIndex >= 0 ? preferredComponentIndex : 0;
    const firstComponent = form.componentSelections[resolvedIndex];
    const firstMetrics = componentMetrics[resolvedIndex];

    return {
      entityType: "ROLL_CALCULATION",
      tenantId: form.tenantId,
      tenderId,
      productConfigId: form.productConfigId,
      bagDiameterMm: firstComponent ? numberOrNull(firstComponent.bagDiameterMm) : null,
      bagLengthMm: firstComponent ? numberOrNull(firstComponent.bagLengthMm) : null,
      seamAllowanceMm: firstComponent ? numberOrNull(firstComponent.seamAllowanceMm) : null,
      topBottomAllowanceMm: firstComponent ? numberOrNull(firstComponent.topBottomAllowanceMm) : null,
      bagWidthMm: firstMetrics?.bagWidthMm ?? null,
      bagCuttingAreaM2: null,
      rollWidthM: null,
      rollLengthM: null,
      rollAreaM2: null,
      wastePercent: null,
      usableRollAreaM2: null,
      theoreticalBagsPerRoll: null,
      actualBagsPerRoll: null,
      actualAreaPerBagM2: aggregate.actualAreaPerBagM2,
      totalFabricRequiredM2: aggregate.totalAllocatedQtyM2,
      createdAt: "",
      updatedAt: "",
    };
  }, [aggregate.actualAreaPerBagM2, aggregate.totalAllocatedQtyM2, componentMetrics, form, tenderId]);

  const save = async (mode: "draft" | "continue") => {
    setError("");
    setMessage("");
    setSaveMode(mode);

    if (!isApiConfigured) {
      setError("Set VITE_API_BASE_URL before saving material sourcing.");
      setSaveMode(null);
      return;
    }

    if (!form.componentSelections.length) {
      setError("Add at least one component in product configuration first.");
      setSaveMode(null);
      return;
    }

    if (!form.exchangeRate.trim() || !form.currencySafetyFactorPercent.trim()) {
      setError("Exchange Rate and Currency Safety Factor % are required in Tender Intake before saving material sourcing.");
      setSaveMode(null);
      return;
    }

    if (
      mode === "continue" &&
      form.componentSelections.some(
        (component) =>
          !component.requestedQuantity.trim() ||
          !component.selectedSources.length ||
          component.selectedSources.some(
            (source) =>
              !source.unitCostUsdPerM2.trim() ||
              (isFabricMaterialCategory(getMaterialCategoryById(component.materialId, materials)) &&
                (!source.rollWidthM.trim() || !source.rollLengthM.trim())) ||
              (form.sourcingStrategy === "combine-sources" && !source.allocatedBags.trim()),
          ),
      )
    ) {
      setError("Each component needs a requested quantity and at least one fully defined source line. In combined mode, enter allocated bags for each line.");
      setSaveMode(null);
      return;
    }

    if (
      mode === "continue" &&
      form.sourcingStrategy === "combine-sources" &&
      form.componentSelections.some((component, componentIndex) => {
        const requested = numberOrNull(component.requestedQuantity) ?? 0;
        const allocated = componentMetrics[componentIndex]?.sourceMetrics.reduce(
          (total, line) => total + (line.allocatedBags ?? 0),
          0,
        ) ?? 0;
        return Math.abs(requested - allocated) > 0.01;
      })
    ) {
      setError("In combined mode, allocated bags across the selected lines must equal the requested quantity for each component.");
      setSaveMode(null);
      return;
    }

    try {
      await api.put<RollCalculation>(`/tenders/${tenderId}/roll-calculation`, rollPayload);
      const response = await api.put<MaterialSourceSelection>(
        `/tenders/${tenderId}/material-sourcing`,
        payload,
      );

      setForm(toForm(response));
      setMessage(
        mode === "draft"
          ? "Material sourcing draft saved."
          : "Material sourcing saved. Continuing to cost build-up.",
      );

      if (mode === "continue") {
        navigate(`/tenders/${tenderId}/cost-build-up`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save material sourcing.");
    } finally {
      setSaveMode(null);
    }
  };

  return (
    <div className="space-y-6">
      <TenderWorkflowStepper currentStep={3} tenderId={tenderId} />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Material Sourcing & Costing</CardTitle>
              <CardDescription>
                Combine roll fit calculation and sourcing in one step for each product component.
              </CardDescription>
            </div>
            <Badge variant="default">MATERIAL_SOURCING</Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="rounded-2xl bg-slate-50 p-6 text-sm text-muted-foreground">
                Loading material sourcing...
              </div>
            ) : null}

            {!isLoading ? (
              <>
                <TenderSummaryBar
                  totalTenderCost={aggregate.totalMaterialCostEgp}
                  satisfiedCount={satisfiedComponentsCount}
                  totalCount={form.componentSelections.length}
                  onSync={syncAllProducts}
                />

                <div className="space-y-4">
                  {componentGroups.map((group) => {
                    const sourcedComponents = group.items.filter(({ component, componentIndex }) => {
                      const status = getComponentStatus(component, componentMetrics[componentIndex]);
                      return status.label === "Sourced";
                    }).length;
                    const productTotalCost = group.items.reduce(
                      (total, item) => total + (componentMetrics[item.componentIndex]?.totalMaterialCostEgp ?? 0),
                      0,
                    );

                    return (
                      <section
                        key={group.productId}
                        className="overflow-hidden rounded-[1.15rem] border border-border/70 bg-white shadow-sm"
                      >
                        <div className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
                          <button
                            aria-expanded={!collapsedProducts[group.productId]}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            onClick={() => toggleProductCollapse(group.productId)}
                            type="button"
                          >
                            {collapsedProducts[group.productId] ? (
                              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0">
                              <p className="text-base font-semibold text-slate-900">{group.productName}</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {group.requestedQuantity || "Not set"} bags requested
                              </p>
                            </div>
                          </button>
                          <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
                            <div className="text-right">
                              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                Progress
                              </p>
                              <p className="mt-1 font-semibold text-slate-900">
                                {sourcedComponents} / {group.items.length} sourced
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                Product Cost
                              </p>
                              <p className="mt-1 font-semibold text-slate-900">
                                {formatMetric(productTotalCost, 2, " EGP")}
                              </p>
                            </div>
                            <OverflowMenu label={`More actions for ${group.productName}`}>
                              <button
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                                onClick={() => syncProductWithProductConfiguration(group.productId)}
                                type="button"
                              >
                                <Save className="h-4 w-4" />
                                Sync Product
                              </button>
                            </OverflowMenu>
                          </div>
                        </div>

                        {!collapsedProducts[group.productId] ? (
                          <div className="border-t border-border/70">
                            <div className="hidden grid-cols-[2.2fr_1.4fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground md:grid">
                              <span>Component</span>
                              <span>Specification</span>
                              <span>Requested</span>
                              <span>Status</span>
                              <span>Cost / Bag</span>
                              <span>Action</span>
                            </div>

                            {group.items.map(({ component, componentIndex }, itemIndex) => {
                              const metrics = componentMetrics[componentIndex];
                              const status = getComponentStatus(component, metrics);
                              const selectedSourceSummary = component.selectedSources[0]
                                ? `${component.selectedSources[0].sourceName}${component.selectedSources.length > 1 ? ` +${component.selectedSources.length - 1}` : ""}`
                                : "No source selected";

                              return (
                                <section
                                  key={component.componentId}
                                  className={cn(
                                    "px-4 sm:px-5",
                                    itemIndex > 0 && "border-t border-border/60",
                                  )}
                                >
                                  <div className="grid gap-3 py-4 md:grid-cols-[2.2fr_1.4fr_1fr_1fr_1fr_1fr] md:items-center md:gap-4">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-slate-900">{component.componentName}</p>
                                      <p className="mt-1 text-sm text-muted-foreground">{selectedSourceSummary}</p>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-slate-800">
                                        {resolveMaterialLabel(component.materialId, materials)}
                                      </p>
                                      <p className="mt-1 text-sm text-muted-foreground">{formatCompactSpec(component)}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground md:hidden">
                                        Requested
                                      </p>
                                      <p className="text-sm text-slate-700">
                                        {formatMetric(
                                          numberOrNull(component.requestedQuantity),
                                          0,
                                          isBagStyleComponent(component) ? " bags" : " units",
                                        )}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground md:hidden">
                                        Status
                                      </p>
                                      <Badge variant={status.variant}>{status.label}</Badge>
                                    </div>
                                    <div>
                                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground md:hidden">
                                        Cost / Bag
                                      </p>
                                      <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium text-slate-900">
                                          {formatMetric(metrics?.materialCostPerBagEgp ?? null, 2, " EGP")}
                                        </p>
                                        <button
                                          aria-label={`Show cost equations for ${component.componentName}`}
                                          className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-900"
                                          onClick={() => setCostBreakdownComponentIndex(componentIndex)}
                                          type="button"
                                        >
                                          ?
                                        </button>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                      <Button
                                        onClick={() => openSourcePicker(componentIndex)}
                                        type="button"
                                        variant={component.selectedSources.length ? "outline" : "default"}
                                      >
                                        {component.selectedSources.length ? "View Sources" : "Select Source"}
                                      </Button>
                                    </div>
                                  </div>

                                </section>
                              );
                            })}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>

              </>
            ) : null}

            <div className="flex flex-col gap-4 rounded-[1.2rem] border border-border bg-white p-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm">
                {message ? <p className="mt-2 text-emerald-600">{message}</p> : null}
                {error ? <p className="mt-2 text-rose-600">{error}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="ghost" onClick={() => navigate(`/tenders/${tenderId}/product-configuration`)}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button type="button" variant="outline" disabled={saveMode !== null} onClick={() => void save("draft")}>
                  <Save className="h-4 w-4" />
                  {saveMode === "draft" ? "Saving..." : "Save Draft"}
                </Button>
                <Button type="button" disabled={saveMode !== null} onClick={() => void save("continue")}>
                  <ArrowRight className="h-4 w-4" />
                  {saveMode === "continue" ? "Saving..." : "Save & Continue"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {sourcePickerState ? (
        <SourceSelectionDrawer
          activeTab={activeTab}
          component={form.componentSelections[sourcePickerState.componentIndex]}
          materials={materials}
          metrics={componentMetrics[sourcePickerState.componentIndex]}
          onClose={() => setSourcePickerState(null)}
          onDone={() => setSourcePickerState(null)}
          onConfirm={confirmPickerSource}
          onOpenAddedSource={(sourceIndex) => {
            setSourcePickerState(null);
            openSavedSourceDrawer(sourcePickerState.componentIndex, sourceIndex);
          }}
          onRemoveAddedSource={(sourceIndex) => removeSource(sourcePickerState.componentIndex, sourceIndex)}
          onUpdateAddedSource={(sourceIndex, patch) =>
            updateAddedSource(sourcePickerState.componentIndex, sourceIndex, patch)
          }
          onSearchChange={setPickerSearch}
          onSelectSource={(sourceId) =>
            setSourcePickerState((current) => (current ? { ...current, selectedSourceId: sourceId } : current))
          }
          onTabChange={setActiveTab}
          searchValue={pickerSearch}
          selectedSourceId={sourcePickerState.selectedSourceId}
          sources={pickerSourceOptions}
          sourcingStrategy={form.sourcingStrategy}
          stockUsageSummary={stockUsageSummary}
          visibleSources={visiblePickerSources}
        />
      ) : null}

      {drawerState ? (
        <SourceManagementDrawer
          component={form.componentSelections[drawerState.componentIndex]}
          componentIndex={drawerState.componentIndex}
          draftMetrics={drawerPreviewMetrics ?? calculateSourceLineMetrics({
            component: form.componentSelections[drawerState.componentIndex],
            source: drawerState.draftSource,
            sourcingStrategy: form.sourcingStrategy,
            requestedQuantity: numberOrNull(form.componentSelections[drawerState.componentIndex]?.requestedQuantity ?? ""),
            bagWidthMm: componentMetrics[drawerState.componentIndex]?.bagWidthMm ?? null,
            bagLengthWithAllowanceMm: componentMetrics[drawerState.componentIndex]?.bagLengthWithAllowanceMm ?? null,
            existingUsedBags: 0,
            effectiveExchangeRate,
            freightCostPerM2Egp,
            otherChargesPerM2Egp,
            isFabricMaterial: isFabricMaterialCategory(
              getMaterialCategoryById(form.componentSelections[drawerState.componentIndex]?.materialId ?? "", materials),
            ),
          })}
          draftSource={drawerState.draftSource}
          metrics={componentMetrics[drawerState.componentIndex]}
          onBack={() => returnToSourcePicker(drawerState.componentIndex)}
          onClose={() => setDrawerState(null)}
          onDelete={drawerState.sourceIndex !== undefined ? removeDrawerSource : undefined}
          onSave={saveDrawerSource}
          onRemoveSource={removeSource}
          onUpdateDraft={updateDrawerDraft}
          sourcingStrategy={form.sourcingStrategy}
          isFabricMaterial={isFabricMaterialCategory(
            getMaterialCategoryById(form.componentSelections[drawerState.componentIndex]?.materialId ?? "", materials),
          )}
        />
      ) : null}

      <Dialog
        description="This shows the detailed equations behind the selected component's cost per bag."
        onClose={() => setCostBreakdownComponentIndex(null)}
        open={costBreakdownComponentIndex !== null && Boolean(costBreakdownComponent && costBreakdownMetrics)}
        title={
          costBreakdownComponent
            ? `${costBreakdownComponent.componentName} Cost / Bag`
            : "Cost / Bag Breakdown"
        }
        size="lg"
      >
        <div className="space-y-3">
          {costBreakdownComponent && costBreakdownMetrics?.sourceMetrics.length ? (
            <>
              {costBreakdownComponent.selectedSources.map((source, index) => {
                const lineMetrics = costBreakdownMetrics.sourceMetrics[index];
                const rollWidthM = numberOrNull(source.rollWidthM);
                const rollLengthM = numberOrNull(source.rollLengthM);

                return (
                  <div
                    key={`${source.sourceId}-${index}`}
                    className="rounded-2xl border border-border bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {isBagBodyCostBreakdown ? "Area / Bag" : "Source Cost"}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{source.sourceName}</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">
                        {isBagBodyCostBreakdown
                          ? formatMetric(lineMetrics?.actualAreaPerBagM2 ?? null, 4, " m²/bag")
                          : formatMetric(lineMetrics?.totalCostEgp ?? null, 2, " EGP")}
                      </p>
                    </div>
                    <div className="mt-3 space-y-1">
                      {isBagBodyCostBreakdown ? (
                        <>
                          <p className="text-sm text-muted-foreground">
                            {`Bag width = diameter [${formatMetric(
                              numberOrNull(costBreakdownComponent.bagDiameterMm),
                              4,
                              " m",
                            )}] × pi [${Math.PI.toFixed(4)}] + seam allowance [${formatMetric(
                              numberOrNull(costBreakdownComponent.seamAllowanceMm),
                              4,
                              " m",
                            )}] = ${formatMetric(costBreakdownMetrics.bagWidthMm, 4, " m")}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {`Bag length with allowance = length [${formatMetric(
                              numberOrNull(costBreakdownComponent.bagLengthMm),
                              4,
                              " m",
                            )}] + 2 × top/bottom allowance [${formatMetric(
                              numberOrNull(costBreakdownComponent.topBottomAllowanceMm),
                              4,
                              " m",
                            )}] = ${formatMetric(costBreakdownMetrics.bagLengthWithAllowanceMm, 4, " m")}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {`Area / bag = (roll width [${formatMetric(rollWidthM, 2, " m")}] × roll length [${formatMetric(
                              rollLengthM,
                              2,
                              " m",
                            )}]) ÷ (bags across = floor(roll width ÷ bag width) [${formatMetric(
                              lineMetrics?.bagsAcrossRollWidth ?? null,
                              0,
                            )}] × bags along = floor(roll length ÷ bag length with allowance) [${formatMetric(
                              lineMetrics?.bagsAlongRollLength ?? null,
                              0,
                            )}]) = (roll width [${formatMetric(rollWidthM, 2, " m")}] × roll length [${formatMetric(
                              rollLengthM,
                              2,
                              " m",
                            )}]) ÷ bags per roll [${formatMetric(lineMetrics?.bagsPerRoll ?? null, 0, " bags/roll")}]`}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">
                            {`Allocated quantity = ${formatMetric(
                              lineMetrics?.allocatedBags ?? null,
                              0,
                              " units",
                            )}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {`Unit cost = ${formatMetric(numberOrNull(source.unitCostUsdPerM2), 2, " EGP/unit")}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {`Source cost = allocated quantity [${formatMetric(
                              lineMetrics?.allocatedBags ?? null,
                              0,
                              " units",
                            )}] × unit cost [${formatMetric(
                              numberOrNull(source.unitCostUsdPerM2),
                              2,
                              " EGP/unit",
                            )}] = ${formatMetric(lineMetrics?.totalCostEgp ?? null, 2, " EGP")}`}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          ) : null}

          {(isBagBodyCostBreakdown
            ? [
                {
                  label: "Price / Bag",
                  expression: pricePerBagExpression,
                  value: formatMetric(usdCostPerBagForBreakdown, 4, " USD"),
                },
                {
                  label: "USD to EGP",
                  expression: `price / bag [${formatMetric(usdCostPerBagForBreakdown, 4, " USD")}] × (exchange rate [${formatMetric(
                    exchangeRate,
                    4,
                    " EGP/USD",
                  )}] × (1 + safety factor [${formatMetric(currencySafetyFactorPercent, 2, "%")}] ÷ 100))`,
                  value: formatMetric(convertedCostPerBagForBreakdown, 2, " EGP"),
                },
                {
                  label: "Freight / Bag",
                  expression: `allocated area [${formatMetric(costBreakdownMetrics?.totalAllocatedQtyM2 ?? null, 4, " m²")}] × freight cost / m² [${formatMetric(
                    freightCostPerM2Egp,
                    2,
                    " EGP/m²",
                  )}] ÷ requested quantity [${formatMetric(costBreakdownMetrics?.requestedQuantity ?? null, 0, " bags")}]`,
                  value: formatMetric(freightPerBagForBreakdown, 2, " EGP"),
                },
                {
                  label: "Other Charges / Bag",
                  expression: `allocated area [${formatMetric(costBreakdownMetrics?.totalAllocatedQtyM2 ?? null, 4, " m²")}] × other charges / m² [${formatMetric(
                    otherChargesPerM2Egp,
                    2,
                    " EGP/m²",
                  )}] ÷ requested quantity [${formatMetric(costBreakdownMetrics?.requestedQuantity ?? null, 0, " bags")}]`,
                  value: formatMetric(otherChargesPerBagForBreakdown, 2, " EGP"),
                },
                {
                  label: "Customs / Bag",
                  expression: `customs / bag [${formatMetric(customsPerBagForBreakdown, 2, " EGP")}]`,
                  value: formatMetric(customsPerBagForBreakdown, 2, " EGP"),
                },
                {
                  label: "Final Material Cost / Bag",
                  expression: `converted price / bag [${formatMetric(convertedCostPerBagForBreakdown, 2, " EGP")}] + freight / bag [${formatMetric(
                    freightPerBagForBreakdown,
                    2,
                    " EGP",
                  )}] + other charges / bag [${formatMetric(otherChargesPerBagForBreakdown, 2, " EGP")}] + customs / bag [${formatMetric(
                    customsPerBagForBreakdown,
                    2,
                    " EGP",
                  )}]`,
                  value: formatMetric(costBreakdownMetrics?.materialCostPerBagEgp ?? null, 2, " EGP"),
                },
              ]
            : [
                {
                  label: "Source Totals",
                  expression: `sum of source costs across selected sources`,
                  value: formatMetric(totalCostEgpForBreakdown, 2, " EGP"),
                },
                {
                  label: "Cost / Unit",
                  expression: `total source cost [${formatMetric(
                    totalCostEgpForBreakdown,
                    2,
                    " EGP",
                  )}] ÷ requested quantity [${formatMetric(
                    costBreakdownMetrics?.requestedQuantity ?? null,
                    0,
                    " units",
                  )}]`,
                  value: formatMetric(costBreakdownMetrics?.materialCostPerBagEgp ?? null, 2, " EGP/unit"),
                },
              ]).map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-border bg-slate-50 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-700">{item.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.expression}</p>
                </div>
                <p className="text-sm font-semibold text-slate-900">{`= ${item.value}`}</p>
              </div>
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  );
};

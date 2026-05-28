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
import { getProductConfigurationSyncStatuses } from "../lib/product-configuration-sync";
import { getTenderPricingFormState } from "../lib/tender-pricing";
import {
  confirmDiscardUnsavedChanges,
  useUnsavedChangesWarning,
} from "../lib/use-unsaved-changes";
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
  StockReservationStatus,
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
  landedCostEgp: string;
  leadTimeDays: string;
  freightCostPerM2Egp: string;
  clearanceCostPerM2Egp: string;
  customsPercent: string;
  customsEstimate: string;
};

type ComponentSourcingForm = {
  componentId: string;
  componentName: string;
  componentType?: string;
  productId: string;
  productName: string;
  materialId: string;
  accessoryTotalPricePerBagEgp: string;
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
  rollWidthMm: number | null;
  rollLengthMm: number | null;
  unitCostUsdPerM2: number | null;
  landedCostEgp: number | null;
  leadTimeDays: number | null;
  freightCostPerM2Egp: number | null;
  clearanceCostPerM2Egp: number | null;
  customsPercent: number | null;
  customsEstimate: number | null;
  availabilityLabel: string;
  reservationStatus?: StockReservationStatus | null;
  reservedForTenderId?: string | null;
  reservedForTenderNumber?: string | null;
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
  freightCostPerM2Egp: number | null;
  clearanceCostPerM2Egp: number | null;
  customsPercent: number | null;
  customsCostPerM2Egp: number | null;
  landedCostPerM2Egp: number | null;
  capacityBags: number | null;
  remainingCapacityBags: number | null;
  remainingRollLengthMm: number | null;
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
  remainingRollLengthMm: number | null;
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
    source.rollWidthMm !== null && bagWidthMm !== null && bagWidthMm > 0
      ? Math.floor(source.rollWidthMm / bagWidthMm)
      : null;
  const bagsAlongRollLength =
    source.rollLengthMm !== null && bagLengthWithAllowanceMm !== null && bagLengthWithAllowanceMm > 0
      ? Math.floor(source.rollLengthMm / bagLengthWithAllowanceMm)
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
  const remainingRollLengthMm =
    remainingRows !== null && bagLengthWithAllowanceMm !== null
      ? remainingRows * bagLengthWithAllowanceMm
      : null;

  return {
    remainingCapacityBags,
    remainingRollLengthMm,
  };
};

const initialForm = (tenderId: string): MaterialSourcingForm => ({
  tenantId: "alimex-demo",
  tenderId,
  productConfigId: "base",
  sourcingStrategy: "combine-sources",
  exchangeRate: "",
  currencySafetyFactorPercent: "",
  freightCostPerM2Egp: "",
  otherChargesPerM2Egp: "",
  componentSelections: [],
});

const applyTenderRateDefaults = (
  form: MaterialSourcingForm,
  tender: TenderRequest | null,
  fallback?: Pick<MaterialSourceSelection, "exchangeRate" | "currencySafetyFactorPercent"> | null,
): MaterialSourcingForm => ({
  ...form,
  exchangeRate: getTenderPricingFormState(tender, fallback).exchangeRate,
  currencySafetyFactorPercent: getTenderPricingFormState(tender, fallback).currencySafetyFactorPercent,
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

const squareMillimetersToSquareMeters = (value: number) => value / 1_000_000;

const toMillimeterInputValue = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }

  const millimeters = parsed * 1000;
  return Number.isInteger(millimeters) ? String(millimeters) : millimeters.toFixed(2).replace(/\.?0+$/, "");
};

const numberOrNullMillimeterInput = (value: string) => {
  const parsed = numberOrNull(value);
  return parsed === null ? null : parsed / 1000;
};

const formatMillimeters = (value: number | string | null | undefined, digits = 0) => {
  if (value === null || value === undefined || value === "") {
    return "Not calculated";
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return "Not calculated";
  }

  const text =
    digits === 0
      ? parsed.toFixed(0)
      : parsed.toFixed(digits).replace(/\.?0+$/, "");

  return `${text} mm`;
};

const formatCompactSpec = (component: ComponentSourcingForm) => {
  const quantity = component.requestedQuantity || "Not set";
  const diameter = component.bagDiameterMm ? formatMillimeters(component.bagDiameterMm) : "-";
  const length = component.bagLengthMm ? formatMillimeters(component.bagLengthMm) : "-";

  if (isBagStyleComponent(component)) {
    return `${quantity} bags · ${diameter} × ${length}`;
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
    <div className="absolute right-0 top-11 z-20 min-w-[160px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-white p-1 shadow-lg">
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
        <div className="sm:min-w-[180px]">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Tender Cost</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{formatMetric(totalTenderCost, 2, " EGP")}</p>
        </div>
        <div className="sm:min-w-[180px]">
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
  if (isAccessoryComponent(component)) {
    return metrics?.materialCostPerBagEgp !== null
      ? { label: "Sourced", variant: "success" as const }
      : { label: "Not priced", variant: "warning" as const };
  }

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
  if (isAccessoryComponent(component)) {
    return {
      requested,
      applied: metrics?.materialCostPerBagEgp !== null ? requested : 0,
    };
  }
  const applied =
    metrics?.sourceMetrics.reduce((total, line) => total + (line.allocatedBags ?? 0), 0) ?? 0;

  return { requested, applied };
};

const SourceSelectionDrawer = ({
  currentTenderId,
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
  onSelectAndConfirm,
  onSelectSource,
  onTabChange,
}: {
  currentTenderId: string;
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
  onSelectAndConfirm: (sourceId: string) => void;
  onSelectSource: (sourceId: string) => void;
  onTabChange: (tab: SourceTab) => void;
}) => {
  const title = `Select Source - ${component.componentName}`;
  const totals = getRequestedAndAppliedTotals(component, metrics);
  const addedSourcesBadge = getQuantityCoverageBadge(totals.requested, totals.applied);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/30">
      <button aria-label="Close source picker overlay" className="absolute inset-0" onClick={onClose} type="button" />
      <aside className="relative z-10 flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-[640px] sm:border-l sm:border-border">
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5 sm:py-5">
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

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
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
                              ? `${formatMillimeters(source.rollWidthM)} x ${formatMillimeters(source.rollLengthM)}`
                              : "Accessory source"}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-sm text-slate-500">
                            {isBagStyleComponent(component)
                              ? source.sourceType === "stock"
                                ? `${source.unitCostUsdPerM2 || "-"} USD/m² • ${source.landedCostEgp || "-"} EGP/m² landing`
                                : `${source.unitCostUsdPerM2 || "-"} USD/m²`
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
                  const previewBagWidthMm =
                    metrics?.bagWidthMm ??
                    (() => {
                      const bagDiameterMm = numberOrNull(component.bagDiameterMm);
                      const seamAllowanceMm = numberOrNull(component.seamAllowanceMm);

                      return bagDiameterMm !== null && seamAllowanceMm !== null
                        ? bagDiameterMm * Math.PI + seamAllowanceMm
                        : null;
                    })();
                  const previewBagLengthWithAllowanceMm =
                    metrics?.bagLengthWithAllowanceMm ??
                    (() => {
                      const bagLengthMm = numberOrNull(component.bagLengthMm);
                      const topBottomAllowanceMm = numberOrNull(component.topBottomAllowanceMm);

                      return bagLengthMm !== null && topBottomAllowanceMm !== null
                        ? bagLengthMm + 2 * topBottomAllowanceMm
                        : null;
                    })();
                  const previewAvailability =
                    source.sourceType === "stock"
                      ? getStockPreviewAvailability(
                          source,
                          previewBagWidthMm,
                          previewBagLengthWithAllowanceMm,
                          stockUsageSummary.get(source.sourceId)?.usedBags ?? 0,
                        )
                      : null;
                  const usesStockAvailabilityFallback =
                    source.sourceType === "stock" &&
                    (!isFabricSource ||
                      !previewAvailability ||
                      previewAvailability.remainingCapacityBags === null ||
                      previewAvailability.remainingRollLengthMm === null);
                  const availability =
                    source.sourceType === "stock"
                      ? isFabricSource
                        ? previewAvailability &&
                          previewAvailability.remainingCapacityBags !== null &&
                          previewAvailability.remainingRollLengthMm !== null
                          ? `${formatMetric(previewAvailability.remainingCapacityBags, 0, " bags")} - Leftover usable roll length: ${formatMillimeters(previewAvailability.remainingRollLengthMm)}`
                          : "Available in stock"
                        : "Available in stock"
                      : source.availabilityLabel;
                  const isSelected = selectedSourceId === source.sourceId;
                  const isAlreadyAdded = component.selectedSources.some(
                    (selectedSource) => selectedSource.sourceId === source.sourceId,
                  );
                  const isReservedByAnotherTender =
                    source.sourceType === "stock" &&
                    Boolean(source.reservedForTenderId) &&
                    source.reservedForTenderId !== currentTenderId;
                  const isDisabled = isAlreadyAdded || isReservedByAnotherTender;
                  const availabilityText = isReservedByAnotherTender
                    ? `${
                        source.reservationStatus === "unavailable" ? "Unavailable" : "Reserved"
                      } by tender ${source.reservedForTenderNumber || source.reservedForTenderId}`
                    : availability;

                  return (
                    <button
                      key={source.sourceId}
                      disabled={isDisabled}
                      className={cn(
                        "w-full rounded-2xl border px-4 py-4 text-left transition-colors",
                        isDisabled && "border-slate-200 bg-slate-100/80 opacity-70",
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-white hover:bg-slate-50",
                      )}
                      onClick={() => {
                        if (!isDisabled) {
                          onSelectSource(source.sourceId);
                        }
                      }}
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
                              ? `${formatMillimeters(source.rollWidthMm)} width • ${formatMillimeters(source.rollLengthMm)} length`
                              : "Accessory source"}
                          </p>
                          <p className="mt-2 text-base font-semibold text-slate-900">
                            {isFabricSource
                              ? source.sourceType === "stock"
                                ? `${formatMetric(source.unitCostUsdPerM2, 3, " USD/m²")} • ${formatMetric(source.landedCostEgp, 2, " EGP/m² landing")}`
                                : formatMetric(source.unitCostUsdPerM2, 3, " USD/m²")
                              : formatMetric(source.unitCostUsdPerM2, 2, " EGP/bag")}
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">Availability: {availabilityText}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-3">
                          <Button
                            disabled={isDisabled}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!isDisabled) {
                                onSelectAndConfirm(source.sourceId);
                              }
                            }}
                            type="button"
                            variant={isSelected ? "default" : "outline"}
                          >
                            {isAlreadyAdded
                              ? "Added"
                              : isReservedByAnotherTender
                                ? source.reservationStatus === "unavailable"
                                  ? "Unavailable"
                                  : "Reserved"
                                : "Select"}
                          </Button>
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

        <div className="border-t border-border px-4 py-4 sm:px-5">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <Button className="w-full sm:w-auto" onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={onDone} type="button" variant="outline">
              Done
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
  rollWidthM: option.rollWidthMm?.toString() ?? "",
  rollLengthM: option.rollLengthMm?.toString() ?? "",
  rollCount: "1",
  allocatedBags: "",
  unitCostUsdPerM2: option.unitCostUsdPerM2?.toString() ?? "",
  landedCostEgp: option.landedCostEgp?.toString() ?? "",
  leadTimeDays: option.leadTimeDays?.toString() ?? "",
  freightCostPerM2Egp: option.freightCostPerM2Egp?.toString() ?? "",
  clearanceCostPerM2Egp: option.clearanceCostPerM2Egp?.toString() ?? "",
  customsPercent: option.customsPercent?.toString() ?? "",
  customsEstimate: option.customsEstimate?.toString() ?? "",
});

const hydrateSelectedSourceFromOption = (
  source: SelectedSourceForm,
  option: SourceOption | null | undefined,
): SelectedSourceForm => {
  if (!option) {
    return source;
  }

  return {
    ...source,
    sourceName: source.sourceName || option.sourceName,
    supplierId: source.supplierId || option.supplierId,
    materialId: source.materialId || option.materialId,
    rollWidthM: source.rollWidthM || (option.rollWidthMm?.toString() ?? ""),
    rollLengthM: source.rollLengthM || (option.rollLengthMm?.toString() ?? ""),
    unitCostUsdPerM2: source.unitCostUsdPerM2 || (option.unitCostUsdPerM2?.toString() ?? ""),
    landedCostEgp: source.landedCostEgp || (option.landedCostEgp?.toString() ?? ""),
    leadTimeDays: source.leadTimeDays || (option.leadTimeDays?.toString() ?? ""),
    freightCostPerM2Egp:
      source.freightCostPerM2Egp || (option.freightCostPerM2Egp?.toString() ?? ""),
    clearanceCostPerM2Egp:
      source.clearanceCostPerM2Egp || (option.clearanceCostPerM2Egp?.toString() ?? ""),
    customsPercent: source.customsPercent || (option.customsPercent?.toString() ?? ""),
    customsEstimate: source.customsEstimate || (option.customsEstimate?.toString() ?? ""),
  };
};

const hydrateComponentSourcesFromOptions = (
  component: ComponentSourcingForm,
  stockItems: StockItem[],
  importPresets: ImportPreset[],
  suppliers: Supplier[],
  materials: Material[],
  fallbackMaterialId?: string,
): ComponentSourcingForm => {
  const sourceOptions = buildSourceOptions(
    component,
    stockItems,
    importPresets,
    suppliers,
    materials,
    fallbackMaterialId,
  );

  return {
    ...component,
    selectedSources: component.selectedSources.map((source) => {
      const matchingOption =
        sourceOptions.find(
          (option) => option.sourceId === source.sourceId && option.sourceType === source.sourceType,
        ) ?? null;

      return hydrateSelectedSourceFromOption(source, matchingOption);
    }),
  };
};

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
  isFabricMaterial: boolean;
}) => {
  const rollWidthMm = numberOrNull(source.rollWidthM);
  const rollLengthMm = numberOrNull(source.rollLengthM);
  const unitCostUsdPerM2 = numberOrNull(source.unitCostUsdPerM2);
  const landedCostEgp = numberOrNull(source.landedCostEgp);
  const freightCostPerM2Egp = numberOrNull(source.freightCostPerM2Egp) ?? 0;
  const clearanceCostPerM2Egp = numberOrNull(source.clearanceCostPerM2Egp) ?? 0;
  const customsPercent = numberOrNull(source.customsPercent) ?? 0;
  const rollCount =
    source.sourceType === "stock" ? 1 : Math.max(1, Math.floor(numberOrNull(source.rollCount) ?? 1));
  const bagsAcrossRollWidth =
    isFabricMaterial && rollWidthMm !== null && bagWidthMm !== null && bagWidthMm > 0
      ? Math.floor(rollWidthMm / bagWidthMm)
      : null;
  const bagsAlongRollLength =
    isFabricMaterial && rollLengthMm !== null && bagLengthWithAllowanceMm !== null && bagLengthWithAllowanceMm > 0
      ? Math.floor(rollLengthMm / bagLengthWithAllowanceMm)
      : null;
  const bagsPerRoll =
    bagsAcrossRollWidth !== null &&
    bagsAlongRollLength !== null &&
    bagsAcrossRollWidth > 0 &&
    bagsAlongRollLength > 0
      ? bagsAcrossRollWidth * bagsAlongRollLength
      : null;
  const actualAreaPerBagM2 =
    isFabricMaterial && rollWidthMm !== null && rollLengthMm !== null && bagsPerRoll !== null && bagsPerRoll > 0
      ? squareMillimetersToSquareMeters(rollWidthMm * rollLengthMm) / bagsPerRoll
      : null;
  const capacityBags = isFabricMaterial
    ? bagsPerRoll !== null
      ? bagsPerRoll * rollCount
      : null
    : requestedQuantity;
  const requestedAllocatedBags =
    sourcingStrategy === "combine-sources"
      ? (numberOrNull(source.allocatedBags) ?? 0)
      : requestedQuantity;
  const usedBeforeThisLine = source.sourceType === "stock" ? existingUsedBags : 0;
  const remainingCapacityForThisLine =
    capacityBags !== null ? Math.max(capacityBags - usedBeforeThisLine, 0) : null;
  const allocatedBags =
    remainingCapacityForThisLine !== null
      ? Math.min(requestedAllocatedBags ?? 0, remainingCapacityForThisLine)
      : requestedAllocatedBags ?? 0;
  const qtyUsedM2 =
    isFabricMaterial && actualAreaPerBagM2 !== null && allocatedBags !== null ? actualAreaPerBagM2 * allocatedBags : null;
  const convertedCostPerM2Egp =
    isFabricMaterial && unitCostUsdPerM2 !== null && effectiveExchangeRate !== null
      ? unitCostUsdPerM2 * effectiveExchangeRate
      : null;
  const customsCostPerM2Egp =
    source.sourceType === "stock"
      ? 0
      : convertedCostPerM2Egp !== null
        ? convertedCostPerM2Egp * (customsPercent / 100)
        : null;
  const landedCostPerM2Egp =
    source.sourceType === "stock"
      ? landedCostEgp
      : convertedCostPerM2Egp !== null
        ? convertedCostPerM2Egp +
          (customsCostPerM2Egp ?? 0) +
          freightCostPerM2Egp +
          clearanceCostPerM2Egp
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
  const remainingRollLengthMm =
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
    freightCostPerM2Egp,
    clearanceCostPerM2Egp,
    customsPercent,
    customsCostPerM2Egp,
    landedCostPerM2Egp,
    remainingCapacityBags:
      remainingCapacityForThisLine !== null && allocatedBags !== null
        ? Math.max(remainingCapacityForThisLine - allocatedBags, 0)
        : remainingCapacityForThisLine,
    remainingRollLengthMm,
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
  component.componentType.trim().toLowerCase().includes("bag") ||
  component.componentName.trim().toLowerCase().includes("bag") ||
  component.componentType.trim().toLowerCase().includes("bag body") ||
  component.componentName.trim().toLowerCase().includes("bag body");

const isSourcedComponent = (_component: Product["components"][number]) => true;

const isAccessoryComponent = (
  component:
    | Pick<ComponentSourcingForm, "componentType" | "componentName">
    | Pick<Product["components"][number], "componentType" | "componentName">,
) =>
  component.componentType?.trim().toLowerCase() === "accessories" ||
  component.componentName?.trim().toLowerCase() === "accessories";

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
    !isAccessoryComponent(component) &&
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
      accessoryTotalPricePerBagEgp:
        component.accessorySnapshot?.totalPricePerBagEgp?.toString() ?? "",
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
    accessoryTotalPricePerBagEgp:
      component.accessorySnapshot?.totalPricePerBagEgp?.toString() ?? "",
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
  sourcingStrategy: "combine-sources",
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
      accessoryTotalPricePerBagEgp: "",
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
        rollWidthM: toMillimeterInputValue(source.rollWidthM),
        rollLengthM: toMillimeterInputValue(source.rollLengthM),
        rollCount: source.rollCount?.toString() ?? (source.sourceType === "stock" ? "1" : ""),
        allocatedBags: source.allocatedBags?.toString() ?? "",
        unitCostUsdPerM2: source.unitCostUsdPerM2?.toString() ?? "",
        landedCostEgp: source.landedCostEgp?.toString() ?? "",
        leadTimeDays: source.leadTimeDays?.toString() ?? "",
        freightCostPerM2Egp:
          source.freightCostPerM2Egp?.toString() ??
          payload.freightCostPerM2Egp?.toString() ??
          "",
        clearanceCostPerM2Egp:
          source.clearanceCostPerM2Egp?.toString() ??
          payload.otherChargesPerM2Egp?.toString() ??
          "",
        customsPercent: source.customsPercent?.toString() ?? "",
        customsEstimate: source.customsEstimate?.toString() ?? "",
      })),
    })) ?? [],
});

const enrichComponentSelectionsFromConfiguration = (
  form: MaterialSourcingForm,
  configuration: ProductConfiguration | null,
  materials: Material[],
) => {
  if (!configuration) {
    return form;
  }

  const componentMap = new Map(
    configuration.productSnapshots.flatMap((product) =>
      product.components.map((component) => [
        `${product.productId}:${component.componentId}`,
        { product, component },
      ]),
    ),
  );

  return {
    ...form,
    componentSelections: form.componentSelections.map((selection) => {
      const match = componentMap.get(`${selection.productId}:${selection.componentId}`);

      if (!match) {
        return selection;
      }

      return {
        ...selection,
        componentType: match.component.componentType,
        materialId:
          selection.materialId ||
          resolveMaterialId(match.component.material, materials) ||
          selection.materialId,
        accessoryTotalPricePerBagEgp:
          match.component.accessorySnapshot?.totalPricePerBagEgp?.toString() ?? "",
      };
    }),
  };
};

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
        rollWidthMm: item.rollWidthM !== null ? item.rollWidthM * 1000 : null,
        rollLengthMm: item.rollLengthM !== null ? item.rollLengthM * 1000 : null,
        unitCostUsdPerM2: item.unitCostUsdPerM2 ?? null,
        landedCostEgp: item.landedCostEgp ?? null,
        leadTimeDays: 0,
        freightCostPerM2Egp: 0,
        clearanceCostPerM2Egp: 0,
        customsPercent: 0,
        customsEstimate: 0,
        availabilityLabel: "In stock",
        reservationStatus: item.reservationStatus ?? null,
        reservedForTenderId: item.reservedForTenderId ?? null,
        reservedForTenderNumber: item.reservedForTenderNumber ?? null,
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
        rollWidthMm: item.rollWidthM !== null ? item.rollWidthM * 1000 : null,
        rollLengthMm: item.rollLengthM !== null ? item.rollLengthM * 1000 : null,
        unitCostUsdPerM2: item.unitCostUsdPerM2,
        landedCostEgp: null,
        leadTimeDays: item.leadTimeDays,
        freightCostPerM2Egp: item.freightCostPerM2Egp ?? 0,
        clearanceCostPerM2Egp: item.clearanceCostPerM2Egp ?? 0,
        customsPercent: item.customsPercent ?? item.customsEstimate ?? 0,
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
  const isStockSource = draftSource.sourceType === "stock";
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
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5 sm:py-5">
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

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-border bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {isBagStyle ? "Bag Width" : "Requested Qty"}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {isBagStyle
                    ? formatMillimeters(metrics?.bagWidthMm ?? null, 1)
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
                  {isFabricMaterial ? "Roll Width (mm)" : "Cost per Bag (EGP)"}
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
                    Roll Length (mm)
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
                {isFabricMaterial && isStockSource ? (
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Landing Cost (EGP/m²)
                    <Input
                      inputMode="decimal"
                      value={draftSource.landedCostEgp}
                      onChange={(event) => onUpdateDraft({ landedCostEgp: event.target.value })}
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
                {isFabricMaterial && !isStockSource ? (
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Freight / m² (EGP)
                    <Input
                      inputMode="decimal"
                      value={draftSource.freightCostPerM2Egp}
                      onChange={(event) => onUpdateDraft({ freightCostPerM2Egp: event.target.value })}
                    />
                  </label>
                ) : null}
                {isFabricMaterial && !isStockSource ? (
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Clearance / m² (EGP)
                    <Input
                      inputMode="decimal"
                      value={draftSource.clearanceCostPerM2Egp}
                      onChange={(event) => onUpdateDraft({ clearanceCostPerM2Egp: event.target.value })}
                    />
                  </label>
                ) : null}
                {isFabricMaterial && !isStockSource ? (
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Customes %
                    <Input
                      inputMode="decimal"
                      value={draftSource.customsPercent}
                      onChange={(event) => onUpdateDraft({ customsPercent: event.target.value })}
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
                      ? formatMillimeters(draftMetrics.remainingRollLengthMm ?? null)
                      : formatMetric(numberOrNull(draftSource.unitCostUsdPerM2), 2, " EGP/bag")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-4 py-4 sm:px-5">
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {onDelete ? "Save this option to add or update its summary line." : "Save this option to add its summary line."}
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
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
        const activeStockItems = loadedStock.filter((item) => item.active);
        const activeImportPresets = loadedImportPresets.filter((item) => item.active);
        const activeSuppliers = loadedSuppliers.filter((item) => item.active);
        setTender(loadedTender);
        setProductConfiguration(loadedConfiguration);
        setMaterials(activeMaterials);
        setStockItems(activeStockItems);
        setImportPresets(activeImportPresets);
        setSuppliers(activeSuppliers);

        if (saved?.componentSelections?.length) {
          const savedForm = enrichComponentSelectionsFromConfiguration(
            toForm(saved),
            loadedConfiguration,
            activeMaterials,
          );
          const nextForm = applyTenderRateDefaults(
            {
              ...savedForm,
              componentSelections: savedForm.componentSelections.map((component) =>
                hydrateComponentSourcesFromOptions(
                  component,
                  activeStockItems,
                  activeImportPresets,
                  activeSuppliers,
                  activeMaterials,
                  component.materialId || loadedConfiguration.mainFabricMaterialId || "",
                ),
              ),
            },
            loadedTender,
            saved,
          );
          setForm(nextForm);
          setLastSavedSignature(JSON.stringify(nextForm));
          return;
        }

        const nextForm = applyTenderRateDefaults(
          {
            ...initialForm(tenderId),
            productConfigId: loadedConfiguration.productConfigId,
            componentSelections: buildComponentSelectionsFromProducts(
              loadedConfiguration,
              activeMaterials,
            ),
          },
          loadedTender,
        );
        setForm(nextForm);
        setLastSavedSignature(JSON.stringify(nextForm));
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
      const isAccessory = isAccessoryComponent(component);
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

      if (isAccessory) {
        const accessoryTotalPricePerBagEgp = numberOrNull(component.accessoryTotalPricePerBagEgp);
        const totalMaterialCostEgp =
          accessoryTotalPricePerBagEgp !== null && requestedQuantity !== null
            ? accessoryTotalPricePerBagEgp * requestedQuantity
            : null;

        return {
          bagWidthMm,
          bagLengthWithAllowanceMm,
          requestedQuantity,
          actualAreaPerBagM2: null,
          materialCostPerBagEgp: accessoryTotalPricePerBagEgp,
          totalMaterialCostEgp,
          totalAllocatedQtyM2: null,
          weightedAverageUnitCostUsdPerM2: null,
          leadTimeDays: null,
          sourceMetrics: [],
        };
      }

      const sourceMetrics = component.selectedSources.map((source) => {
        const rollWidthMm = numberOrNull(source.rollWidthM);
        const rollLengthMm = numberOrNull(source.rollLengthM);
        const unitCostUsdPerM2 = numberOrNull(source.unitCostUsdPerM2);
        const landedCostEgp = numberOrNull(source.landedCostEgp);
        const leadTimeDays = numberOrNull(source.leadTimeDays);
        const freightCostPerM2EgpForSource = numberOrNull(source.freightCostPerM2Egp) ?? 0;
        const clearanceCostPerM2EgpForSource = numberOrNull(source.clearanceCostPerM2Egp) ?? 0;
        const customsPercentForSource = numberOrNull(source.customsPercent) ?? 0;
        const rollCount =
          source.sourceType === "stock"
            ? 1
            : Math.max(1, Math.floor(numberOrNull(source.rollCount) ?? 1));

        const bagsAcrossRollWidth =
          isFabricMaterial && rollWidthMm !== null && bagWidthMm !== null && bagWidthMm > 0
            ? Math.floor(rollWidthMm / bagWidthMm)
            : null;
        const bagsAlongRollLength =
          isFabricMaterial && rollLengthMm !== null && bagLengthWithAllowanceMm !== null && bagLengthWithAllowanceMm > 0
            ? Math.floor(rollLengthMm / bagLengthWithAllowanceMm)
            : null;
        const bagsPerRoll =
          bagsAcrossRollWidth !== null &&
          bagsAlongRollLength !== null &&
          bagsAcrossRollWidth > 0 &&
          bagsAlongRollLength > 0
            ? bagsAcrossRollWidth * bagsAlongRollLength
            : null;
        const actualAreaPerBagM2 =
          isFabricMaterial && rollWidthMm !== null && rollLengthMm !== null && bagsPerRoll !== null && bagsPerRoll > 0
            ? squareMillimetersToSquareMeters(rollWidthMm * rollLengthMm) / bagsPerRoll
            : null;
        const capacityBags = isFabricMaterial
          ? bagsPerRoll !== null
            ? bagsPerRoll * rollCount
            : null
          : requestedQuantity;
        const requestedAllocatedBags =
          form.sourcingStrategy === "combine-sources"
            ? (numberOrNull(source.allocatedBags) ?? 0)
            : requestedQuantity;
        const alreadyUsedFromStock =
          source.sourceType === "stock" ? stockUsageBySource.get(source.sourceId) ?? 0 : 0;
        const remainingCapacityForThisLine =
          capacityBags !== null
            ? Math.max(capacityBags - alreadyUsedFromStock, 0)
            : null;
        const allocatedBags =
          remainingCapacityForThisLine !== null
            ? Math.min(requestedAllocatedBags ?? 0, remainingCapacityForThisLine)
            : requestedAllocatedBags ?? 0;
        const qtyUsedM2 =
          isFabricMaterial && actualAreaPerBagM2 !== null && allocatedBags !== null
            ? actualAreaPerBagM2 * allocatedBags
            : null;
        const totalCostUsdForLine =
          isFabricMaterial && qtyUsedM2 !== null && unitCostUsdPerM2 !== null
            ? qtyUsedM2 * unitCostUsdPerM2
            : null;
        const convertedCostPerM2Egp =
          isFabricMaterial && unitCostUsdPerM2 !== null && effectiveExchangeRate !== null
            ? unitCostUsdPerM2 * effectiveExchangeRate
            : null;
        const customsCostPerM2EgpForSource =
          source.sourceType === "stock"
            ? 0
            : convertedCostPerM2Egp !== null
              ? convertedCostPerM2Egp * (customsPercentForSource / 100)
              : null;
        const landedCostPerM2Egp =
          source.sourceType === "stock"
            ? landedCostEgp
            : convertedCostPerM2Egp !== null
              ? convertedCostPerM2Egp +
                (customsCostPerM2EgpForSource ?? 0) +
                freightCostPerM2EgpForSource +
                clearanceCostPerM2EgpForSource
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
        const remainingRollLengthMm =
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
          freightCostPerM2Egp: freightCostPerM2EgpForSource,
          clearanceCostPerM2Egp: clearanceCostPerM2EgpForSource,
          customsPercent: customsPercentForSource,
          customsCostPerM2Egp: customsCostPerM2EgpForSource,
          landedCostPerM2Egp,
          capacityBags,
          remainingCapacityBags: remainingCapacityForThisLine !== null && allocatedBags !== null
            ? Math.max(remainingCapacityForThisLine - allocatedBags, 0)
            : remainingCapacityForThisLine,
          remainingRollLengthMm,
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
          remainingRollLengthMm: lineMetrics?.remainingRollLengthMm ?? previous?.remainingRollLengthMm ?? null,
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

  const productSyncStatuses = useMemo(
    () =>
      getProductConfigurationSyncStatuses(
        productConfiguration,
        materials,
        form.componentSelections.map((component) => ({
          productId: component.productId,
          productName: component.productName,
          componentId: component.componentId,
          componentName: component.componentName,
          componentType: component.componentType,
          materialId: component.materialId,
          accessoryTotalPricePerBagEgp: component.accessoryTotalPricePerBagEgp,
          requestedQuantity: component.requestedQuantity,
          bagDiameterMm: component.bagDiameterMm,
          bagLengthMm: component.bagLengthMm,
          seamAllowanceMm: component.seamAllowanceMm,
          topBottomAllowanceMm: component.topBottomAllowanceMm,
        })),
      ),
    [form.componentSelections, materials, productConfiguration],
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
      form.componentSelections.reduce((total, component, componentIndex) => {
        const status = getComponentStatus(component, componentMetrics[componentIndex]);
        return total + (status.label === "Sourced" ? 1 : 0);
      }, 0),
    [componentMetrics, form.componentSelections],
  );

  const costBreakdownComponent =
    costBreakdownComponentIndex === null ? null : form.componentSelections[costBreakdownComponentIndex] ?? null;
  const costBreakdownMetrics =
    costBreakdownComponentIndex === null ? null : componentMetrics[costBreakdownComponentIndex] ?? null;
  const requestedQuantityForBreakdown = costBreakdownMetrics?.requestedQuantity ?? null;
  const totalCostUsdForBreakdown =
    costBreakdownMetrics?.sourceMetrics.length
      ? costBreakdownMetrics.sourceMetrics.reduce((total, line, index) => {
          const source = costBreakdownComponent?.selectedSources[index];
          if (source?.sourceType === "stock") {
            return total;
          }

          return total + (line.totalCostUsd ?? 0);
        }, 0)
      : null;
  const totalCostEgpForBreakdown =
    costBreakdownMetrics?.sourceMetrics.length
      ? costBreakdownMetrics.sourceMetrics.reduce((total, line) => total + (line.totalCostEgp ?? 0), 0)
      : costBreakdownMetrics?.totalMaterialCostEgp ?? null;
  const importUsdCostPerBagForBreakdown =
    costBreakdownMetrics?.requestedQuantity && totalCostUsdForBreakdown !== null
      ? totalCostUsdForBreakdown / costBreakdownMetrics.requestedQuantity
      : null;
  const stockEgpCostPerBagForBreakdown =
    costBreakdownMetrics?.requestedQuantity
      ? (costBreakdownMetrics.sourceMetrics.reduce((total, line, index) => {
          const source = costBreakdownComponent?.selectedSources[index];
          if (source?.sourceType !== "stock") {
            return total;
          }

          return total + ((line.actualAreaPerBagM2 ?? 0) * (line.landedCostPerM2Egp ?? 0));
        }, 0))
      : null;
  const convertedCostPerBagForBreakdown =
    importUsdCostPerBagForBreakdown !== null || stockEgpCostPerBagForBreakdown !== null
      ? (importUsdCostPerBagForBreakdown !== null && effectiveExchangeRate !== null
          ? importUsdCostPerBagForBreakdown * effectiveExchangeRate
          : 0) + (stockEgpCostPerBagForBreakdown ?? 0)
      : null;
  const hasImportBreakdown =
    Boolean(costBreakdownComponent?.selectedSources.some((source) => source.sourceType !== "stock"));
  const hasStockBreakdown =
    Boolean(costBreakdownComponent?.selectedSources.some((source) => source.sourceType === "stock"));
  const pricePerBagValue =
    hasImportBreakdown && hasStockBreakdown
      ? `${formatMetric(importUsdCostPerBagForBreakdown, 4, " USD")} + ${formatMetric(stockEgpCostPerBagForBreakdown, 2, " EGP")}`
      : hasStockBreakdown
        ? formatMetric(stockEgpCostPerBagForBreakdown, 2, " EGP")
        : formatMetric(importUsdCostPerBagForBreakdown, 4, " USD");
  const baseCostPerBagLabel =
    hasImportBreakdown && hasStockBreakdown
      ? "converted import + stock price / bag"
      : hasStockBreakdown
        ? "stock price / bag"
        : "converted price / bag";
  const freightPerBagForBreakdown =
    costBreakdownMetrics?.requestedQuantity
      ? (costBreakdownMetrics.sourceMetrics.reduce(
          (total, line) => total + ((line.qtyUsedM2 ?? 0) * (line.freightCostPerM2Egp ?? 0)),
          0,
        )) / costBreakdownMetrics.requestedQuantity
      : null;
  const clearancePerBagForBreakdown =
    costBreakdownMetrics?.requestedQuantity
      ? (costBreakdownMetrics.sourceMetrics.reduce(
          (total, line) => total + ((line.qtyUsedM2 ?? 0) * (line.clearanceCostPerM2Egp ?? 0)),
          0,
        )) / costBreakdownMetrics.requestedQuantity
      : null;
  const customsPerBagForBreakdown =
    costBreakdownMetrics?.requestedQuantity
      ? (costBreakdownMetrics.sourceMetrics.reduce(
          (total, line) => total + ((line.qtyUsedM2 ?? 0) * (line.customsCostPerM2Egp ?? 0)),
          0,
        )) / costBreakdownMetrics.requestedQuantity
      : null;
  const isBagBodyCostBreakdown =
    Boolean(costBreakdownComponent && isBagStyleComponent(costBreakdownComponent)) &&
    isFabricMaterialCategory(
      getMaterialCategoryById(costBreakdownComponent?.materialId ?? "", materials),
    );
  const bagBodySourceBreakdown =
    isBagBodyCostBreakdown && costBreakdownComponent && costBreakdownMetrics?.sourceMetrics.length
      ? costBreakdownComponent.selectedSources.map((source, index) => {
          const lineMetrics = costBreakdownMetrics.sourceMetrics[index];
          const areaPerBag = lineMetrics?.actualAreaPerBagM2 ?? null;
          const allocatedBags = lineMetrics?.allocatedBags ?? null;
          const shareOfRequested =
            requestedQuantityForBreakdown && allocatedBags !== null
              ? allocatedBags / requestedQuantityForBreakdown
              : null;
          const unitCostUsdPerM2 = numberOrNull(source.unitCostUsdPerM2);
          const landedCostPerM2Egp = lineMetrics?.landedCostPerM2Egp ?? null;
          const landedCostInputEgp = numberOrNull(source.landedCostEgp);
          const basePricePerBagUsd =
            source.sourceType !== "stock" && areaPerBag !== null && unitCostUsdPerM2 !== null
              ? areaPerBag * unitCostUsdPerM2
              : null;
          const basePricePerBagEgp =
            source.sourceType === "stock" && areaPerBag !== null && landedCostPerM2Egp !== null
              ? areaPerBag * landedCostPerM2Egp
              : null;
          const convertedPricePerBagEgp =
            source.sourceType === "stock"
              ? basePricePerBagEgp
              : basePricePerBagUsd !== null && effectiveExchangeRate !== null
                ? basePricePerBagUsd * effectiveExchangeRate
                : null;
          const freightPerBag =
            areaPerBag !== null && lineMetrics?.freightCostPerM2Egp !== null
              ? areaPerBag * lineMetrics.freightCostPerM2Egp
              : null;
          const customsPerBag =
            areaPerBag !== null && lineMetrics?.customsCostPerM2Egp !== null
              ? areaPerBag * lineMetrics.customsCostPerM2Egp
              : null;
          const clearancePerBag =
            areaPerBag !== null && lineMetrics?.clearanceCostPerM2Egp !== null
              ? areaPerBag * lineMetrics.clearanceCostPerM2Egp
              : null;
          const finalSourceBagCostEgp =
            convertedPricePerBagEgp !== null
              ? convertedPricePerBagEgp +
                (freightPerBag ?? 0) +
                (customsPerBag ?? 0) +
                (clearancePerBag ?? 0)
              : null;
          const contributionToTotalPerBagEgp =
            requestedQuantityForBreakdown && lineMetrics?.totalCostEgp !== null
              ? lineMetrics.totalCostEgp / requestedQuantityForBreakdown
              : null;

          return {
            source,
            lineMetrics,
            areaPerBag,
            allocatedBags,
            shareOfRequested,
            unitCostUsdPerM2,
            landedCostPerM2Egp,
            landedCostInputEgp,
            basePricePerBagUsd,
            basePricePerBagEgp,
            convertedPricePerBagEgp,
            freightPerBag,
            customsPerBag,
            clearancePerBag,
            finalSourceBagCostEgp,
            contributionToTotalPerBagEgp,
          };
        })
      : [];
  const pricePerBagExpression =
    isBagBodyCostBreakdown && costBreakdownComponent && costBreakdownMetrics?.sourceMetrics.length
      ? `${costBreakdownComponent.selectedSources
          .map((source, index) => {
            const lineMetrics = costBreakdownMetrics.sourceMetrics[index];
            return source.sourceType === "stock"
              ? `(${formatMetric(lineMetrics?.allocatedBags ?? null, 0, " bags")} × ${formatMetric(
                  lineMetrics?.actualAreaPerBagM2 ?? null,
                  4,
                  " m²/bag",
                )} × ${formatMetric(lineMetrics?.landedCostPerM2Egp ?? null, 2, " EGP/m²")})`
              : `(${formatMetric(lineMetrics?.allocatedBags ?? null, 0, " bags")} × ${formatMetric(
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
  const freightPerBagExpression =
    isBagBodyCostBreakdown && costBreakdownComponent && costBreakdownMetrics?.sourceMetrics.length
      ? `${costBreakdownComponent.selectedSources
          .map((_source, index) => {
            const lineMetrics = costBreakdownMetrics.sourceMetrics[index];
            const contribution =
              lineMetrics?.actualAreaPerBagM2 !== null && lineMetrics?.freightCostPerM2Egp !== null
                ? (lineMetrics.actualAreaPerBagM2 ?? 0) * (lineMetrics.freightCostPerM2Egp ?? 0)
                : null;
            return `((area / bag [${formatMetric(
              lineMetrics?.actualAreaPerBagM2 ?? null,
              4,
              " m²/bag",
            )}] × freight cost / m² [${formatMetric(
              lineMetrics?.freightCostPerM2Egp ?? null,
              2,
              " EGP/m²",
            )}]) = ${formatMetric(contribution, 2, " EGP")})`;
          })
          .join(" + ")}`
      : "";
  const clearancePerBagExpression =
    isBagBodyCostBreakdown && costBreakdownComponent && costBreakdownMetrics?.sourceMetrics.length
      ? `${costBreakdownComponent.selectedSources
          .map((_source, index) => {
            const lineMetrics = costBreakdownMetrics.sourceMetrics[index];
            const contribution =
              lineMetrics?.actualAreaPerBagM2 !== null && lineMetrics?.clearanceCostPerM2Egp !== null
                ? (lineMetrics.actualAreaPerBagM2 ?? 0) * (lineMetrics.clearanceCostPerM2Egp ?? 0)
                : null;
            return `((area / bag [${formatMetric(
              lineMetrics?.actualAreaPerBagM2 ?? null,
              4,
              " m²/bag",
            )}] × clearance cost / m² [${formatMetric(
              lineMetrics?.clearanceCostPerM2Egp ?? null,
              2,
              " EGP/m²",
            )}]) = ${formatMetric(contribution, 2, " EGP")})`;
          })
          .join(" + ")}`
      : "";
  const customsPerBagExpression =
    isBagBodyCostBreakdown && costBreakdownComponent && costBreakdownMetrics?.sourceMetrics.length
      ? `${costBreakdownComponent.selectedSources
          .map((source, index) => {
            const lineMetrics = costBreakdownMetrics.sourceMetrics[index];
            const contribution =
              lineMetrics?.actualAreaPerBagM2 !== null &&
              numberOrNull(source.unitCostUsdPerM2) !== null &&
              effectiveExchangeRate !== null
                ? (lineMetrics.actualAreaPerBagM2 ?? 0) *
                  (numberOrNull(source.unitCostUsdPerM2) ?? 0) *
                  effectiveExchangeRate *
                  ((lineMetrics?.customsPercent ?? 0) / 100)
                : null;
            return `(((area / bag [${formatMetric(
              lineMetrics?.actualAreaPerBagM2 ?? null,
              4,
              " m²/bag",
            )}] × cost / m² [${formatMetric(
              numberOrNull(source.unitCostUsdPerM2),
              4,
              " USD/m²",
            )}] × effective exchange rate [${formatMetric(
              effectiveExchangeRate,
              4,
            )}]) × customs % [${formatMetric(
              lineMetrics?.customsPercent ?? null,
              2,
              "%",
            )}]) ÷ 100 = ${formatMetric(contribution, 2, " EGP")})`;
          })
          .join(" + ")}`
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

  const syncProductWithProductConfiguration = async (productId: string) => {
    if (!isApiConfigured || !tenderId) {
      setError("Set VITE_API_BASE_URL before syncing from Product Configuration.");
      return;
    }

    try {
      const [latestConfiguration, latestTender] = await Promise.all([
        api.get<ProductConfiguration>(`/tenders/${tenderId}/product-configuration?tenantId=alimex-demo`),
        api.get<TenderRequest>(`/tenders/${tenderId}?tenantId=alimex-demo`),
      ]);

      setProductConfiguration(latestConfiguration);
      setTender(latestTender);

      const currentProductComponents = form.componentSelections.filter(
        (component) => component.productId === productId,
      );
      const productSnapshot = latestConfiguration.productSnapshots.find(
        (product) => product.productId === productId,
      );
      const sourcedComponents = productSnapshot?.components.filter(isSourcedComponent) ?? [];

      if (!productSnapshot || !sourcedComponents.length) {
        setForm((current) =>
          applyTenderRateDefaults(
            {
              ...current,
              productConfigId: latestConfiguration.productConfigId,
              componentSelections: current.componentSelections.filter(
                (component) => component.productId !== productId,
              ),
            },
            latestTender,
          ),
        );
        setMessage(
          `${currentProductComponents[0]?.productName ?? "This product"} no longer exists upstream, so its sourcing snapshot was removed.`,
        );
        setError("");
        return;
      }

      const syncedComponents = sourcedComponents.map((component) =>
        buildComponentSelectionFromSnapshot(
          productSnapshot,
          component,
          latestConfiguration,
          materials,
        ),
      );

      setForm((current) =>
        applyTenderRateDefaults(
          {
            ...current,
            productConfigId: latestConfiguration.productConfigId,
            componentSelections: [
              ...current.componentSelections.filter((component) => component.productId !== productId),
              ...syncedComponents,
            ],
          },
          latestTender,
        ),
      );
      setMessage(
        `${productSnapshot.productName} reloaded from Product Configuration. Existing sourcing rows for this product were reset.`,
      );
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sync product from Product Configuration.");
    }
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
    const baseDraftSource = existingSource
      ? hydrateSelectedSourceFromOption(existingSource, option)
      : buildSelectedSourceFromOption(option);
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

    confirmPickerSourceById(sourcePickerState.selectedSourceId);
  };

  const confirmPickerSourceById = (sourceId: string) => {
    if (!sourcePickerState) {
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
    const selectedOption = sourceOptions.find((source) => source.sourceId === sourceId);

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

    const component = form.componentSelections[drawerState.componentIndex];
    if (!component) {
      return;
    }

    if (form.sourcingStrategy === "combine-sources") {
      const requestedQuantity = numberOrNull(component.requestedQuantity) ?? 0;
      const metrics = componentMetrics[drawerState.componentIndex];
      const otherAllocated = component.selectedSources.reduce((total, _source, currentSourceIndex) => {
        if (currentSourceIndex === drawerState.sourceIndex) {
          return total;
        }

        return total + (metrics?.sourceMetrics[currentSourceIndex]?.allocatedBags ?? 0);
      }, 0);
      const remainingAllowed = Math.max(requestedQuantity - otherAllocated, 0);
      const draftAllocated = numberOrNull(drawerState.draftSource.allocatedBags) ?? 0;

      if (remainingAllowed <= 0 && drawerState.sourceIndex === undefined) {
        setError("This component is already fully sourced. Remove or reduce an existing source before adding another one.");
        return;
      }

      if (draftAllocated > remainingAllowed) {
        setError("Allocated bags for this source cannot exceed the remaining requested quantity.");
        return;
      }
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

    const sourceOptions = buildSourceOptions(
      component,
      stockItems,
      importPresets,
      suppliers,
      materials,
      component.materialId || productConfiguration?.mainFabricMaterialId || "",
    );
    const matchingOption =
      sourceOptions.find(
        (option) => option.sourceId === source.sourceId && option.sourceType === source.sourceType,
      ) ?? null;

    setDrawerState({
      componentIndex,
      sourceIndex,
      draftSource: hydrateSelectedSourceFromOption(source, matchingOption),
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

  const syncAllProducts = async () => {
    if (!isApiConfigured || !tenderId) {
      setError("Set VITE_API_BASE_URL before syncing from Product Configuration.");
      return;
    }

    try {
      const [latestConfiguration, latestTender] = await Promise.all([
        api.get<ProductConfiguration>(`/tenders/${tenderId}/product-configuration?tenantId=alimex-demo`),
        api.get<TenderRequest>(`/tenders/${tenderId}?tenantId=alimex-demo`),
      ]);

      setProductConfiguration(latestConfiguration);
      setTender(latestTender);
      setCollapsedProducts({});
      setDrawerState(null);
      setSourcePickerState(null);
      setCostBreakdownComponentIndex(null);

      setForm((current) =>
        applyTenderRateDefaults(
          {
            ...current,
            productConfigId: latestConfiguration.productConfigId,
            componentSelections: buildComponentSelectionsFromProducts(latestConfiguration, materials),
          },
          latestTender,
        ),
      );

      setMessage(
        "Material sourcing was refreshed from the latest Product Configuration. Product rows were reset to match upstream changes.",
      );
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sync products from Product Configuration.");
    }
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
            rollWidthM: numberOrNullMillimeterInput(source.rollWidthM),
            rollLengthM: numberOrNullMillimeterInput(source.rollLengthM),
            rollCount: source.sourceType === "stock" ? 1 : Math.max(1, Math.floor(numberOrNull(source.rollCount) ?? 1)),
            landedCostEgp: numberOrNull(source.landedCostEgp),
            customsEstimate: lineMetrics?.customsCostPerM2Egp ?? null,
            customsPercent: numberOrNull(source.customsPercent),
            freightCostPerM2Egp: numberOrNull(source.freightCostPerM2Egp),
            clearanceCostPerM2Egp: numberOrNull(source.clearanceCostPerM2Egp),
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
  const currentSignature = useMemo(() => JSON.stringify(form), [form]);
  const isDirty = currentSignature !== lastSavedSignature;

  useUnsavedChangesWarning(isDirty);

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
      setError("Exchange Rate and Currency Safety Factor % are required at the tender level before saving material sourcing.");
      setSaveMode(null);
      return;
    }

    if (
      mode === "continue" &&
      form.componentSelections.some(
        (component) =>
          !component.requestedQuantity.trim() ||
          (isAccessoryComponent(component)
            ? numberOrNull(component.accessoryTotalPricePerBagEgp) === null
            : !component.selectedSources.length ||
              component.selectedSources.some(
                (source) =>
                  !source.unitCostUsdPerM2.trim() ||
                  (isFabricMaterialCategory(getMaterialCategoryById(component.materialId, materials)) &&
                    (!source.rollWidthM.trim() || !source.rollLengthM.trim())) ||
                  (form.sourcingStrategy === "combine-sources" && !source.allocatedBags.trim()),
              )),
      )
    ) {
      setError("Each component needs a requested quantity. Materials need at least one fully defined source line, and accessories need a total price per bag. In combined mode, enter allocated bags for each material source line.");
      setSaveMode(null);
      return;
    }

    if (
      mode === "continue" &&
      form.sourcingStrategy === "combine-sources" &&
      form.componentSelections.some((component, componentIndex) => {
        if (isAccessoryComponent(component)) {
          return false;
        }
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

      const nextForm = enrichComponentSelectionsFromConfiguration(
        toForm(response),
        productConfiguration,
        materials,
      );
      setForm(nextForm);
      setLastSavedSignature(JSON.stringify(nextForm));
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
      <TenderWorkflowStepper currentStep={3} tenderId={tenderId} isDirty={isDirty} />

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
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-base font-semibold text-slate-900">{group.productName}</p>
                                {productSyncStatuses.get(group.productId)?.isOutOfSync ? (
                                  <Badge variant="warning">Needs Sync</Badge>
                                ) : null}
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {group.requestedQuantity || "Not set"} bags requested
                              </p>
                            </div>
                          </button>
                          <div className="flex w-full flex-col gap-3 text-sm sm:ml-auto sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
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
                              const isAccessory = isAccessoryComponent(component);
                              const selectedSourceSummary = isAccessory
                                ? "Uses accessory snapshot total"
                                : component.selectedSources[0]
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
                                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:justify-end">
                                      {isAccessory ? (
                                        <Badge variant="neutral">No source needed</Badge>
                                      ) : (
                                        <Button
                                          className="w-full sm:w-auto"
                                          onClick={() => openSourcePicker(componentIndex)}
                                          type="button"
                                          variant={component.selectedSources.length ? "outline" : "default"}
                                        >
                                          {component.selectedSources.length ? "View Sources" : "Select Source"}
                                        </Button>
                                      )}
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
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Button
                  className="w-full sm:w-auto"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (!confirmDiscardUnsavedChanges(isDirty)) {
                      return;
                    }

                    navigate(`/tenders/${tenderId}/product-configuration`);
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
          currentTenderId={form.tenderId}
          materials={materials}
          metrics={componentMetrics[sourcePickerState.componentIndex]}
          onClose={() => setSourcePickerState(null)}
          onDone={() => setSourcePickerState(null)}
          onOpenAddedSource={(sourceIndex) => {
            setSourcePickerState(null);
            openSavedSourceDrawer(sourcePickerState.componentIndex, sourceIndex);
          }}
          onRemoveAddedSource={(sourceIndex) => removeSource(sourcePickerState.componentIndex, sourceIndex)}
          onUpdateAddedSource={(sourceIndex, patch) =>
            updateAddedSource(sourcePickerState.componentIndex, sourceIndex, patch)
          }
          onSearchChange={setPickerSearch}
          onSelectAndConfirm={confirmPickerSourceById}
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
        title="Bag Cost / Bag"
        size="lg"
      >
        <div className="space-y-3">
          {isBagBodyCostBreakdown ? (
            <>
              <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Total Material Cost / Bag</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {bagBodySourceBreakdown.length
                        ? `(${bagBodySourceBreakdown
                            .map(
                              (item, sourceIndex) =>
                                `source ${sourceIndex + 1} [${formatMetric(
                                  item.finalSourceBagCostEgp,
                                  2,
                                  " EGP/bag",
                                )}] × allocated [${formatMetric(
                                  item.allocatedBags,
                                  0,
                                  " bags",
                                )}]`,
                            )
                            .join(" + ")}) ÷ requested [${formatMetric(
                            requestedQuantityForBreakdown,
                            0,
                            " bags",
                          )}] = [${formatMetric(costBreakdownMetrics?.materialCostPerBagEgp ?? null, 2, " EGP")}]`
                        : "Sum of all selected source contributions to one finished bag."}
                    </p>
                  </div>
                  <p className="text-base font-semibold text-slate-900">
                    {formatMetric(costBreakdownMetrics?.materialCostPerBagEgp ?? null, 2, " EGP")}
                  </p>
                </div>
              </div>

              {bagBodySourceBreakdown.map((item, index) => {
                const { source, lineMetrics } = item;
                const rollWidthMm = numberOrNull(source.rollWidthM);
                const rollLengthMm = numberOrNull(source.rollLengthM);

                return (
                  <div
                    key={`${source.sourceId}-${index}`}
                    className="rounded-2xl border border-border bg-slate-50 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-slate-700">{`Source ${index + 1}`}</p>
                          <Badge variant={source.sourceType === "stock" ? "success" : "neutral"}>
                            {source.sourceType === "stock" ? "Stock" : "Import"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{source.sourceName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {`Allocated ${formatMetric(item.allocatedBags, 0, " bags")} of ${formatMetric(
                            requestedQuantityForBreakdown,
                            0,
                            " bags",
                          )} requested (${formatMetric(
                            item.shareOfRequested !== null ? item.shareOfRequested * 100 : null,
                            2,
                            "%",
                          )})`}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-slate-700">Bags / Roll</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {`bags across = floor(roll width [${formatMillimeters(
                                rollWidthMm,
                              )}] ÷ bag width [${formatMillimeters(costBreakdownMetrics?.bagWidthMm ?? null, 1)}]) [${formatMetric(
                                lineMetrics?.bagsAcrossRollWidth ?? null,
                                0,
                                " bags",
                              )}] × bags along = floor(roll length [${formatMillimeters(
                                rollLengthMm,
                                0,
                              )}] ÷ bag length with allowance [${formatMillimeters(
                                costBreakdownMetrics?.bagLengthWithAllowanceMm ?? null,
                                1,
                              )}]) [${formatMetric(lineMetrics?.bagsAlongRollLength ?? null, 0, " bags")}]`}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-slate-900">
                            {formatMetric(lineMetrics?.bagsPerRoll ?? null, 0, " bags/roll")}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-slate-700">Area / Bag</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {`((roll width [${formatMillimeters(rollWidthMm)}] × roll length [${formatMillimeters(
                                rollLengthMm,
                                0,
                              )}]) ÷ 1,000,000) ÷ bags per roll [${formatMetric(
                                lineMetrics?.bagsPerRoll ?? null,
                                0,
                                " bags/roll",
                              )}]`}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-slate-900">
                            {formatMetric(item.areaPerBag, 4, " m²/bag")}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-slate-700">Price / Bag</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {source.sourceType === "stock"
                                ? `area / bag [${formatMetric(item.areaPerBag, 4, " m²/bag")}] × landing cost [${formatMetric(
                                    item.landedCostInputEgp ?? item.landedCostPerM2Egp,
                                    2,
                                    " EGP/m²",
                                  )}]`
                                : `area / bag [${formatMetric(item.areaPerBag, 4, " m²/bag")}] × unit cost [${formatMetric(
                                    item.unitCostUsdPerM2,
                                    4,
                                    " USD/m²",
                                  )}]`}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-slate-900">
                            {source.sourceType === "stock"
                              ? formatMetric(item.basePricePerBagEgp, 2, " EGP/bag")
                              : formatMetric(item.basePricePerBagUsd, 4, " USD/bag")}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-slate-700">USD To EGP</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {source.sourceType === "stock"
                                ? `Stock source uses landing cost already in EGP.`
                                : `price / bag [${formatMetric(
                                    item.basePricePerBagUsd,
                                    4,
                                    " USD/bag",
                                  )}] × effective exchange rate [${formatMetric(
                                    effectiveExchangeRate,
                                    4,
                                    " EGP/USD",
                                  )}]`}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-slate-900">
                            {formatMetric(item.convertedPricePerBagEgp, 2, " EGP/bag")}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-sm font-medium text-slate-700">Freight / Bag</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {`area / bag [${formatMetric(item.areaPerBag, 4, " m²/bag")}] × freight [${formatMetric(
                              lineMetrics?.freightCostPerM2Egp ?? null,
                              2,
                              " EGP/m²",
                            )}]`}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {formatMetric(item.freightPerBag, 2, " EGP/bag")}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-sm font-medium text-slate-700">Customs / Bag</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {source.sourceType === "stock"
                              ? "No customs applied for stock source."
                              : `area / bag [${formatMetric(item.areaPerBag, 4, " m²/bag")}] × customs [${formatMetric(
                                  lineMetrics?.customsCostPerM2Egp ?? null,
                                  2,
                                  " EGP/m²",
                                )}]`}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {formatMetric(item.customsPerBag, 2, " EGP/bag")}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-sm font-medium text-slate-700">Clearance / Bag</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {`area / bag [${formatMetric(item.areaPerBag, 4, " m²/bag")}] × clearance [${formatMetric(
                              lineMetrics?.clearanceCostPerM2Egp ?? null,
                              2,
                              " EGP/m²",
                            )}]`}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {formatMetric(item.clearancePerBag, 2, " EGP/bag")}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-slate-700">Final Source Cost / Bag</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {`converted base [${formatMetric(
                                item.convertedPricePerBagEgp,
                                2,
                                " EGP/bag",
                              )}] + freight [${formatMetric(
                                item.freightPerBag,
                                2,
                                " EGP/bag",
                              )}] + customs [${formatMetric(
                                item.customsPerBag,
                                2,
                                " EGP/bag",
                              )}] + clearance [${formatMetric(
                                item.clearancePerBag,
                                2,
                                " EGP/bag",
                              )}]`}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-slate-900">
                            {formatMetric(item.finalSourceBagCostEgp, 2, " EGP/bag")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          ) : costBreakdownComponent && costBreakdownMetrics?.sourceMetrics.length ? (
            <>
              {costBreakdownComponent.selectedSources.map((source, index) => {
                const lineMetrics = costBreakdownMetrics.sourceMetrics[index];
                const rollWidthMm = numberOrNull(source.rollWidthM);
                const rollLengthMm = numberOrNull(source.rollLengthM);

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
                            {`Bag width = diameter [${formatMillimeters(
                              numberOrNull(costBreakdownComponent.bagDiameterMm),
                              0,
                            )}] × pi [${Math.PI.toFixed(4)}] + seam allowance [${formatMillimeters(
                              numberOrNull(costBreakdownComponent.seamAllowanceMm),
                              0,
                            )}] = ${formatMillimeters(costBreakdownMetrics.bagWidthMm, 1)}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {`Bag length with allowance = length [${formatMillimeters(
                              numberOrNull(costBreakdownComponent.bagLengthMm),
                              0,
                            )}] + 2 × top/bottom allowance [${formatMillimeters(
                              numberOrNull(costBreakdownComponent.topBottomAllowanceMm),
                              0,
                            )}] = ${formatMillimeters(costBreakdownMetrics.bagLengthWithAllowanceMm, 1)}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {`Area / bag = ((roll width [${formatMillimeters(rollWidthMm)}] × roll length [${formatMillimeters(
                              rollLengthMm,
                              0,
                            )}]) ÷ 1,000,000) ÷ (bags across = floor(roll width ÷ bag width) [${formatMetric(
                              lineMetrics?.bagsAcrossRollWidth ?? null,
                              0,
                            )}] × bags along = floor(roll length ÷ bag length with allowance) [${formatMetric(
                              lineMetrics?.bagsAlongRollLength ?? null,
                              0,
                            )}]) = ((roll width [${formatMillimeters(rollWidthMm)}] × roll length [${formatMillimeters(
                              rollLengthMm,
                              0,
                            )}]) ÷ 1,000,000) ÷ bags per roll [${formatMetric(lineMetrics?.bagsPerRoll ?? null, 0, " bags/roll")}] m²`}
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

          {!isBagBodyCostBreakdown
            ? [
                {
                  label: "Source Totals",
                  expression: isAccessoryComponent(costBreakdownComponent ?? { componentType: "", componentName: "" })
                    ? `from accessory snapshot total price per bag [${formatMetric(
                        costBreakdownMetrics?.materialCostPerBagEgp ?? null,
                        2,
                        " EGP/unit",
                      )}] × requested quantity [${formatMetric(
                        costBreakdownMetrics?.requestedQuantity ?? null,
                        0,
                        " units",
                      )}]`
                    : `sum of source costs across selected sources`,
                  value: formatMetric(totalCostEgpForBreakdown, 2, " EGP"),
                },
                {
                  label: "Cost / Unit",
                  expression: isAccessoryComponent(costBreakdownComponent ?? { componentType: "", componentName: "" })
                    ? `from accessory snapshot total price per bag`
                    : `total source cost [${formatMetric(
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
              ].map((item) => (
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
              ))
            : null}
        </div>
      </Dialog>
    </div>
  );
};

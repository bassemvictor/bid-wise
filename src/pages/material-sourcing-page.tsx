import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Factory,
  MoreHorizontal,
  PackageSearch,
  Plane,
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

type DensityMode = "comfortable" | "compact";

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

const ComponentMetricsRow = ({
  component,
  metrics,
  onOpenCostBreakdown,
}: {
  component: ComponentSourcingForm;
  metrics: ComponentMetrics | undefined;
  onOpenCostBreakdown: () => void;
}) => {
  const isBagStyle = isBagStyleComponent(component);
  const items = [
    {
      label: "Requested qty",
      value: formatMetric(
        numberOrNull(component.requestedQuantity),
        0,
        isBagStyle ? " bags" : " units",
      ),
      icon: Factory,
      action: null,
    },
    {
      label: isBagStyle ? "Area / bag" : "Selected sources",
      value: isBagStyle
        ? formatMetric(metrics?.actualAreaPerBagM2 ?? null, 4, " m²")
        : `${component.selectedSources.length}`,
      icon: Calculator,
      action: null,
    },
    {
      label: isBagStyle ? "Allocated area" : "Lead time",
      value: isBagStyle
        ? formatMetric(metrics?.totalAllocatedQtyM2 ?? null, 2, " m²")
        : formatMetric(metrics?.leadTimeDays ?? null, 0, " days"),
      icon: PackageSearch,
      action: null,
    },
    {
      label: isBagStyle ? "Cost / bag" : "Total cost",
      value: isBagStyle
        ? formatMetric(metrics?.materialCostPerBagEgp ?? null, 2, " EGP")
        : formatMetric(metrics?.totalMaterialCostEgp ?? null, 2, " EGP"),
      icon: Plane,
      action: isBagStyle ? (
        <button
          aria-label={`Show ${component.componentName} cost calculation`}
          className="rounded-full text-muted-foreground transition-colors hover:text-slate-900"
          onClick={onOpenCostBreakdown}
          type="button"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      ) : null,
    },
    {
      label: isBagStyle ? "Selected sources" : "Cost lines",
      value: `${component.selectedSources.length}`,
      icon: PackageSearch,
      action: null,
    },
  ];

  return (
    <div className="grid gap-3 border-y border-border/80 py-3 md:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <div key={item.label} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-primary shadow-sm">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <span>{item.label}</span>
                {item.action}
              </div>
              <p className="truncate text-sm font-semibold text-slate-900">{item.value}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const SelectedSourceRow = ({
  source,
  lineMetrics,
  isBagStyle,
  sourcingStrategy,
  onEdit,
  onDelete,
}: {
  source: SelectedSourceForm;
  lineMetrics: SourceLineMetrics | undefined;
  isBagStyle: boolean;
  sourcingStrategy: MaterialSourcingForm["sourcingStrategy"];
  onEdit: () => void;
  onDelete: () => void;
}) => (
  <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Selected Source</p>
        <p className="truncate text-sm font-semibold text-slate-900">{source.sourceName}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Type</p>
        <p className="text-sm text-slate-700">{source.sourceType === "stock" ? "Stock" : "Import"}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {isBagStyle && sourcingStrategy === "combine-sources" ? "Applied Bags" : "Quantity"}
        </p>
        <p className="text-sm text-slate-700">
          {formatMetric(lineMetrics?.allocatedBags ?? null, 0, isBagStyle ? " bags" : " units")}
        </p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Cost</p>
        <p className="text-sm text-slate-700">{formatMetric(lineMetrics?.totalCostEgp ?? null, 2, " EGP")}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Detail</p>
        <p className="text-sm text-slate-700">
          {isBagStyle
            ? formatMetric(lineMetrics?.actualAreaPerBagM2 ?? null, 4, " m²/bag")
            : formatMetric(numberOrNull(source.leadTimeDays), 0, " days")}
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2 self-end lg:self-auto">
      <Button onClick={onEdit} type="button" variant="outline">
        Edit
      </Button>
      <OverflowMenu label={`More actions for ${source.sourceName}`}>
        <button
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 transition-colors hover:bg-rose-50"
          onClick={onDelete}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
          Remove
        </button>
      </OverflowMenu>
    </div>
  </div>
);

const SourceFilters = ({
  activeTab,
  searchValue,
  onSearchChange,
  onTabChange,
}: {
  activeTab: SourceTab;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onTabChange: (tab: SourceTab) => void;
}) => (
  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
    <div className="flex gap-2 rounded-2xl border border-border bg-slate-50 p-1">
      {[
        { value: "all", label: "All Sources" },
        { value: "stock", label: "Stock" },
        { value: "import", label: "Import" },
      ].map((tab) => (
        <button
          key={tab.value}
          type="button"
          className={
            activeTab === tab.value
              ? "rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white"
              : "rounded-xl px-4 py-2 text-sm font-medium text-slate-600"
          }
          onClick={() => onTabChange(tab.value as SourceTab)}
        >
          {tab.label}
        </button>
      ))}
    </div>
    <label className="relative block w-full lg:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9"
        placeholder="Search supplier"
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
      />
    </label>
  </div>
);

const SourceOptionsTable = ({
  componentId,
  componentMetrics,
  sources,
  stockUsageSummary,
  onSelect,
}: {
  componentId: string;
  componentMetrics: ComponentMetrics | undefined;
  sources: SourceOption[];
  stockUsageSummary: Map<string, StockUsageSummary>;
  onSelect: (source: SourceOption) => void;
}) => (
  <>
    <div className="hidden overflow-hidden rounded-xl border border-border lg:block">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Supplier</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Width</th>
            <th className="px-4 py-3 font-medium">Length</th>
            <th className="px-4 py-3 font-medium">Price</th>
            <th className="px-4 py-3 font-medium">Availability</th>
            <th className="px-4 py-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => {
            const previewAvailability =
              source.sourceType === "stock"
                ? getStockPreviewAvailability(
                    source,
                    componentMetrics?.bagWidthMm ?? null,
                    componentMetrics?.bagLengthWithAllowanceMm ?? null,
                    stockUsageSummary.get(source.sourceId)?.usedBags ?? 0,
                  )
                : null;
            const isFabricSource = isFabricMaterialCategory(source.materialCategory);
            const availability =
              source.sourceType === "stock"
                ? isFabricSource
                  ? `${formatMetric(previewAvailability?.remainingCapacityBags ?? null, 0, " bags")} / ${formatMetric(previewAvailability?.remainingRollLengthM ?? null, 2, " m")} remaining`
                  : "Available in stock"
                : source.availabilityLabel;

            return (
              <tr key={`${componentId}-${source.sourceId}`} className="border-t border-border align-top">
                <td className="px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{source.sourceName}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">{source.sourceType === "stock" ? "Stock" : "Import"}</td>
                <td className="px-4 py-3 text-slate-700">
                  {isFabricSource ? formatMetric(source.rollWidthM, 2, " m") : "N/A"}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {isFabricSource ? formatMetric(source.rollLengthM, 2, " m") : "N/A"}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {isFabricSource
                    ? formatMetric(source.unitCostUsdPerM2, 3, " USD/m²")
                    : formatMetric(source.unitCostUsdPerM2, 2, " EGP/bag")}
                </td>
                <td className="px-4 py-3 text-slate-700">{availability}</td>
                <td className="px-4 py-3">
                  <Button onClick={() => onSelect(source)} type="button" variant="outline">
                    Select
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <div className="space-y-3 lg:hidden">
      {sources.map((source) => {
        const previewAvailability =
          source.sourceType === "stock"
            ? getStockPreviewAvailability(
                source,
                componentMetrics?.bagWidthMm ?? null,
                componentMetrics?.bagLengthWithAllowanceMm ?? null,
                stockUsageSummary.get(source.sourceId)?.usedBags ?? 0,
              )
            : null;
        const isFabricSource = isFabricMaterialCategory(source.materialCategory);

        return (
          <div key={`${componentId}-${source.sourceId}`} className="rounded-xl border border-border px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{source.sourceName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {source.sourceType === "stock" ? "Stock" : "Import"}
                </p>
              </div>
              <Button onClick={() => onSelect(source)} type="button" variant="outline">
                Select
              </Button>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <p>Width: {isFabricSource ? formatMetric(source.rollWidthM, 2, " m") : "N/A"}</p>
              <p>Length: {isFabricSource ? formatMetric(source.rollLengthM, 2, " m") : "N/A"}</p>
              <p>
                Price:{" "}
                {isFabricSource
                  ? formatMetric(source.unitCostUsdPerM2, 3, " USD/m²")
                  : formatMetric(source.unitCostUsdPerM2, 2, " EGP/bag")}
              </p>
              <p>
                Availability:{" "}
                {source.sourceType === "stock"
                  ? isFabricSource
                    ? `${formatMetric(previewAvailability?.remainingCapacityBags ?? null, 0, " bags")} / ${formatMetric(previewAvailability?.remainingRollLengthM ?? null, 2, " m")} remaining`
                    : "Available in stock"
                  : source.availabilityLabel}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  </>
);

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
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  {isBagStyle ? "Applied Bags" : "Allocated Qty"}
                  <Input
                    inputMode="numeric"
                    disabled={sourcingStrategy === "single-source"}
                    value={
                      sourcingStrategy === "single-source" ? component.requestedQuantity : draftSource.allocatedBags
                    }
                    onChange={(event) => onUpdateDraft({ allocatedBags: event.target.value })}
                  />
                </label>
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

            {component.selectedSources.length ? (
              <div className="rounded-[1.15rem] border border-border bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Saved Options</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Current selections for this component stay compact here.
                    </p>
                  </div>
                  <Badge variant={isBagStyle ? quantityCoverageBadge.variant : "neutral"}>
                    {isBagStyle ? quantityCoverageBadge.label : `${component.selectedSources.length} source(s)`}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {component.selectedSources.map((source, sourceIndex) => (
                    <div
                      key={`${component.componentId}-${source.sourceId}-${sourceIndex}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{source.sourceName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {source.sourceType === "stock" ? "Stock" : "Import"} ·{" "}
                          {isBagStyle
                            ? `${source.rollWidthM || "-"} m x ${source.rollLengthM || "-"} m`
                            : `${source.unitCostUsdPerM2 || "-"} EGP/bag · ${source.leadTimeDays || "-"} days`}
                        </p>
                      </div>
                      <Button
                        onClick={() => onRemoveSource(componentIndex, sourceIndex)}
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
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
  const [form, setForm] = useState<MaterialSourcingForm>(() => initialForm(tenderId));
  const [tender, setTender] = useState<TenderRequest | null>(null);
  const [productConfiguration, setProductConfiguration] = useState<ProductConfiguration | null>(null);
  const [collapsedProducts, setCollapsedProducts] = useState<Record<string, boolean>>({});
  const [collapsedComponents, setCollapsedComponents] = useState<Record<string, boolean>>({});
  const [drawerState, setDrawerState] = useState<SourceDrawerState | null>(null);
  const [costBreakdownComponentIndex, setCostBreakdownComponentIndex] = useState<number | null>(null);
  const [sourceSearchByComponent, setSourceSearchByComponent] = useState<Record<string, string>>({});
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
  const hasFabricComponents = form.componentSelections.some((component) =>
    isFabricMaterialCategory(getMaterialCategoryById(component.materialId, materials)),
  );

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

  const densityMode: DensityMode = "compact";
  const spacingClass = densityMode === "compact" ? "space-y-4" : "space-y-6";

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

    setDrawerState({
      componentIndex,
      sourceIndex: existingIndex >= 0 ? existingIndex : undefined,
      draftSource: existingSource ? { ...existingSource } : buildSelectedSourceFromOption(option),
    });
  };

  const updateDrawerDraft = (patch: Partial<SelectedSourceForm>) => {
    setDrawerState((current) =>
      current
        ? {
            ...current,
            draftSource: { ...current.draftSource, ...patch },
          }
        : current,
    );
  };

  const saveDrawerSource = () => {
    if (!drawerState) {
      return;
    }

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
  };

  const removeDrawerSource = () => {
    if (!drawerState || drawerState.sourceIndex === undefined) {
      setDrawerState(null);
      return;
    }

    removeSource(drawerState.componentIndex, drawerState.sourceIndex);
    setDrawerState(null);
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

  const updateSourceSearch = (componentId: string, value: string) => {
    setSourceSearchByComponent((current) => ({
      ...current,
      [componentId]: value,
    }));
  };

  const toggleProductCollapse = (productId: string) => {
    setCollapsedProducts((current) => ({
      ...current,
      [productId]: !current[productId],
    }));
  };

  const toggleComponentCollapse = (componentKey: string) => {
    setCollapsedComponents((current) => ({
      ...current,
      [componentKey]: !current[componentKey],
    }));
  };

  const collapseAllSections = () => {
    const nextProducts: Record<string, boolean> = {};
    const nextComponents: Record<string, boolean> = {};

    componentGroups.forEach((group) => {
      nextProducts[group.productId] = true;
      group.items.forEach(({ component }) => {
        nextComponents[`${group.productId}:${component.componentId}`] = true;
      });
    });

    setCollapsedProducts(nextProducts);
    setCollapsedComponents(nextComponents);
  };

  const expandAllSections = () => {
    const nextProducts: Record<string, boolean> = {};
    const nextComponents: Record<string, boolean> = {};

    componentGroups.forEach((group) => {
      nextProducts[group.productId] = false;
      group.items.forEach(({ component }) => {
        nextComponents[`${group.productId}:${component.componentId}`] = false;
      });
    });

    setCollapsedProducts(nextProducts);
    setCollapsedComponents(nextComponents);
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

    if (hasFabricComponents && !form.freightCostPerM2Egp.trim()) {
      setError("Freight Cost / m² EGP is required before saving material sourcing.");
      setSaveMode(null);
      return;
    }

    if (
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

                <div className="rounded-[1.15rem] border border-border bg-slate-50/80 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">Sourcing Mode</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Choose a single source or combine multiple sources per component.
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3 xl:min-w-[720px]">
                      <div className="flex flex-wrap gap-2 md:col-span-3 xl:justify-self-end">
                        <Button onClick={expandAllSections} type="button" variant="outline">
                          Expand All
                        </Button>
                        <Button onClick={collapseAllSections} type="button" variant="outline">
                          Collapse All
                        </Button>
                      </div>
                      <div className="flex gap-2 rounded-2xl border border-border bg-white p-1 md:col-span-3 xl:justify-self-end">
                        {[
                          { value: "single-source", label: "Single Source" },
                          { value: "combine-sources", label: "Combine Sources" },
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={
                              form.sourcingStrategy === option.value
                                ? "rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white"
                                : "rounded-xl px-4 py-2 text-sm font-medium text-slate-600"
                            }
                            onClick={() =>
                              updateField(
                                "sourcingStrategy",
                                option.value as MaterialSourcingForm["sourcingStrategy"],
                              )
                            }
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Freight Cost / m² EGP *
                        <Input
                          inputMode="decimal"
                          value={form.freightCostPerM2Egp}
                          onChange={(event) => updateField("freightCostPerM2Egp", event.target.value)}
                        />
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Other Charges / m² EGP
                        <Input
                          inputMode="decimal"
                          value={form.otherChargesPerM2Egp}
                          onChange={(event) => updateField("otherChargesPerM2Egp", event.target.value)}
                        />
                      </label>
                      <div className="rounded-2xl border border-border bg-white px-4 py-3 text-sm text-slate-700">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          Effective Exchange Rate
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">{formatMetric(effectiveExchangeRate, 3)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Set from Tender Intake</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={spacingClass}>
                  {componentGroups.map((group) => {
                    const productAllocatedQuantity = group.items.reduce((total, item) => {
                      const metrics = componentMetrics[item.componentIndex];
                      return (
                        total +
                        (metrics?.sourceMetrics.reduce(
                          (lineTotal, line) => lineTotal + (line.allocatedBags ?? 0),
                          0,
                        ) ?? 0)
                      );
                    }, 0);
                    const productRequestedQuantity = group.items.reduce((total, item) => {
                      const metrics = componentMetrics[item.componentIndex];
                      return total + (metrics?.requestedQuantity ?? 0);
                    }, 0);
                    const productTotalCost = group.items.reduce(
                      (total, item) => total + (componentMetrics[item.componentIndex]?.totalMaterialCostEgp ?? 0),
                      0,
                    );
                    const productCoverageBadge = getQuantityCoverageBadge(
                      productRequestedQuantity > 0 ? productRequestedQuantity : null,
                      productAllocatedQuantity,
                    );
                    const productCostBadge = getTotalCostBadge(
                      productTotalCost > 0 ? productTotalCost : null,
                      productAllocatedQuantity,
                    );

                    return (
                      <section key={group.productId} className="rounded-[1.15rem] border border-border bg-white">
                        <div className="flex flex-wrap items-start gap-3 px-4 py-4 sm:px-5">
                          <button
                            aria-expanded={!collapsedProducts[group.productId]}
                            className="flex min-w-0 flex-1 items-start gap-3 text-left"
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
                              <p className="mt-1 text-sm text-muted-foreground">{group.requestedQuantity || "Not set"} bags requested</p>
                            </div>
                          </button>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={productCoverageBadge.variant}>{productCoverageBadge.label}</Badge>
                            <Badge variant={productCostBadge.variant}>{formatMetric(productTotalCost, 2, " EGP")}</Badge>
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
                          <div className="border-t border-border px-4 py-4 sm:px-5">
                            <div className={spacingClass}>
                            {group.items.map(({ component, componentIndex }) => {
                              const componentCollapseKey = `${group.productId}:${component.componentId}`;
                              const isComponentCollapsed = collapsedComponents[componentCollapseKey] ?? false;
                              const isBagStyle = isBagStyleComponent(component);
                              const metrics = componentMetrics[componentIndex];
                              const allocatedQuantity =
                                metrics?.sourceMetrics.reduce(
                                  (total, line) => total + (line.allocatedBags ?? 0),
                                  0,
                                ) ?? 0;
                              const quantityCoverageBadge = getQuantityCoverageBadge(
                                metrics?.requestedQuantity ?? null,
                                allocatedQuantity,
                              );
                              const totalCostBadge = getTotalCostBadge(
                                metrics?.totalMaterialCostEgp ?? null,
                                allocatedQuantity,
                              );
                              const fallbackMaterialId =
                                component.materialId ||
                                form.componentSelections.find((item) => item.materialId)?.materialId ||
                                productConfiguration?.mainFabricMaterialId ||
                                "";
                              const sourceOptions = buildSourceOptions(
                                component,
                                stockItems,
                                importPresets,
                                suppliers,
                                materials,
                                fallbackMaterialId,
                              );
                              const sourceSearch = sourceSearchByComponent[component.componentId] ?? "";
                              const normalizedSourceSearch = sourceSearch.trim().toLowerCase();
                              const visibleSources = sourceOptions.filter((source) => {
                                const matchesTab = activeTab === "all" ? true : source.sourceType === activeTab;
                                const matchesSupplier =
                                  normalizedSourceSearch.length === 0
                                    ? true
                                    : source.sourceName.toLowerCase().includes(normalizedSourceSearch);

                                return matchesTab && matchesSupplier;
                              });
                              const selectedSourceSummary = component.selectedSources[0]
                                ? `${component.selectedSources[0].sourceName}${component.selectedSources.length > 1 ? ` +${component.selectedSources.length - 1}` : ""}`
                                : "No source selected";

                              return (
                                <section key={component.componentId} className="rounded-xl border border-border/80 bg-slate-50/60">
                                  <div className="flex flex-wrap items-start justify-between gap-4">
                                    <button
                                      aria-expanded={!isComponentCollapsed}
                                      className="flex min-w-0 flex-1 items-start gap-3 px-4 py-4 text-left"
                                      onClick={() => toggleComponentCollapse(componentCollapseKey)}
                                      type="button"
                                    >
                                      {isComponentCollapsed ? (
                                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                                      ) : (
                                        <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                                      )}
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="text-sm font-semibold text-slate-900">
                                            {component.componentName}
                                          </p>
                                          <Badge variant="neutral">
                                            {resolveMaterialLabel(component.materialId, materials)}
                                          </Badge>
                                          {component.componentType ? (
                                            <Badge variant="neutral">{component.componentType}</Badge>
                                          ) : null}
                                        </div>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                          {formatCompactSpec(component)}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {selectedSourceSummary}
                                        </p>
                                      </div>
                                    </button>
                                    <div className="flex flex-wrap items-center gap-2 px-4 py-4">
                                      <Badge variant={quantityCoverageBadge.variant}>{quantityCoverageBadge.label}</Badge>
                                      <Badge variant={totalCostBadge.variant}>{totalCostBadge.label}</Badge>
                                      <OverflowMenu label={`More actions for ${component.componentName}`}>
                                        {isBagStyle ? (
                                          <button
                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                                            onClick={() => setCostBreakdownComponentIndex(componentIndex)}
                                            type="button"
                                          >
                                            <CircleHelp className="h-4 w-4" />
                                            Cost Breakdown
                                          </button>
                                        ) : null}
                                      </OverflowMenu>
                                    </div>
                                  </div>

                                  {!isComponentCollapsed ? (
                                    <div className="space-y-4 border-t border-border bg-white px-4 py-4">
                                      <ComponentMetricsRow
                                        component={component}
                                        metrics={metrics}
                                        onOpenCostBreakdown={() => setCostBreakdownComponentIndex(componentIndex)}
                                      />

                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                          <h4 className="text-sm font-semibold text-slate-900">Selected Source</h4>
                                          <span
                                            className={
                                              component.selectedSources.length
                                                ? "inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700"
                                                : "inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-700"
                                            }
                                          >
                                            {component.selectedSources.length} saved
                                          </span>
                                        </div>
                                        {component.selectedSources.length ? (
                                          <div className="space-y-2">
                                            {component.selectedSources.map((source, sourceIndex) => (
                                              <SelectedSourceRow
                                                key={`${component.componentId}-${source.sourceId}-${sourceIndex}`}
                                                source={source}
                                                lineMetrics={metrics?.sourceMetrics[sourceIndex]}
                                                isBagStyle={isBagStyle}
                                                sourcingStrategy={form.sourcingStrategy}
                                                onDelete={() => removeSource(componentIndex, sourceIndex)}
                                                onEdit={() => openSavedSourceDrawer(componentIndex, sourceIndex)}
                                              />
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50/60 px-3 py-4 text-sm text-rose-700">
                                            No source selected yet.
                                          </div>
                                        )}
                                      </div>

                                      <div className="space-y-3">
                                        <div>
                                          <h4 className="text-sm font-semibold text-slate-900">Source Options</h4>
                                          <p className="mt-1 text-sm text-muted-foreground">
                                            Pick a source to review in the drawer before saving.
                                          </p>
                                        </div>
                                        <SourceFilters
                                          activeTab={activeTab}
                                          onSearchChange={(value) => updateSourceSearch(component.componentId, value)}
                                          onTabChange={(tab) => setActiveTab(tab)}
                                          searchValue={sourceSearch}
                                        />

                                        {visibleSources.length ? (
                                          <SourceOptionsTable
                                            componentId={component.componentId}
                                            componentMetrics={metrics}
                                            onSelect={(source) => openSourceDrawer(componentIndex, source)}
                                            sources={visibleSources}
                                            stockUsageSummary={stockUsageSummary}
                                          />
                                        ) : (
                                          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                                            No source options match the current filters.
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ) : null}
                                </section>
                              );
                            })}
                            </div>
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
        description="This shows the line-by-line math used to build the bag material cost."
        onClose={() => setCostBreakdownComponentIndex(null)}
        open={costBreakdownComponentIndex !== null && Boolean(costBreakdownComponent && costBreakdownMetrics)}
        title={
          costBreakdownComponent
            ? `${costBreakdownComponent.componentName} Cost / Bag`
            : "Cost / Bag Breakdown"
        }
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
                        <p className="text-sm font-medium text-slate-700">Area / Bag</p>
                        <p className="mt-1 text-sm text-muted-foreground">{source.sourceName}</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">
                        {formatMetric(lineMetrics?.actualAreaPerBagM2 ?? null, 4, " m²/bag")}
                      </p>
                    </div>
                    <div className="mt-3 space-y-1">
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
                    </div>
                  </div>
                );
              })}
            </>
          ) : null}

          {[
            {
              label: "Price / Bag",
              expression: `area / bag [${formatMetric(costBreakdownMetrics?.actualAreaPerBagM2 ?? null, 4, " m²")}] × average cost / m² [${formatMetric(
                costBreakdownMetrics?.weightedAverageUnitCostUsdPerM2 ?? null,
                4,
                " USD/m²",
              )}]`,
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
          ))}
        </div>
      </Dialog>
    </div>
  );
};

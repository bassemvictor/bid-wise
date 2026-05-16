import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Factory,
  PackageSearch,
  Plane,
  Plus,
  Save,
  Trash2,
  Truck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { TenderWorkflowStepper } from "../components/tenders/tender-workflow-stepper";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
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

const numberOrNull = (value: string) => {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatMetric = (value: number | null, digits = 2, suffix = "") =>
  value === null || !Number.isFinite(value) ? "Not calculated" : `${value.toFixed(digits)}${suffix}`;

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
  component.componentType.trim().toLowerCase() === "bag body" ||
  component.componentName.trim().toLowerCase() === "bag body";

const resolveMaterialId = (value: string, materials: Material[]) => {
  const match = materials.find(
    (material) => material.materialId === value || material.materialName === value,
  );
  return match?.materialId ?? value;
};

const resolveMaterialLabel = (value: string, materials: Material[]) =>
  materials.find((material) => material.materialId === value)?.materialName ?? value;

const buildComponentSelectionsFromProducts = (
  configuration: ProductConfiguration,
  materials: Material[],
): ComponentSourcingForm[] =>
  configuration.productSnapshots.flatMap((product) => {
    const bagBodyComponents = product.components.filter(isBagBody);
    const productFallbackMaterialId =
      bagBodyComponents
        .map((component) => resolveMaterialId(component.material, materials))
        .find(Boolean) ||
      resolveMaterialId(configuration.mainFabricMaterialId, materials);

    return bagBodyComponents.map((component) => ({
      componentId: component.componentId,
      componentName: component.componentName,
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
  const bagBodyComponents = product.components.filter(isBagBody);
  const productFallbackMaterialId =
    bagBodyComponents
      .map((entry) => resolveMaterialId(entry.material, materials))
      .find(Boolean) ||
    resolveMaterialId(configuration.mainFabricMaterialId, materials);

  return {
    componentId: component.componentId,
    componentName: component.componentName,
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
        rollWidthM: item.rollWidthM,
        rollLengthM: item.rollLengthM,
        unitCostUsdPerM2: item.unitCostUsdPerM2 ?? null,
        leadTimeDays: 0,
        customsEstimate: 0,
        availabilityLabel: "In stock roll",
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
        rollWidthM: item.rollWidthM,
        rollLengthM: item.rollLengthM,
        unitCostUsdPerM2: item.unitCostUsdPerM2,
        leadTimeDays: item.leadTimeDays,
        customsEstimate: item.customsEstimate ?? 0,
        availabilityLabel: "Import roll preset",
      };
    });

  return [...stockSources, ...importSources];
};

const MaterialRollSketch = ({
  count,
}: {
  count: number;
}) => (
  <div className="rounded-[1.25rem] border border-dashed border-border bg-slate-50 p-5">
    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-800">
      <PackageSearch className="h-4 w-4 text-primary" />
      Roll Nesting Preview
    </div>
    <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
      <div className="rounded-3xl bg-white p-4">
        <svg viewBox="0 0 360 180" className="h-44 w-full">
          <rect x="18" y="22" width="324" height="136" rx="20" fill="#dbeafe" stroke="#2563eb" strokeWidth="2" />
          {Array.from({ length: 9 }).map((_, index) => {
            const column = index % 3;
            const row = Math.floor(index / 3);

            return (
              <rect
                key={index}
                x={34 + column * 96}
                y={34 + row * 34}
                width="78"
                height="28"
                rx="10"
                fill={index % 2 === 0 ? "#93c5fd" : "#bfdbfe"}
                stroke="#1d4ed8"
                strokeWidth="1.5"
              />
            );
          })}
          <text x="180" y="16" textAnchor="middle" fontSize="12" fill="#0f172a">
            Roll Width
          </text>
          <text x="180" y="172" textAnchor="middle" fontSize="12" fill="#0f172a">
            Bag Bodies Nested Along Roll Length
          </text>
        </svg>
      </div>
      <div className="grid gap-3">
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Selected Roll Lines</p>
          <p className="mt-2 text-sm font-medium text-slate-900">{count} line(s)</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 text-sm text-muted-foreground">
          Actual area per bag is derived from the roll width and roll length fit counts, rounded down on both axes.
        </div>
      </div>
    </div>
  </div>
);

export const MaterialSourcingPage = () => {
  const navigate = useNavigate();
  const { tenderId = "" } = useParams();
  const [activeTab, setActiveTab] = useState<SourceTab>("all");
  const [form, setForm] = useState<MaterialSourcingForm>(() => initialForm(tenderId));
  const [tender, setTender] = useState<TenderRequest | null>(null);
  const [productConfiguration, setProductConfiguration] = useState<ProductConfiguration | null>(null);
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
          setForm(toForm(saved));
          return;
        }

        setForm((current) => ({
          ...current,
          productConfigId: loadedConfiguration.productConfigId,
          componentSelections: buildComponentSelectionsFromProducts(loadedConfiguration, activeMaterials),
        }));
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
          rollWidthM !== null && bagWidthMm !== null && bagWidthMm > 0
            ? Math.floor(rollWidthM / bagWidthMm)
            : null;
        const bagsAlongRollLength =
          rollLengthM !== null && bagLengthWithAllowanceMm !== null && bagLengthWithAllowanceMm > 0
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
          rollWidthM !== null && rollLengthM !== null && bagsPerRoll !== null && bagsPerRoll > 0
            ? (rollWidthM * rollLengthM) / bagsPerRoll
            : null;
        const capacityBags =
          bagsPerRoll !== null ? bagsPerRoll * rollCount : null;
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
            : null;
        const qtyUsedM2 =
          actualAreaPerBagM2 !== null && allocatedBags !== null
            ? actualAreaPerBagM2 * allocatedBags
            : null;
        const totalCostUsdForLine =
          qtyUsedM2 !== null && unitCostUsdPerM2 !== null
            ? qtyUsedM2 * unitCostUsdPerM2
            : null;
        const landedCostPerM2Egp =
          unitCostUsdPerM2 !== null && effectiveExchangeRate !== null
            ? unitCostUsdPerM2 * effectiveExchangeRate +
              (freightCostPerM2Egp ?? 0) +
              customsEstimate +
              (otherChargesPerM2Egp ?? 0)
            : null;
        const totalCostEgpForLine =
          qtyUsedM2 !== null && landedCostPerM2Egp !== null
            ? qtyUsedM2 * landedCostPerM2Egp
            : null;
        const costPerBagEgp =
          actualAreaPerBagM2 !== null && landedCostPerM2Egp !== null
            ? actualAreaPerBagM2 * landedCostPerM2Egp
            : null;

        if (qtyUsedM2 !== null) {
          totalAllocatedQtyM2 += qtyUsedM2;
        }

        if (totalCostEgpForLine !== null) {
          totalCostEgp += totalCostEgpForLine;
        }

        if (qtyUsedM2 !== null && unitCostUsdPerM2 !== null) {
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
          remainingRows !== null && bagLengthWithAllowanceMm !== null
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

  const updateField = <K extends keyof MaterialSourcingForm>(key: K, value: MaterialSourcingForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateComponent = (componentIndex: number, patch: Partial<ComponentSourcingForm>) => {
    setForm((current) => ({
      ...current,
      componentSelections: current.componentSelections.map((component, index) =>
        index === componentIndex ? { ...component, ...patch } : component,
      ),
    }));
  };

  const updateSource = (
    componentIndex: number,
    sourceIndex: number,
    patch: Partial<SelectedSourceForm>,
  ) => {
    setForm((current) => ({
      ...current,
      componentSelections: current.componentSelections.map((component, index) =>
        index === componentIndex
          ? {
              ...component,
              selectedSources: component.selectedSources.map((source, currentSourceIndex) =>
                currentSourceIndex === sourceIndex ? { ...source, ...patch } : source,
              ),
            }
          : component,
      ),
    }));
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

  const syncComponentWithProductConfiguration = (componentIndex: number) => {
    if (!productConfiguration) {
      setError("Load Product Configuration before syncing a product.");
      return;
    }

    const currentComponent = form.componentSelections[componentIndex];
    if (!currentComponent) {
      return;
    }

    const productSnapshot = productConfiguration.productSnapshots.find(
      (product) => product.productId === currentComponent.productId,
    );
    const bagBodyComponent = productSnapshot?.components.find(
      (component) =>
        component.componentId === currentComponent.componentId ||
        (isBagBody(component) && component.componentName === currentComponent.componentName),
    );

    if (!productSnapshot || !bagBodyComponent) {
      setForm((current) => ({
        ...current,
        componentSelections: current.componentSelections.filter((_, index) => index !== componentIndex),
      }));
      setMessage(
        `${currentComponent.productName} · ${currentComponent.componentName} is no longer in Product Configuration, so its sourcing snapshot was removed.`,
      );
      setError("");
      return;
    }

    const syncedComponent = buildComponentSelectionFromSnapshot(
      productSnapshot,
      bagBodyComponent,
      productConfiguration,
      materials,
    );

    setForm((current) => ({
      ...current,
      componentSelections: current.componentSelections.map((component, index) =>
        index === componentIndex ? syncedComponent : component,
      ),
    }));
    setMessage(
      `${currentComponent.productName} · ${currentComponent.componentName} synced from Product Configuration. Save sourcing to rebuild downstream pricing.`,
    );
    setError("");
  };

  const addSource = (componentIndex: number, option: SourceOption) => {
    setForm((current) => ({
      ...current,
      componentSelections: current.componentSelections.map((component, index) =>
        index === componentIndex
          ? {
              ...component,
              selectedSources:
                current.sourcingStrategy === "single-source"
                  ? [
                      {
                        sourceId: option.sourceId,
                        sourceName: option.sourceName,
                        sourceType: option.sourceType,
                        supplierId: option.supplierId,
                        materialId: option.materialId,
                        rollWidthM: option.rollWidthM?.toString() ?? "",
                        rollLengthM: option.rollLengthM?.toString() ?? "",
                        rollCount: option.sourceType === "stock" ? "1" : "1",
                        allocatedBags: "",
                        unitCostUsdPerM2: option.unitCostUsdPerM2?.toString() ?? "",
                        leadTimeDays: option.leadTimeDays?.toString() ?? "",
                        customsEstimate: option.customsEstimate?.toString() ?? "",
                      },
                    ]
                  : [
                      ...component.selectedSources,
                      {
                        sourceId: option.sourceId,
                        sourceName: option.sourceName,
                        sourceType: option.sourceType,
                        supplierId: option.supplierId,
                        materialId: option.materialId,
                        rollWidthM: option.rollWidthM?.toString() ?? "",
                        rollLengthM: option.rollLengthM?.toString() ?? "",
                        rollCount: option.sourceType === "stock" ? "1" : "1",
                        allocatedBags: "",
                        unitCostUsdPerM2: option.unitCostUsdPerM2?.toString() ?? "",
                        leadTimeDays: option.leadTimeDays?.toString() ?? "",
                        customsEstimate: option.customsEstimate?.toString() ?? "",
                      },
                    ],
            }
          : component,
      ),
    }));
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
    const firstComponent = form.componentSelections[0];
    const firstMetrics = componentMetrics[0];

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
      setError("Add at least one Bag Body component in product configuration first.");
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
              !source.rollWidthM.trim() ||
              !source.rollLengthM.trim() ||
              !source.unitCostUsdPerM2.trim() ||
              (form.sourcingStrategy === "combine-sources" && !source.allocatedBags.trim()),
          ),
      )
    ) {
      setError("Each Bag Body component needs a requested quantity and at least one fully defined source line. In combined mode, enter allocated bags for each line.");
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
      setError("In combined mode, allocated bags across the selected lines must equal the requested quantity for each Bag Body.");
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
                Combine roll fit calculation and sourcing in one step for each Bag Body component.
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
                <div className="grid gap-4 xl:grid-cols-5">
                  {[
                    { label: "Tender", value: tender?.tenderNumber || "Not loaded", icon: Factory },
                    {
                      label: "Delivery",
                      value: tender?.requestedDeliveryTime || "Not loaded",
                      icon: Truck,
                    },
                    {
                      label: "Actual Area / Bag",
                      value: formatMetric(aggregate.actualAreaPerBagM2, 4, " m²"),
                      icon: Calculator,
                    },
                    {
                      label: "Material Cost / Bag",
                      value: formatMetric(aggregate.materialCostPerBagEgp, 2, " EGP"),
                      icon: PackageSearch,
                    },
                    {
                      label: "Total Material Cost",
                      value: formatMetric(aggregate.totalMaterialCostEgp, 2, " EGP"),
                      icon: Plane,
                    },
                  ].map((item) => {
                    const Icon = item.icon;

                    return (
                      <div key={item.label} className="rounded-[1.15rem] border border-border bg-slate-50/80 p-4">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          <Icon className="h-4 w-4 text-primary" />
                          {item.label}
                        </div>
                        <p className="mt-3 text-lg font-semibold text-slate-900">{item.value}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">Sourcing Mode</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Choose a single roll source or combine multiple sources for each Bag Body.
                      </p>
                    </div>
                    <div className="flex gap-2 rounded-2xl border border-border bg-white p-1">
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
                  </div>

                  <div className="grid gap-5 md:grid-cols-3">
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Exchange Rate
                      <Input
                        inputMode="decimal"
                        value={form.exchangeRate}
                        onChange={(event) => updateField("exchangeRate", event.target.value)}
                      />
                    </label>
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Currency Safety Factor %
                      <Input
                        inputMode="decimal"
                        value={form.currencySafetyFactorPercent}
                        onChange={(event) =>
                          updateField("currencySafetyFactorPercent", event.target.value)
                        }
                      />
                    </label>
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Freight Cost / m² EGP
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
                      <p className="mt-2 font-semibold text-slate-900">
                        {formatMetric(effectiveExchangeRate, 3)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {form.componentSelections.map((component, componentIndex) => {
                    const metrics = componentMetrics[componentIndex];
                    const allocatedQuantity = metrics?.sourceMetrics.reduce(
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
                    const visibleSources = sourceOptions.filter((source) =>
                      activeTab === "all" ? true : source.sourceType === activeTab,
                    );

                    return (
                      <div key={component.componentId} className="rounded-[1.25rem] border border-border bg-white p-5">
                        <div className="mb-5 flex items-start justify-between gap-4">
                          <div>
                            <p className="text-base font-semibold text-slate-900">
                              {component.productName} · {component.componentName}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Material: {resolveMaterialLabel(component.materialId, materials)} · Requested quantity:{" "}
                              {component.requestedQuantity || "Not set"}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              onClick={() => syncComponentWithProductConfiguration(componentIndex)}
                              type="button"
                              variant="outline"
                            >
                              Sync Product Configuration
                            </Button>
                            <Badge variant={totalCostBadge.variant}>{totalCostBadge.label}</Badge>
                            <Badge variant={quantityCoverageBadge.variant}>{quantityCoverageBadge.label}</Badge>
                          </div>
                        </div>

                        <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                          <label className="space-y-2 text-sm font-medium text-slate-700">
                            Material
                            <Select
                              value={component.materialId || fallbackMaterialId}
                              onChange={(event) =>
                                updateComponent(componentIndex, {
                                  materialId: event.target.value,
                                  selectedSources: [],
                                })
                              }
                            >
                              <option value="">Select material</option>
                              {materials.map((material) => (
                                <option key={material.materialId} value={material.materialId}>
                                  {material.materialName}
                                </option>
                              ))}
                            </Select>
                          </label>
                          <label className="space-y-2 text-sm font-medium text-slate-700">
                            Requested Quantity
                            <Input
                              inputMode="decimal"
                              value={component.requestedQuantity}
                              onChange={(event) =>
                                updateComponent(componentIndex, { requestedQuantity: event.target.value })
                              }
                            />
                          </label>
                          <label className="space-y-2 text-sm font-medium text-slate-700">
                            Diameter (m)
                            <Input
                              inputMode="decimal"
                              value={component.bagDiameterMm}
                              onChange={(event) =>
                                updateComponent(componentIndex, { bagDiameterMm: event.target.value })
                              }
                            />
                          </label>
                          <label className="space-y-2 text-sm font-medium text-slate-700">
                            Length (m)
                            <Input
                              inputMode="decimal"
                              value={component.bagLengthMm}
                              onChange={(event) =>
                                updateComponent(componentIndex, { bagLengthMm: event.target.value })
                              }
                            />
                          </label>
                          <label className="space-y-2 text-sm font-medium text-slate-700">
                            Seam Allowance (m)
                            <Input
                              inputMode="decimal"
                              value={component.seamAllowanceMm}
                              onChange={(event) =>
                                updateComponent(componentIndex, { seamAllowanceMm: event.target.value })
                              }
                            />
                          </label>
                          <label className="space-y-2 text-sm font-medium text-slate-700">
                            Top / Bottom Allowance (m)
                            <Input
                              inputMode="decimal"
                              value={component.topBottomAllowanceMm}
                              onChange={(event) =>
                                updateComponent(componentIndex, {
                                  topBottomAllowanceMm: event.target.value,
                                })
                              }
                            />
                          </label>
                        </div>

                        <div className="mb-5 grid gap-3 md:grid-cols-4">
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Bag Width</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {formatMetric(metrics?.bagWidthMm ?? null, 4, " m")}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Bag Length + Allowance</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {formatMetric(metrics?.bagLengthWithAllowanceMm ?? null, 4, " m")}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Actual Area / Bag</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {formatMetric(metrics?.actualAreaPerBagM2 ?? null, 4, " m²")}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Material Cost / Bag</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {formatMetric(metrics?.materialCostPerBagEgp ?? null, 2, " EGP")}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-[1.15rem] border border-border bg-slate-50/80 p-4">
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <h4 className="text-sm font-semibold text-slate-900">Source Options</h4>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Pick rolls from in stock or import, then fine-tune the line values below.
                              </p>
                            </div>
                            <div className="flex gap-2 rounded-2xl border border-border bg-white p-1">
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
                                  onClick={() => setActiveTab(tab.value as SourceTab)}
                                >
                                  {tab.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-3">
                            {visibleSources.length ? (
                              visibleSources.map((source) => {
                                const previewAvailability =
                                  source.sourceType === "stock"
                                    ? getStockPreviewAvailability(
                                        source,
                                        metrics?.bagWidthMm ?? null,
                                        metrics?.bagLengthWithAllowanceMm ?? null,
                                        stockUsageSummary.get(source.sourceId)?.usedBags ?? 0,
                                      )
                                    : null;

                                return (
                                <div
                                  key={`${component.componentId}-${source.sourceId}`}
                                  className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                                >
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">{source.sourceName}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {source.sourceType === "stock" ? "In Stock" : "Import"} · {source.availabilityLabel}
                                    </p>
                                    {source.sourceType === "stock" ? (
                                      <p className="mt-1 text-xs text-blue-700">
                                        Remaining:{" "}
                                        {formatMetric(
                                          previewAvailability?.remainingCapacityBags ?? null,
                                          0,
                                          " bags",
                                        )}{" "}
                                        ·{" "}
                                        {formatMetric(
                                          previewAvailability?.remainingRollLengthM ?? null,
                                          2,
                                          " m length",
                                        )}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
                                    <span>{formatMetric(source.rollWidthM, 2, " m")} width</span>
                                    <span>{formatMetric(source.rollLengthM, 2, " m")} length</span>
                                    <span>{formatMetric(source.unitCostUsdPerM2, 3, " USD/m²")}</span>
                                    <Button
                                      onClick={() => addSource(componentIndex, source)}
                                      type="button"
                                      variant="outline"
                                    >
                                      <Plus className="h-4 w-4" />
                                      Select
                                    </Button>
                                  </div>
                                </div>
                              )})
                            ) : (
                              <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-6 text-sm text-muted-foreground">
                                No source options are available for this material yet.
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-5 overflow-x-auto rounded-[1.15rem] border border-border">
                          <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                              <tr>
                                <th className="px-4 py-3">Source</th>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">Roll Width</th>
                                <th className="px-4 py-3">Roll Length</th>
                                <th className="px-4 py-3">Roll Count</th>
                                <th className="px-4 py-3">Applied Bags</th>
                                <th className="px-4 py-3">Across</th>
                                <th className="px-4 py-3">Along</th>
                                <th className="px-4 py-3">Actual Area / Bag</th>
                                <th className="px-4 py-3">Remaining Roll Length</th>
                                <th className="px-4 py-3">Allocated Bags</th>
                                <th className="px-4 py-3">Unit Cost</th>
                                <th className="px-4 py-3">Lead Time</th>
                                <th className="px-4 py-3">Customs</th>
                                <th className="px-4 py-3">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {component.selectedSources.length ? (
                                component.selectedSources.map((source, sourceIndex) => {
                                  const lineMetrics = metrics?.sourceMetrics[sourceIndex];

                                  return (
                                    <tr key={`${component.componentId}-${source.sourceId}-${sourceIndex}`} className="border-t border-border">
                                      <td className="px-4 py-3 font-medium text-slate-900">{source.sourceName}</td>
                                      <td className="px-4 py-3">{source.sourceType}</td>
                                      <td className="px-4 py-3">
                                        <Input
                                          inputMode="decimal"
                                          value={source.rollWidthM}
                                          onChange={(event) =>
                                            updateSource(componentIndex, sourceIndex, {
                                              rollWidthM: event.target.value,
                                            })
                                          }
                                        />
                                      </td>
                                      <td className="px-4 py-3">
                                        <Input
                                          inputMode="decimal"
                                          value={source.rollLengthM}
                                          onChange={(event) =>
                                            updateSource(componentIndex, sourceIndex, {
                                              rollLengthM: event.target.value,
                                            })
                                          }
                                        />
                                      </td>
                                      <td className="px-4 py-3">
                                        <Input
                                          inputMode="numeric"
                                          disabled={source.sourceType === "stock"}
                                          value={source.sourceType === "stock" ? "1" : source.rollCount}
                                          onChange={(event) =>
                                            updateSource(componentIndex, sourceIndex, {
                                              rollCount: event.target.value,
                                            })
                                          }
                                        />
                                      </td>
                                      <td className="px-4 py-3">
                                        <Input
                                          inputMode="numeric"
                                          value={
                                            form.sourcingStrategy === "single-source"
                                              ? component.requestedQuantity
                                              : source.allocatedBags
                                          }
                                          disabled={form.sourcingStrategy === "single-source"}
                                          onChange={(event) =>
                                            updateSource(componentIndex, sourceIndex, {
                                              allocatedBags: event.target.value,
                                            })
                                          }
                                        />
                                      </td>
                                      <td className="px-4 py-3">{lineMetrics?.bagsAcrossRollWidth ?? "-"}</td>
                                      <td className="px-4 py-3">{lineMetrics?.bagsAlongRollLength ?? "-"}</td>
                                      <td className="px-4 py-3">
                                        {formatMetric(lineMetrics?.actualAreaPerBagM2 ?? null, 4, " m²")}
                                      </td>
                                      <td className="px-4 py-3">
                                        {formatMetric(lineMetrics?.remainingRollLengthM ?? null, 2, " m")}
                                      </td>
                                      <td className="px-4 py-3">{lineMetrics?.allocatedBags ?? "-"}</td>
                                      <td className="px-4 py-3">
                                        <Input
                                          inputMode="decimal"
                                          value={source.unitCostUsdPerM2}
                                          onChange={(event) =>
                                            updateSource(componentIndex, sourceIndex, {
                                              unitCostUsdPerM2: event.target.value,
                                            })
                                          }
                                        />
                                      </td>
                                      <td className="px-4 py-3">
                                        <Input
                                          inputMode="decimal"
                                          value={source.leadTimeDays}
                                          onChange={(event) =>
                                            updateSource(componentIndex, sourceIndex, {
                                              leadTimeDays: event.target.value,
                                            })
                                          }
                                        />
                                      </td>
                                      <td className="px-4 py-3">
                                        <Input
                                          inputMode="decimal"
                                          value={source.customsEstimate}
                                          onChange={(event) =>
                                            updateSource(componentIndex, sourceIndex, {
                                              customsEstimate: event.target.value,
                                            })
                                          }
                                        />
                                      </td>
                                      <td className="px-4 py-3">
                                        <Button
                                          onClick={() => removeSource(componentIndex, sourceIndex)}
                                          type="button"
                                          variant="ghost"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td colSpan={15} className="px-4 py-6 text-center text-muted-foreground">
                                    No sources selected yet for this Bag Body.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-4">
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Allocated Area</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {formatMetric(metrics?.totalAllocatedQtyM2 ?? null, 2, " m²")}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Weighted Unit Cost</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {formatMetric(metrics?.weightedAverageUnitCostUsdPerM2 ?? null, 3, " USD/m²")}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Cost / Bag</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {formatMetric(metrics?.materialCostPerBagEgp ?? null, 2, " EGP")}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Lead Time</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {formatMetric(metrics?.leadTimeDays ?? null, 0, " days")}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <MaterialRollSketch count={payload.selectedSources.length} />
              </>
            ) : null}

            <div className="flex flex-col gap-4 rounded-[1.2rem] border border-border bg-white p-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm">
                <p className="font-medium text-slate-900">
                  Saving this merged step updates sourcing totals and keeps a compatible roll-calculation snapshot for downstream pages.
                </p>
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
    </div>
  );
};

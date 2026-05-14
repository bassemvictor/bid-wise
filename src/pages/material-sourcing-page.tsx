import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Calculator,
  CircleDollarSign,
  Factory,
  Info,
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
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { api, ApiError, isApiConfigured } from "../lib/api";
import { cn } from "../lib/utils";
import type {
  Material,
  MaterialSourceSelection,
  MaterialSourceType,
  ImportPreset,
  ProductConfiguration,
  RollCalculation,
  SelectedMaterialSource,
  StockItem,
  Supplier,
  SupplierOffer,
  TenderRequest,
} from "../../shared/types";

type SourceTab = "all" | "stock" | "import";

type SelectedSourceForm = {
  sourceId: string;
  sourceName: string;
  sourceType: MaterialSourceType;
  qtyUsedM2: string;
  unitCostUsdPerM2: string;
  totalCostUsd: string;
  leadTimeDays: string;
};

type MaterialSourcingForm = Omit<
  MaterialSourceSelection,
  | "entityType"
  | "createdAt"
  | "updatedAt"
  | "selectedSources"
  | "totalAllocatedQtyM2"
  | "weightedAverageUnitCostUsdPerM2"
  | "exchangeRate"
  | "currencySafetyFactorPercent"
  | "effectiveExchangeRate"
  | "freightCostPerM2Egp"
  | "customsCostPerM2Egp"
  | "otherChargesPerM2Egp"
  | "landedCostEgpPerM2"
  | "materialCostPerBagEgp"
  | "totalMaterialCostEgp"
  | "totalLeadTimeDays"
> & {
  selectedSources: SelectedSourceForm[];
  totalAllocatedQtyM2: string;
  weightedAverageUnitCostUsdPerM2: string;
  exchangeRate: string;
  currencySafetyFactorPercent: string;
  effectiveExchangeRate: string;
  freightCostPerM2Egp: string;
  customsCostPerM2Egp: string;
  otherChargesPerM2Egp: string;
  landedCostEgpPerM2: string;
  materialCostPerBagEgp: string;
  totalMaterialCostEgp: string;
  totalLeadTimeDays: string;
};

type SourceOption = {
  sourceId: string;
  sourceName: string;
  sourceType: MaterialSourceType;
  availabilityLabel: string;
  unitCostUsdPerM2: number | null;
  leadTimeDays: number | null;
  materialId: string;
};

type ImportEntryDraft = {
  supplierId: string;
  qtyUsedM2: string;
};

const initialForm = (tenderId: string): MaterialSourcingForm => ({
  tenantId: "alimex-demo",
  tenderId,
  productConfigId: "base",
  materialId: "",
  sourcingStrategy: "single-source",
  selectedSources: [],
  totalAllocatedQtyM2: "",
  weightedAverageUnitCostUsdPerM2: "",
  exchangeRate: "",
  currencySafetyFactorPercent: "",
  effectiveExchangeRate: "",
  freightCostPerM2Egp: "",
  customsCostPerM2Egp: "",
  otherChargesPerM2Egp: "",
  landedCostEgpPerM2: "",
  materialCostPerBagEgp: "",
  totalMaterialCostEgp: "",
  totalLeadTimeDays: "",
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

const toForm = (payload: MaterialSourceSelection): MaterialSourcingForm => ({
  tenantId: payload.tenantId,
  tenderId: payload.tenderId,
  productConfigId: payload.productConfigId,
  materialId: payload.materialId,
  sourcingStrategy: payload.sourcingStrategy,
  selectedSources: payload.selectedSources.map((source) => ({
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    sourceType: source.sourceType,
    qtyUsedM2: source.qtyUsedM2?.toString() ?? "",
    unitCostUsdPerM2: source.unitCostUsdPerM2?.toString() ?? "",
    totalCostUsd: source.totalCostUsd?.toString() ?? "",
    leadTimeDays: source.leadTimeDays?.toString() ?? "",
  })),
  totalAllocatedQtyM2: payload.totalAllocatedQtyM2?.toString() ?? "",
  weightedAverageUnitCostUsdPerM2: payload.weightedAverageUnitCostUsdPerM2?.toString() ?? "",
  exchangeRate: payload.exchangeRate?.toString() ?? "",
  currencySafetyFactorPercent: payload.currencySafetyFactorPercent?.toString() ?? "",
  effectiveExchangeRate: payload.effectiveExchangeRate?.toString() ?? "",
  freightCostPerM2Egp: payload.freightCostPerM2Egp?.toString() ?? "",
  customsCostPerM2Egp: payload.customsCostPerM2Egp?.toString() ?? "",
  otherChargesPerM2Egp: payload.otherChargesPerM2Egp?.toString() ?? "",
  landedCostEgpPerM2: payload.landedCostEgpPerM2?.toString() ?? "",
  materialCostPerBagEgp: payload.materialCostPerBagEgp?.toString() ?? "",
  totalMaterialCostEgp: payload.totalMaterialCostEgp?.toString() ?? "",
  totalLeadTimeDays: payload.totalLeadTimeDays?.toString() ?? "",
});

const requiredFields: Array<
  keyof Pick<
    MaterialSourcingForm,
    | "exchangeRate"
    | "currencySafetyFactorPercent"
    | "freightCostPerM2Egp"
    | "customsCostPerM2Egp"
    | "otherChargesPerM2Egp"
  >
> = [
  "exchangeRate",
  "currencySafetyFactorPercent",
  "freightCostPerM2Egp",
  "customsCostPerM2Egp",
  "otherChargesPerM2Egp",
];

const RollLayoutPlaceholder = ({
  count,
  strategy,
}: {
  count: number;
  strategy: MaterialSourcingForm["sourcingStrategy"];
}) => (
  <div className="rounded-[1.25rem] border border-dashed border-border bg-slate-50 p-5">
    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-800">
      <PackageSearch className="h-4 w-4 text-primary" />
      Roll Allocation Placeholder
    </div>
    <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
      <div className="rounded-3xl bg-white p-4">
        <svg viewBox="0 0 360 180" className="h-44 w-full">
          <rect x="22" y="34" width="316" height="112" rx="20" fill="#dbeafe" stroke="#2563eb" strokeWidth="2" />
          <rect x="34" y="48" width="94" height="84" rx="14" fill="#93c5fd" stroke="#1d4ed8" strokeWidth="1.5" />
          <rect x="136" y="48" width="84" height="84" rx="14" fill="#bfdbfe" stroke="#1d4ed8" strokeWidth="1.5" />
          <rect x="228" y="48" width="96" height="84" rx="14" fill="#dbeafe" stroke="#1d4ed8" strokeWidth="1.5" />
          <text x="180" y="24" textAnchor="middle" fontSize="12" fill="#0f172a">
            Roll Utilization by Selected Sources
          </text>
          <text x="81" y="94" textAnchor="middle" fontSize="11" fill="#0f172a">
            Stock
          </text>
          <text x="178" y="94" textAnchor="middle" fontSize="11" fill="#0f172a">
            Blend
          </text>
          <text x="276" y="94" textAnchor="middle" fontSize="11" fill="#0f172a">
            Import
          </text>
        </svg>
      </div>
      <div className="grid gap-3">
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Allocation Mode</p>
          <p className="mt-2 text-sm font-medium text-slate-900">
            {strategy === "combine-sources" ? "Combine Sources" : "Single Source"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Selected Lines</p>
          <p className="mt-2 text-sm font-medium text-slate-900">{count} sourcing line(s)</p>
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
  const [rollCalculation, setRollCalculation] = useState<RollCalculation | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [importPresets, setImportPresets] = useState<ImportPreset[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierOffers, setSupplierOffers] = useState<SupplierOffer[]>([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importDraft, setImportDraft] = useState<ImportEntryDraft>({ supplierId: "", qtyUsedM2: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [saveMode, setSaveMode] = useState<"draft" | "continue" | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});

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
          loadedRollCalculation,
          loadedMaterials,
          loadedImportPresets,
          loadedStockItems,
          loadedSuppliers,
          saved,
        ] =
          await Promise.all([
            api.get<TenderRequest>(`/tenders/${tenderId}?tenantId=alimex-demo`),
            api.get<ProductConfiguration>(`/tenders/${tenderId}/product-configuration?tenantId=alimex-demo`),
            api.get<RollCalculation>(`/tenders/${tenderId}/roll-calculation?tenantId=alimex-demo`),
            api.get<Material[]>(`/materials?tenantId=alimex-demo`),
            api.get<ImportPreset[]>(`/import-presets?tenantId=alimex-demo`),
            api.get<StockItem[]>(`/stock?tenantId=alimex-demo`),
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

        const activeSuppliers = loadedSuppliers.filter((supplier) => supplier.active);
        const offers = (
          await Promise.all(
            activeSuppliers.map((supplier) =>
              api
                .get<SupplierOffer[]>(`/suppliers/${supplier.supplierId}/offers?tenantId=alimex-demo`)
                .catch((reason) => {
                  if (reason instanceof ApiError && reason.status === 404) {
                    return [];
                  }

                  throw reason;
                }),
            ),
          )
        ).flat();

        if (!isMounted) {
          return;
        }

        setTender(loadedTender);
        setProductConfiguration(loadedConfiguration);
        setRollCalculation(loadedRollCalculation);
        setMaterials(loadedMaterials.filter((item) => item.active));
        setImportPresets(loadedImportPresets.filter((item) => item.active));
        setStockItems(loadedStockItems.filter((item) => item.active));
        setSuppliers(activeSuppliers);
        setSupplierOffers(offers);

        if (saved) {
          setForm(toForm(saved));
          return;
        }

        setForm((current) => ({
          ...current,
          productConfigId: loadedConfiguration.productConfigId,
          materialId: loadedConfiguration.mainFabricMaterialId || current.materialId,
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
  const customsCostPerM2Egp = numberOrNull(form.customsCostPerM2Egp);
  const otherChargesPerM2Egp = numberOrNull(form.otherChargesPerM2Egp);

  const selectedSources = useMemo(
    () =>
      form.selectedSources.map((source): SelectedMaterialSource => {
        const qtyUsedM2 = numberOrNull(source.qtyUsedM2);
        const unitCostUsdPerM2 = numberOrNull(source.unitCostUsdPerM2);
        const totalCostUsd =
          qtyUsedM2 !== null && unitCostUsdPerM2 !== null ? qtyUsedM2 * unitCostUsdPerM2 : null;
        const leadTimeDays = numberOrNull(source.leadTimeDays);

        return {
          sourceId: source.sourceId,
          sourceName: source.sourceName,
          sourceType: source.sourceType,
          qtyUsedM2,
          unitCostUsdPerM2,
          totalCostUsd,
          leadTimeDays,
        };
      }),
    [form.selectedSources],
  );

  const calculations = useMemo(() => {
    const actualAreaPerBagM2 = rollCalculation?.actualAreaPerBagM2 ?? null;
    const quantity = productConfiguration?.quantity ?? null;
    const totalAllocatedQtyM2 = selectedSources.reduce((sum, source) => sum + (source.qtyUsedM2 ?? 0), 0);
    const totalCostUsd = selectedSources.reduce((sum, source) => sum + (source.totalCostUsd ?? 0), 0);
    const weightedAverageUnitCostUsdPerM2 =
      totalAllocatedQtyM2 > 0 ? totalCostUsd / totalAllocatedQtyM2 : null;
    const effectiveExchangeRate =
      exchangeRate !== null && currencySafetyFactorPercent !== null
        ? exchangeRate * (1 + currencySafetyFactorPercent / 100)
        : null;
    const materialCostEgpPerM2 =
      weightedAverageUnitCostUsdPerM2 !== null && effectiveExchangeRate !== null
        ? weightedAverageUnitCostUsdPerM2 * effectiveExchangeRate
        : null;
    const landedCostEgpPerM2 =
      materialCostEgpPerM2 !== null &&
      freightCostPerM2Egp !== null &&
      customsCostPerM2Egp !== null &&
      otherChargesPerM2Egp !== null
        ? materialCostEgpPerM2 + freightCostPerM2Egp + customsCostPerM2Egp + otherChargesPerM2Egp
        : null;
    const materialCostPerBagEgp =
      landedCostEgpPerM2 !== null && actualAreaPerBagM2 !== null
        ? landedCostEgpPerM2 * actualAreaPerBagM2
        : null;
    const totalMaterialCostEgp =
      materialCostPerBagEgp !== null && quantity !== null
        ? materialCostPerBagEgp * quantity
        : null;
    const totalLeadTimeDays = selectedSources.reduce((max, source) => {
      if (source.leadTimeDays === null) {
        return max;
      }

      return Math.max(max, source.leadTimeDays);
    }, 0);

    return {
      totalAllocatedQtyM2,
      totalCostUsd,
      weightedAverageUnitCostUsdPerM2,
      effectiveExchangeRate,
      landedCostEgpPerM2,
      materialCostPerBagEgp,
      totalMaterialCostEgp,
      totalLeadTimeDays: selectedSources.length ? totalLeadTimeDays : null,
    };
  }, [
    selectedSources,
    exchangeRate,
    currencySafetyFactorPercent,
    freightCostPerM2Egp,
    customsCostPerM2Egp,
    otherChargesPerM2Egp,
    rollCalculation,
    productConfiguration,
  ]);

  const sourceOptions = useMemo<SourceOption[]>(() => {
    const targetMaterialId = form.materialId || productConfiguration?.mainFabricMaterialId || "";

    const stockSources = stockItems
      .filter((stockItem) => !targetMaterialId || stockItem.materialId === targetMaterialId)
      .map((stockItem) => {
        const material = materials.find((item) => item.materialId === stockItem.materialId);
        const supplier = suppliers.find((item) => item.supplierId === stockItem.supplierId);

        return {
          sourceId: stockItem.stockId,
          sourceName: supplier?.supplierName
            ? `${supplier.supplierName} · ${material?.materialName ?? stockItem.materialId}`
            : material?.materialName ?? stockItem.materialId,
          sourceType: "stock" as const,
          availabilityLabel:
            stockItem.unitCount !== null ? `${stockItem.unitCount.toFixed(0)} m² available` : "Available stock",
          unitCostUsdPerM2: null,
          leadTimeDays: 0,
          materialId: stockItem.materialId,
        };
      });

    const presetSources = importPresets
      .filter((preset) => !targetMaterialId || preset.materialId === targetMaterialId)
      .map((preset) => {
        const supplier = suppliers.find((item) => item.supplierId === preset.supplierId);
        const material = materials.find((item) => item.materialId === preset.materialId);

        return {
          sourceId: `preset-${preset.importPresetId}`,
          sourceName: supplier?.supplierName ?? preset.supplierId,
          sourceType: "import" as const,
          availabilityLabel: material?.materialName ? `Preset for ${material.materialName}` : "Import preset",
          unitCostUsdPerM2: preset.unitCostUsdPerM2,
          leadTimeDays: preset.leadTimeDays,
          materialId: preset.materialId,
        };
      });

    const offerSources = supplierOffers
      .filter((offer) => !targetMaterialId || offer.materialId === targetMaterialId)
      .filter((offer) => !importPresets.some((preset) => preset.materialId === offer.materialId && preset.supplierId === offer.supplierId))
      .map((offer) => {
        const supplier = suppliers.find((item) => item.supplierId === offer.supplierId);
        const material = materials.find((item) => item.materialId === offer.materialId);

        return {
          sourceId: offer.offerId,
          sourceName: supplier?.supplierName ?? offer.supplierId,
          sourceType: "import" as const,
          availabilityLabel:
            offer.minOrderQty !== null ? `${offer.minOrderQty.toFixed(0)} m² minimum order` : "Open minimum order",
          unitCostUsdPerM2: offer.unitCostUsdPerM2,
          leadTimeDays: offer.leadTimeDays,
          materialId: material?.materialId ?? offer.materialId,
        };
      });

    return [...stockSources, ...presetSources, ...offerSources];
  }, [form.materialId, productConfiguration, materials, importPresets, stockItems, supplierOffers, suppliers]);

  const visibleSources = useMemo(
    () =>
      sourceOptions.filter((source) => {
        if (activeTab === "all") {
          return true;
        }

        return source.sourceType === activeTab;
      }),
    [sourceOptions, activeTab],
  );

  const materialName =
    materials.find((item) => item.materialId === (form.materialId || productConfiguration?.mainFabricMaterialId))?.materialName ||
    tender?.requestedMaterial ||
    "Not selected";

  const updateField = <K extends keyof MaterialSourcingForm>(key: K, value: MaterialSourcingForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key as string]) {
        return current;
      }

      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  const updateSourceField = (index: number, key: keyof SelectedSourceForm, value: string) => {
    setForm((current) => ({
      ...current,
      selectedSources: current.selectedSources.map((source, sourceIndex) =>
        sourceIndex === index ? { ...source, [key]: value } : source,
      ),
    }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[`selectedSources.${index}.${key}`];
      delete next.allocation;
      return next;
    });
  };

  const setSourcingStrategy = (value: MaterialSourcingForm["sourcingStrategy"]) => {
    setForm((current) => ({
      ...current,
      sourcingStrategy: value,
      selectedSources: value === "single-source" ? current.selectedSources.slice(0, 1) : current.selectedSources,
    }));
  };

  const addSource = (source: SourceOption) => {
    setForm((current) => {
      const remainingQty = Math.max((rollCalculation?.totalFabricRequiredM2 ?? 0) - calculations.totalAllocatedQtyM2, 0);
      const nextRow: SelectedSourceForm = {
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        sourceType: source.sourceType,
        qtyUsedM2:
          current.sourcingStrategy === "single-source"
            ? rollCalculation?.totalFabricRequiredM2?.toFixed(2) ?? ""
            : remainingQty > 0
              ? remainingQty.toFixed(2)
              : "",
        unitCostUsdPerM2: source.unitCostUsdPerM2?.toString() ?? "",
        totalCostUsd: "",
        leadTimeDays: source.leadTimeDays?.toString() ?? "",
      };

      if (current.sourcingStrategy === "single-source") {
        return {
          ...current,
          materialId: source.materialId || current.materialId,
          selectedSources: [nextRow],
        };
      }

      if (current.selectedSources.some((item) => item.sourceId === source.sourceId)) {
        return current;
      }

      return {
        ...current,
        materialId: source.materialId || current.materialId,
        selectedSources: [...current.selectedSources, nextRow],
      };
    });
  };

  const addManualImportEntry = () => {
    const supplierId = importDraft.supplierId;
    const supplierName = suppliers.find((item) => item.supplierId === supplierId)?.supplierName ?? supplierId;
    const quantity = importDraft.qtyUsedM2.trim();

    if (!supplierId || !quantity) {
      setError("Select an import supplier and enter the quantity before adding a new import entry.");
      return;
    }

    const sourceId = `manual-import-${supplierId}-${crypto.randomUUID()}`;
    const targetMaterialId = form.materialId || productConfiguration?.mainFabricMaterialId || "";

    setForm((current) => {
      const nextRow: SelectedSourceForm = {
        sourceId,
        sourceName: supplierName,
        sourceType: "import",
        qtyUsedM2: quantity,
        unitCostUsdPerM2: "",
        totalCostUsd: "",
        leadTimeDays: "",
      };

      const nextSelectedSources =
        current.sourcingStrategy === "single-source" ? [nextRow] : [...current.selectedSources, nextRow];

      return {
        ...current,
        materialId: targetMaterialId || current.materialId,
        selectedSources: nextSelectedSources,
      };
    });

    setFieldErrors((current) => {
      const next = { ...current };
      delete next.selectedSources;
      delete next.allocation;
      return next;
    });
    setError("");
    setImportDraft({ supplierId: "", qtyUsedM2: "" });
    setImportDialogOpen(false);
  };

  const removeSource = (index: number) => {
    setForm((current) => ({
      ...current,
      selectedSources: current.selectedSources.filter((_, sourceIndex) => sourceIndex !== index),
    }));
  };

  const renderError = (field: string) =>
    fieldErrors[field] ? <p className="text-xs text-rose-600">{fieldErrors[field]}</p> : null;

  const validate = () => {
    const nextErrors: Partial<Record<string, string>> = {};

    for (const field of requiredFields) {
      if (String(form[field] ?? "").trim().length === 0) {
        nextErrors[field] = "This field is required.";
      }
    }

    if (!form.selectedSources.length) {
      nextErrors.selectedSources = "Select at least one source.";
    }

    form.selectedSources.forEach((source, index) => {
      if (!source.qtyUsedM2.trim()) {
        nextErrors[`selectedSources.${index}.qtyUsedM2`] = "Required.";
      }

      if (!source.unitCostUsdPerM2.trim()) {
        nextErrors[`selectedSources.${index}.unitCostUsdPerM2`] = "Required.";
      }

      if (!source.leadTimeDays.trim()) {
        nextErrors[`selectedSources.${index}.leadTimeDays`] = "Required.";
      }
    });

    const totalRequired = rollCalculation?.totalFabricRequiredM2 ?? null;
    if (
      totalRequired !== null &&
      Math.abs(calculations.totalAllocatedQtyM2 - totalRequired) > 0.01
    ) {
      nextErrors.allocation = "Total allocated quantity must equal total fabric required.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const payload = useMemo<MaterialSourceSelection>(
    () => ({
      entityType: "MATERIAL_SOURCE_SELECTION",
      tenantId: form.tenantId,
      tenderId,
      productConfigId: form.productConfigId || productConfiguration?.productConfigId || "base",
      materialId: form.materialId || productConfiguration?.mainFabricMaterialId || "",
      sourcingStrategy: form.sourcingStrategy,
      selectedSources: selectedSources.map((source) => ({
        ...source,
        totalCostUsd:
          source.qtyUsedM2 !== null && source.unitCostUsdPerM2 !== null
            ? source.qtyUsedM2 * source.unitCostUsdPerM2
            : null,
      })),
      totalAllocatedQtyM2: selectedSources.length ? calculations.totalAllocatedQtyM2 : null,
      weightedAverageUnitCostUsdPerM2: calculations.weightedAverageUnitCostUsdPerM2,
      exchangeRate,
      currencySafetyFactorPercent,
      effectiveExchangeRate: calculations.effectiveExchangeRate,
      freightCostPerM2Egp,
      customsCostPerM2Egp,
      otherChargesPerM2Egp,
      landedCostEgpPerM2: calculations.landedCostEgpPerM2,
      materialCostPerBagEgp: calculations.materialCostPerBagEgp,
      totalMaterialCostEgp: calculations.totalMaterialCostEgp,
      totalLeadTimeDays: calculations.totalLeadTimeDays,
      createdAt: "",
      updatedAt: "",
    }),
    [
      form.tenantId,
      form.productConfigId,
      form.materialId,
      form.sourcingStrategy,
      tenderId,
      productConfiguration,
      selectedSources,
      calculations,
      exchangeRate,
      currencySafetyFactorPercent,
      freightCostPerM2Egp,
      customsCostPerM2Egp,
      otherChargesPerM2Egp,
    ],
  );

  const save = async (mode: "draft" | "continue") => {
    setMessage("");
    setError("");
    setSaveMode(mode);

    if (!isApiConfigured) {
      setError("Set VITE_API_BASE_URL before saving material sourcing.");
      setSaveMode(null);
      return;
    }

    if (mode === "continue" && !validate()) {
      setError("Complete sourcing allocation and landed cost inputs before continuing.");
      setSaveMode(null);
      return;
    }

    try {
      const response = await api.put<MaterialSourceSelection>(`/tenders/${tenderId}/material-sourcing`, payload);

      setForm(toForm(response));
      setMessage(
        mode === "draft"
          ? "Material sourcing saved."
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

  const resultCards = [
    {
      label: "Landed Cost",
      value: formatMetric(calculations.landedCostEgpPerM2, 2),
      unit: "EGP/m²",
      icon: CircleDollarSign,
    },
    {
      label: "Actual Area Per Bag",
      value: formatMetric(rollCalculation?.actualAreaPerBagM2 ?? null, 4),
      unit: "m²",
      icon: Boxes,
    },
    {
      label: "Material Cost Per Bag",
      value: formatMetric(calculations.materialCostPerBagEgp, 2),
      unit: "EGP",
      icon: Calculator,
    },
    {
      label: "Total Material Cost",
      value: formatMetric(calculations.totalMaterialCostEgp, 2),
      unit: "EGP",
      icon: Truck,
    },
    {
      label: "Total Lead Time",
      value: formatMetric(calculations.totalLeadTimeDays, 0),
      unit: "days",
      icon: Plane,
    },
  ];

  return (
    <div className="space-y-6">
      <TenderWorkflowStepper currentStep={4} tenderId={tenderId} />

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Material Sourcing &amp; Costing</CardTitle>
                <CardDescription>
                  Compare stock and imported sources, allocate required fabric, and calculate landed material cost.
                </CardDescription>
              </div>
              <Badge variant="default">MATERIAL_SOURCING</Badge>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="rounded-2xl bg-slate-50 p-6 text-sm text-muted-foreground">
                  Loading tender, product configuration, roll calculation, and sourcing options...
                </div>
              ) : null}

              {!isLoading ? (
                <>
                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Top Summary</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Core tender and roll outputs used to validate sourcing allocation.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <Factory className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {[
                        { label: "Material", value: materialName },
                        {
                          label: "Total Fabric Required",
                          value: formatMetric(rollCalculation?.totalFabricRequiredM2 ?? null, 2, " m²"),
                        },
                        {
                          label: "Actual Area Per Bag",
                          value: formatMetric(rollCalculation?.actualAreaPerBagM2 ?? null, 4, " m²"),
                        },
                        {
                          label: "Quantity",
                          value:
                            productConfiguration?.quantity !== null && productConfiguration?.quantity !== undefined
                              ? `${productConfiguration.quantity.toLocaleString()} bags`
                              : "Not configured",
                        },
                        { label: "Requested Delivery Time", value: tender?.requestedDeliveryTime || "Not entered" },
                        { label: "Delivery Place", value: tender?.deliveryPlace || "Not entered" },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-border bg-white p-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Source Options</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Choose available stock or supplier import offers for the main fabric material.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <PackageSearch className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="mb-4 flex flex-wrap gap-2">
                      {[
                        { id: "all" as const, label: "All Sources" },
                        { id: "stock" as const, label: "Stock" },
                        { id: "import" as const, label: "Import" },
                      ].map((tab) => (
                        <button
                          className={cn(
                            "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                            activeTab === tab.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-white text-muted-foreground hover:bg-slate-100 hover:text-foreground",
                          )}
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          type="button"
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="mb-4 flex justify-end">
                      <Button
                        onClick={() => {
                          setImportDraft({ supplierId: "", qtyUsedM2: "" });
                          setImportDialogOpen(true);
                        }}
                        type="button"
                        variant="outline"
                      >
                        <Plus className="h-4 w-4" />
                        New Import Entry
                      </Button>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-border bg-white">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3">Source Name</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Available / MOQ</th>
                            <th className="px-4 py-3">Unit Cost USD/m²</th>
                            <th className="px-4 py-3">Lead Time</th>
                            <th className="px-4 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleSources.length ? (
                            visibleSources.map((source) => (
                              <tr className="border-t border-border" key={source.sourceId}>
                                <td className="px-4 py-3 font-medium text-slate-900">{source.sourceName}</td>
                                <td className="px-4 py-3">
                                  <Badge variant={source.sourceType === "stock" ? "success" : "warning"}>
                                    {source.sourceType}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">{source.availabilityLabel}</td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {source.unitCostUsdPerM2 === null ? "Set on selection" : source.unitCostUsdPerM2.toFixed(3)}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                  {source.leadTimeDays === null ? "TBD" : `${source.leadTimeDays} days`}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <Button onClick={() => addSource(source)} size="sm" type="button" variant="outline">
                                    <Plus className="h-3.5 w-3.5" />
                                    Select
                                  </Button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td className="px-4 py-8 text-center text-sm text-muted-foreground" colSpan={6}>
                                No matching sources are available yet. Add materials, suppliers, and supplier offers to continue.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Selected Source &amp; Quantity Allocation</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Allocate total fabric requirement across one or more sources.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <Truck className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="mb-5 flex flex-wrap gap-3">
                      <button
                        className={cn(
                          "rounded-2xl border px-4 py-3 text-left transition-colors",
                          form.sourcingStrategy === "single-source"
                            ? "border-primary bg-blue-50 text-slate-900"
                            : "border-border bg-white text-muted-foreground",
                        )}
                        onClick={() => setSourcingStrategy("single-source")}
                        type="button"
                      >
                        <p className="text-sm font-semibold">Single Source</p>
                        <p className="mt-1 text-xs">Assign the full required quantity to one source.</p>
                      </button>
                      <button
                        className={cn(
                          "rounded-2xl border px-4 py-3 text-left transition-colors",
                          form.sourcingStrategy === "combine-sources"
                            ? "border-primary bg-blue-50 text-slate-900"
                            : "border-border bg-white text-muted-foreground",
                        )}
                        onClick={() => setSourcingStrategy("combine-sources")}
                        type="button"
                      >
                        <p className="text-sm font-semibold">Combine Sources</p>
                        <p className="mt-1 text-xs">Blend stock and imports to reach total required quantity.</p>
                      </button>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-border bg-white">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3">Source</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Qty Used m²</th>
                            <th className="px-4 py-3">Unit Cost USD/m²</th>
                            <th className="px-4 py-3">Total Cost USD</th>
                            <th className="px-4 py-3">Lead Time</th>
                            <th className="px-4 py-3 text-right">Delete</th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.selectedSources.length ? (
                            form.selectedSources.map((source, index) => {
                              const line = selectedSources[index];
                              return (
                                <tr className="border-t border-border align-top" key={`${source.sourceId}-${index}`}>
                                  <td className="px-4 py-3 font-medium text-slate-900">{source.sourceName}</td>
                                  <td className="px-4 py-3">
                                    <Badge variant={source.sourceType === "stock" ? "success" : "warning"}>
                                      {source.sourceType}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3">
                                    <Input
                                      inputMode="decimal"
                                      value={source.qtyUsedM2}
                                      onChange={(event) => updateSourceField(index, "qtyUsedM2", event.target.value)}
                                    />
                                    {renderError(`selectedSources.${index}.qtyUsedM2`)}
                                  </td>
                                  <td className="px-4 py-3">
                                    <Input
                                      inputMode="decimal"
                                      value={source.unitCostUsdPerM2}
                                      onChange={(event) => updateSourceField(index, "unitCostUsdPerM2", event.target.value)}
                                    />
                                    {renderError(`selectedSources.${index}.unitCostUsdPerM2`)}
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground">
                                    {line?.totalCostUsd === null || line?.totalCostUsd === undefined
                                      ? "Calculated automatically"
                                      : line.totalCostUsd.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-3">
                                    <Input
                                      inputMode="decimal"
                                      value={source.leadTimeDays}
                                      onChange={(event) => updateSourceField(index, "leadTimeDays", event.target.value)}
                                    />
                                    {renderError(`selectedSources.${index}.leadTimeDays`)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <Button onClick={() => removeSource(index)} size="sm" type="button" variant="ghost">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td className="px-4 py-8 text-center text-sm text-muted-foreground" colSpan={7}>
                                No sources selected yet. Use the source table above to add stock lots or supplier offers.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <div className="rounded-2xl border border-border bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Allocated</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">
                          {formatMetric(form.selectedSources.length ? calculations.totalAllocatedQtyM2 : null, 2, " m²")}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Required Fabric</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">
                          {formatMetric(rollCalculation?.totalFabricRequiredM2 ?? null, 2, " m²")}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Allocation Status</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">
                          {rollCalculation?.totalFabricRequiredM2 !== null &&
                          Math.abs(calculations.totalAllocatedQtyM2 - (rollCalculation?.totalFabricRequiredM2 ?? 0)) <= 0.01
                            ? "Balanced"
                            : "Needs adjustment"}
                        </p>
                      </div>
                    </div>
                    {renderError("selectedSources")}
                    {renderError("allocation")}
                  </section>

                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Landed Cost Calculation</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Convert USD material cost to EGP and add freight, customs, and other sourcing charges.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <CircleDollarSign className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Exchange Rate
                        <Input value={form.exchangeRate} inputMode="decimal" onChange={(event) => updateField("exchangeRate", event.target.value)} />
                        {renderError("exchangeRate")}
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Currency Safety Factor (%)
                        <Input
                          value={form.currencySafetyFactorPercent}
                          inputMode="decimal"
                          onChange={(event) => updateField("currencySafetyFactorPercent", event.target.value)}
                        />
                        {renderError("currencySafetyFactorPercent")}
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Freight Cost per m² (EGP)
                        <Input
                          value={form.freightCostPerM2Egp}
                          inputMode="decimal"
                          onChange={(event) => updateField("freightCostPerM2Egp", event.target.value)}
                        />
                        {renderError("freightCostPerM2Egp")}
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Customs Cost per m² (EGP)
                        <Input
                          value={form.customsCostPerM2Egp}
                          inputMode="decimal"
                          onChange={(event) => updateField("customsCostPerM2Egp", event.target.value)}
                        />
                        {renderError("customsCostPerM2Egp")}
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Other Charges per m² (EGP)
                        <Input
                          value={form.otherChargesPerM2Egp}
                          inputMode="decimal"
                          onChange={(event) => updateField("otherChargesPerM2Egp", event.target.value)}
                        />
                        {renderError("otherChargesPerM2Egp")}
                      </label>
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                        <div className="flex items-start gap-3">
                          <Info className="mt-0.5 h-5 w-5 text-blue-700" />
                          <div>
                            <p className="font-semibold">Calculation Notes</p>
                            <p className="mt-2">Effective exchange rate = exchange rate × (1 + safety factor / 100)</p>
                            <p className="mt-1">Landed cost per m² = material cost + freight + customs + other charges</p>
                            <p className="mt-1">Material cost per bag = landed cost per m² × actual area per bag</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Cost Summary</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Review landed cost impact before proceeding into the broader cost build-up stage.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <Calculator className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {resultCards.map((card) => (
                        <div key={card.label} className="rounded-2xl border border-border bg-white p-4">
                          <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                              <card.icon className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{card.label}</p>
                              <p className="mt-1 text-lg font-semibold text-slate-900">{card.value}</p>
                              <p className="text-xs text-muted-foreground">{card.unit}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <RollLayoutPlaceholder count={form.selectedSources.length} strategy={form.sourcingStrategy} />
                </>
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

              <Dialog
                description="Create an import sourcing line when no supplier offer exists yet."
                onClose={() => setImportDialogOpen(false)}
                open={importDialogOpen}
                title="New Import Entry"
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Supplier
                    <Select
                      value={importDraft.supplierId}
                      onChange={(event) => setImportDraft((current) => ({ ...current, supplierId: event.target.value }))}
                    >
                      <option value="">Select supplier</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.supplierId} value={supplier.supplierId}>
                          {supplier.supplierName}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Quantity (m²)
                    <Input
                      inputMode="decimal"
                      value={importDraft.qtyUsedM2}
                      onChange={(event) => setImportDraft((current) => ({ ...current, qtyUsedM2: event.target.value }))}
                    />
                  </label>
                  <div className="md:col-span-2 flex justify-end gap-3">
                    <Button onClick={() => setImportDialogOpen(false)} type="button" variant="outline">
                      Cancel
                    </Button>
                    <Button onClick={addManualImportEntry} type="button">
                      Add Import Line
                    </Button>
                  </div>
                </div>
              </Dialog>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2">
                <Button onClick={() => navigate(`/tenders/${tenderId}/material-roll-calculation`)} type="button" variant="ghost">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => void save("draft")} type="button" variant="outline">
                    <Save className="h-4 w-4" />
                    {saveMode === "draft" ? "Saving..." : "Save Draft"}
                  </Button>
                  <Button onClick={() => void save("continue")} type="button">
                    <ArrowRight className="h-4 w-4" />
                    {saveMode === "continue" ? "Saving..." : "Save & Continue"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sourcing Snapshot</CardTitle>
              <CardDescription>Live view of weighted sourcing cost and landed impact.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Material", value: materialName },
                {
                  label: "Weighted Avg Unit Cost",
                  value:
                    calculations.weightedAverageUnitCostUsdPerM2 !== null
                      ? `${calculations.weightedAverageUnitCostUsdPerM2.toFixed(4)} USD/m²`
                      : "Not calculated",
                },
                {
                  label: "Effective Exchange Rate",
                  value:
                    calculations.effectiveExchangeRate !== null
                      ? calculations.effectiveExchangeRate.toFixed(4)
                      : "Not calculated",
                },
                {
                  label: "Landed Cost",
                  value:
                    calculations.landedCostEgpPerM2 !== null
                      ? `${calculations.landedCostEgpPerM2.toFixed(2)} EGP/m²`
                      : "Not calculated",
                },
                {
                  label: "Selected Source Lines",
                  value: `${form.selectedSources.length}`,
                },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{item.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

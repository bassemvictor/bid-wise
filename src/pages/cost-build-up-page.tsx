import { ArrowLeft, ArrowRight, Calculator, ChevronDown, Package, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { TenderWorkflowStepper } from "../components/tenders/tender-workflow-stepper";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { api, ApiError, isApiConfigured } from "../lib/api";
import { getProductConfigurationSyncStatuses } from "../lib/product-configuration-sync";
import {
  confirmDiscardUnsavedChanges,
  useUnsavedChangesWarning,
} from "../lib/use-unsaved-changes";
import type {
  CostBuildUp,
  CostLine,
  Material,
  MaterialSourceSelection,
  ProductConfiguration,
  RollCalculation,
  TenderRequest,
} from "../../shared/types";

type CostLineForm = Omit<CostLine, "costPerBag"> & {
  costPerBag: string;
};

type CostBuildUpForm = Omit<
  CostBuildUp,
  | "entityType"
  | "createdAt"
  | "updatedAt"
  | "quantity"
  | "exchangeRate"
  | "currencySafetyFactorPercent"
  | "effectiveExchangeRate"
  | "costLines"
  | "totalMaterialCostPerBag"
  | "totalOperatingCostPerBag"
  | "totalAdditionalCostPerBag"
  | "totalCostPricePerBag"
  | "totalCostPriceForOrder"
> & {
  quantity: string;
  exchangeRate: string;
  currencySafetyFactorPercent: string;
  effectiveExchangeRate: string;
  salesInputMode: "percent" | "fixed";
  salesPercent: string;
  salesFixedAmount: string;
  costLines: CostLineForm[];
  totalMaterialCostPerBag: string;
  totalOperatingCostPerBag: string;
  totalAdditionalCostPerBag: string;
  totalCostPricePerBag: string;
  totalCostPriceForOrder: string;
};

const chartColors = ["#2563eb", "#0f766e", "#f59e0b"];

type CostDefaults = {
  factoryOverheadPerBag: number | null;
  manufacturingOverheadPerBag: number | null;
  managementOverheadPerBag: number | null;
};

type MaterialLineOverrides = {
  A: number | null;
  B: number | null;
  C: number | null;
};

const productOverheadLineCode = (baseCode: "F" | "G" | "G2", productId: string) =>
  `${baseCode}::${productId}`;

const parseProductOverheadLineCode = (
  code: string,
): { baseCode: "F" | "G" | "G2"; productId: string } | null => {
  const [baseCode, productId] = code.split("::");

  if (!productId || (baseCode !== "F" && baseCode !== "G" && baseCode !== "G2")) {
    return null;
  }

  return { baseCode, productId };
};

const productOverheadLineDefinitions = {
  F: {
    category: "Factory Overhead",
    description: "Factory overhead allocation for this product.",
    calculationBasis: "Editable per product row",
  },
  G: {
    category: "Manufacturing Overhead",
    description: "Manufacturing overhead allocation for this product.",
    calculationBasis: "Editable per product row",
  },
  G2: {
    category: "Management Overhead",
    description: "Management overhead allocation for this product.",
    calculationBasis: "Editable per product row",
  },
} as const;

const lineDefinitions: Array<Omit<CostLine, "costPerBag"> & { costPerBag?: number | null }> = [
  {
    code: "A",
    category: "Material - Fabric",
    description: "Fabric material cost pulled from landed sourcing result.",
    calculationBasis: "From material sourcing material cost per bag",
    editable: false,
  },
  {
    code: "B",
    category: "Ring Material",
    description: "Ring material added per bag.",
    calculationBasis: "Ring material consumption per bag",
    editable: false,
  },
  {
    code: "C",
    category: "Threading Material",
    description: "Threading material usage for one bag.",
    calculationBasis: "Threading material consumption per bag",
    editable: false,
  },
  {
    code: "D",
    category: "Packaging",
    description: "Packaging and handling per finished bag.",
    calculationBasis: "Packaging allocation per bag",
    editable: true,
  },
  {
    code: "I_TOTAL",
    category: "Total Material Cost",
    description: "Subtotal of fabric, accessories, thread, and packaging.",
    calculationBasis: "A + B + C + D",
    editable: false,
  },
  {
    code: "F",
    category: "Factory Overhead",
    description: "Factory overhead total across products divided by total bags.",
    calculationBasis: "Sum of product factory overhead totals ÷ total bag count",
    editable: false,
  },
  {
    code: "G",
    category: "Manufacturing Overhead",
    description: "Manufacturing overhead total across products divided by total bags.",
    calculationBasis: "Sum of product manufacturing overhead totals ÷ total bag count",
    editable: false,
  },
  {
    code: "G2",
    category: "Management Overhead",
    description: "Management overhead total across products divided by total bags.",
    calculationBasis: "Sum of product management overhead totals ÷ total bag count",
    editable: false,
  },
  {
    code: "H",
    category: "Sales Cost",
    description: "Sales and commercial support charge.",
    calculationBasis: "Sales support allocation",
    editable: true,
  },
  {
    code: "II_TOTAL",
    category: "Total Operating Cost",
    description: "Subtotal of labour and operating overheads.",
    calculationBasis: "F + G + G2 + H",
    editable: false,
  },
  {
    code: "I_RUSH",
    category: "Overtime / Rush Order",
    description: "Urgency surcharge when production must be accelerated.",
    calculationBasis: "Rush order premium per bag",
    editable: true,
    costPerBag: 0,
  },
  {
    code: "J",
    category: "Transportation",
    description: "Transport and dispatch cost loaded per bag.",
    calculationBasis: "Transportation allocation per bag",
    editable: true,
    costPerBag: 0,
  },
  {
    code: "K",
    category: "Installation",
    description: "Installation and site support where applicable.",
    calculationBasis: "Installation allocation per bag",
    editable: true,
    costPerBag: 0,
  },
  {
    code: "III_TOTAL",
    category: "Total Additional Cost",
    description: "Subtotal of rush, transportation, and installation cost.",
    calculationBasis: "I_RUSH + J + K",
    editable: false,
  },
];

const isFabricMaterialCategory = (category?: Material["category"] | null) => category === "Fabric Material";
const isRingMaterialCategory = (category?: Material["category"] | null) => category === "Ring Material";
const isThreadingMaterialCategory = (category?: Material["category"] | null) => category === "Threading Material";

const formatRequestedUnits = (componentName: string, quantity: number | null) => {
  if (quantity === null || quantity === undefined) {
    return "Not set";
  }

  const normalizedName = componentName.trim().toLowerCase();
  const unit = normalizedName.includes("bag") ? "bags" : "units";
  return `${quantity.toLocaleString()} ${unit}`;
};

const formatMillimeterValue = (value: number) => {
  return Number.isInteger(value) ? `${value} mm` : `${value.toFixed(2).replace(/\.?0+$/, "")} mm`;
};

const formatComponentSpecification = (
  component: NonNullable<MaterialSourceSelection["componentSelections"]>[number],
) => {
  const primary = component.materialId || "Not set";
  const details = [formatRequestedUnits(component.componentName, component.requestedQuantity)];

  if (component.bagDiameterMm !== null && component.bagDiameterMm !== undefined) {
    details.push(formatMillimeterValue(component.bagDiameterMm));
  }

  if (component.bagLengthMm !== null && component.bagLengthMm !== undefined) {
    details.push(formatMillimeterValue(component.bagLengthMm));
  }

  return {
    primary,
    secondary: details.join(" · "),
  };
};

const resolveMaterialCategoryForSelection = (
  selection: NonNullable<MaterialSourceSelection["componentSelections"]>[number],
  materials: Material[],
) => {
  const materialCategory = materials.find((material) => material.materialId === selection.materialId)?.category;

  if (materialCategory) {
    return materialCategory;
  }

  const componentName = selection.componentName.trim().toLowerCase();
  if (componentName.includes("ring")) {
    return "Ring Material" as const;
  }
  if (componentName.includes("thread")) {
    return "Threading Material" as const;
  }
  return "Fabric Material" as const;
};

const calculateMaterialLineOverrides = ({
  materialSourcing,
  exchangeRate,
  currencySafetyFactorPercent,
  materials,
}: {
  materialSourcing: MaterialSourceSelection | null;
  exchangeRate: number | null;
  currencySafetyFactorPercent: number | null;
  materials: Material[];
}): MaterialLineOverrides => {
  if (!materialSourcing?.componentSelections?.length) {
    return { A: null, B: null, C: null };
  }

  const effectiveExchangeRate =
    exchangeRate !== null && currencySafetyFactorPercent !== null
      ? exchangeRate * (1 + currencySafetyFactorPercent / 100)
      : null;

  const categoryTotals = {
    fabric: { totalCost: 0, totalQuantity: 0, fallbackPerBag: 0, hasFallback: false },
    ring: { totalCost: 0, totalQuantity: 0, fallbackPerBag: 0, hasFallback: false },
    thread: { totalCost: 0, totalQuantity: 0, fallbackPerBag: 0, hasFallback: false },
  };

  materialSourcing.componentSelections.forEach((selection) => {
    const category = resolveMaterialCategoryForSelection(selection, materials);
    let componentCostPerBag = selection.materialCostPerBagEgp ?? null;
    const requestedQuantity = selection.requestedQuantity ?? 0;
    let componentTotalCost: number | null = null;

    if (isFabricMaterialCategory(category) && effectiveExchangeRate !== null && requestedQuantity > 0) {
      const recomputedTotal = selection.selectedSources.reduce((total, source) => {
        const qtyUsedM2 = source.qtyUsedM2 ?? null;
        const unitCostUsdPerM2 = source.unitCostUsdPerM2 ?? null;
        const landedCostEgp = source.landedCostEgp ?? null;
        const customsPercent = source.customsPercent ?? 0;
        const freightCostPerM2Egp = source.freightCostPerM2Egp ?? 0;
        const clearanceCostPerM2Egp = source.clearanceCostPerM2Egp ?? 0;

        if (qtyUsedM2 === null) {
          return total;
        }

        const convertedCostPerM2Egp =
          unitCostUsdPerM2 !== null ? unitCostUsdPerM2 * effectiveExchangeRate : null;
        const customsCostPerM2Egp =
          source.sourceType === "stock" ? 0 : (convertedCostPerM2Egp ?? 0) * (customsPercent / 100);
        const landedCostPerM2Egp =
          source.sourceType === "stock"
            ? landedCostEgp
            : convertedCostPerM2Egp !== null
              ? convertedCostPerM2Egp +
                customsCostPerM2Egp +
                freightCostPerM2Egp +
                clearanceCostPerM2Egp
              : null;

        if (landedCostPerM2Egp === null) {
          return total;
        }

        return total + qtyUsedM2 * landedCostPerM2Egp;
      }, 0);

      componentTotalCost = recomputedTotal;
      componentCostPerBag = recomputedTotal / requestedQuantity;
    }

    if (componentCostPerBag === null) {
      return;
    }

    if (isFabricMaterialCategory(category)) {
      if (componentTotalCost !== null && requestedQuantity > 0) {
        categoryTotals.fabric.totalCost += componentTotalCost;
        categoryTotals.fabric.totalQuantity += requestedQuantity;
      } else {
        categoryTotals.fabric.fallbackPerBag += componentCostPerBag;
        categoryTotals.fabric.hasFallback = true;
      }
    } else if (isRingMaterialCategory(category)) {
      if (requestedQuantity > 0) {
        categoryTotals.ring.totalCost += componentCostPerBag * requestedQuantity;
        categoryTotals.ring.totalQuantity += requestedQuantity;
      } else {
        categoryTotals.ring.fallbackPerBag += componentCostPerBag;
        categoryTotals.ring.hasFallback = true;
      }
    } else if (isThreadingMaterialCategory(category)) {
      if (requestedQuantity > 0) {
        categoryTotals.thread.totalCost += componentCostPerBag * requestedQuantity;
        categoryTotals.thread.totalQuantity += requestedQuantity;
      } else {
        categoryTotals.thread.fallbackPerBag += componentCostPerBag;
        categoryTotals.thread.hasFallback = true;
      }
    }
  });

  const resolveWeightedPerBag = (totals: typeof categoryTotals.fabric) =>
    totals.totalQuantity > 0 ? totals.totalCost / totals.totalQuantity : totals.hasFallback ? totals.fallbackPerBag : null;

  return {
    A: resolveWeightedPerBag(categoryTotals.fabric),
    B: resolveWeightedPerBag(categoryTotals.ring),
    C: resolveWeightedPerBag(categoryTotals.thread),
  };
};

const buildProductOverheadLines = (products: ProductConfiguration["productSnapshots"] = []) =>
  products.flatMap((product) =>
    (["F", "G", "G2"] as const).map((baseCode) => ({
      code: productOverheadLineCode(baseCode, product.productId),
      category: `${productOverheadLineDefinitions[baseCode].category} · ${product.productName || product.productId}`,
      description: productOverheadLineDefinitions[baseCode].description,
      calculationBasis: productOverheadLineDefinitions[baseCode].calculationBasis,
      editable: true,
      costPerBag:
        baseCode === "F"
          ? product.factoryOverheadPerBag ?? null
          : baseCode === "G"
            ? product.manufacturingOverheadPerBag ?? null
            : product.managementOverheadPerBag ?? null,
    })),
  );

const buildDefaultLines = (
  materialLineOverrides: MaterialLineOverrides,
  defaults?: CostDefaults,
  products: ProductConfiguration["productSnapshots"] = [],
) => [
  ...lineDefinitions.map((line) => ({
    ...line,
    costPerBag:
      line.code === "A"
        ? materialLineOverrides.A
        : line.code === "B"
          ? materialLineOverrides.B
          : line.code === "C"
            ? materialLineOverrides.C
        : line.code === "F"
          ? defaults?.factoryOverheadPerBag ?? null
          : line.code === "G"
          ? defaults?.manufacturingOverheadPerBag ?? null
        : line.code === "G2"
          ? defaults?.managementOverheadPerBag ?? null
          : line.costPerBag ?? null,
  })),
  ...buildProductOverheadLines(products),
];

const initialForm = (tenderId: string): CostBuildUpForm => ({
  tenantId: "alimex-demo",
  tenderId,
  productConfigId: "base",
  alternativeId: "base",
  quantity: "",
  currency: "EGP",
  exchangeRate: "",
  currencySafetyFactorPercent: "",
  effectiveExchangeRate: "",
  salesInputMode: "percent",
  salesPercent: "",
  salesFixedAmount: "",
  costLines: buildDefaultLines({ A: null, B: null, C: null }).map((line) => ({
    ...line,
    costPerBag: line.costPerBag?.toString() ?? "",
  })),
  totalMaterialCostPerBag: "",
  totalOperatingCostPerBag: "",
  totalAdditionalCostPerBag: "",
  totalCostPricePerBag: "",
  totalCostPriceForOrder: "",
});

const deriveCostDefaults = (productConfiguration: ProductConfiguration | null): CostDefaults => {
  const snapshots = productConfiguration?.productSnapshots ?? [];

  if (!snapshots.length) {
    return {
      factoryOverheadPerBag: null,
      manufacturingOverheadPerBag: null,
      managementOverheadPerBag: null,
    };
  }

  let totalQuantity = 0;
  let factoryTotal = 0;
  let manufacturingTotal = 0;
  let managementTotal = 0;

  snapshots.forEach((snapshot) => {
    const quantity = snapshot.requestedQuantity ?? 0;
    if (quantity > 0) {
      totalQuantity += quantity;
      factoryTotal += (snapshot.factoryOverheadPerBag ?? 0) * quantity;
      manufacturingTotal += (snapshot.manufacturingOverheadPerBag ?? 0) * quantity;
      managementTotal += (snapshot.managementOverheadPerBag ?? 0) * quantity;
    }
  });

  if (totalQuantity > 0) {
    return {
      factoryOverheadPerBag: factoryTotal / totalQuantity,
      manufacturingOverheadPerBag: manufacturingTotal / totalQuantity,
      managementOverheadPerBag: managementTotal / totalQuantity,
    };
  }

  return {
    factoryOverheadPerBag: snapshots[0]?.factoryOverheadPerBag ?? null,
    manufacturingOverheadPerBag: snapshots[0]?.manufacturingOverheadPerBag ?? null,
    managementOverheadPerBag: snapshots[0]?.managementOverheadPerBag ?? null,
  };
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

const mergeCostLines = (
  savedLines: CostLine[] | undefined,
  materialLineOverrides: MaterialLineOverrides,
  defaults?: CostDefaults,
  products: ProductConfiguration["productSnapshots"] = [],
): CostLineForm[] => {
  const defaultLines = buildDefaultLines(materialLineOverrides, defaults, products);
  const savedByCode = new Map((savedLines ?? []).map((line) => [line.code, line]));

  return defaultLines.map((line) => {
    const saved = savedByCode.get(line.code);
    const productOverheadCode = parseProductOverheadLineCode(line.code);
    const costPerBag =
      ["A", "B", "C", "F", "G", "G2"].includes(line.code) || productOverheadCode
        ? line.costPerBag ?? null
        : saved?.editable
          ? saved.costPerBag
          : line.costPerBag ?? saved?.costPerBag ?? null;

    return {
      code: line.code,
      category: saved?.category ?? line.category,
      description: saved?.description ?? line.description,
      calculationBasis: saved?.calculationBasis ?? line.calculationBasis,
      editable: line.editable,
      costPerBag: costPerBag?.toString() ?? "",
    };
  });
};

const inferSalesInputMode = (savedLines: CostLine[] | undefined): "percent" | "fixed" => {
  const savedByCode = new Map((savedLines ?? []).map((line) => [line.code, line]));
  return savedByCode.get("H_FIXED")?.costPerBag !== null &&
    savedByCode.get("H_FIXED")?.costPerBag !== undefined
    ? "fixed"
    : "percent";
};

const syncProductConfigurationOverheads = (
  configuration: ProductConfiguration,
  costLines: Array<{ code: string; costPerBag: string | number | null }>,
): ProductConfiguration => {
  const costLineValues = new Map(
    costLines.map((line) => [
      line.code,
      typeof line.costPerBag === "string" ? numberOrNull(line.costPerBag) : line.costPerBag ?? null,
    ]),
  );

  return {
    ...configuration,
    productSnapshots: configuration.productSnapshots.map((product) => ({
      ...product,
      factoryOverheadPerBag:
        costLineValues.get(productOverheadLineCode("F", product.productId)) ?? product.factoryOverheadPerBag ?? null,
      manufacturingOverheadPerBag:
        costLineValues.get(productOverheadLineCode("G", product.productId)) ??
        product.manufacturingOverheadPerBag ??
        null,
      managementOverheadPerBag:
        costLineValues.get(productOverheadLineCode("G2", product.productId)) ??
        product.managementOverheadPerBag ??
        null,
    })),
  };
};

const toForm = (
  payload: CostBuildUp,
  materialLineOverrides: MaterialLineOverrides,
  defaults?: CostDefaults,
  products: ProductConfiguration["productSnapshots"] = [],
): CostBuildUpForm => ({
  tenantId: payload.tenantId,
  tenderId: payload.tenderId,
  productConfigId: payload.productConfigId,
  alternativeId: payload.alternativeId,
  quantity: payload.quantity?.toString() ?? "",
  currency: payload.currency,
  exchangeRate: payload.exchangeRate?.toString() ?? "",
  currencySafetyFactorPercent: payload.currencySafetyFactorPercent?.toString() ?? "",
  effectiveExchangeRate: payload.effectiveExchangeRate?.toString() ?? "",
  salesInputMode: inferSalesInputMode(payload.costLines),
  salesPercent:
    payload.costLines.find((line) => line.code === "H_PERCENT")?.costPerBag?.toString() ?? "",
  salesFixedAmount:
    payload.costLines.find((line) => line.code === "H_FIXED")?.costPerBag?.toString() ?? "",
  costLines: mergeCostLines(payload.costLines, materialLineOverrides, defaults, products),
  totalMaterialCostPerBag: payload.totalMaterialCostPerBag?.toString() ?? "",
  totalOperatingCostPerBag: payload.totalOperatingCostPerBag?.toString() ?? "",
  totalAdditionalCostPerBag: payload.totalAdditionalCostPerBag?.toString() ?? "",
  totalCostPricePerBag: payload.totalCostPricePerBag?.toString() ?? "",
  totalCostPriceForOrder: payload.totalCostPriceForOrder?.toString() ?? "",
});

export const CostBuildUpPage = () => {
  const navigate = useNavigate();
  const { tenderId = "" } = useParams();
  const [form, setForm] = useState<CostBuildUpForm>(() => initialForm(tenderId));
  const [tender, setTender] = useState<TenderRequest | null>(null);
  const [productConfiguration, setProductConfiguration] = useState<ProductConfiguration | null>(null);
  const [rollCalculation, setRollCalculation] = useState<RollCalculation | null>(null);
  const [materialSourcing, setMaterialSourcing] = useState<MaterialSourceSelection | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [activeLineHelp, setActiveLineHelp] = useState<{
    code: string;
    title: string;
    description: string;
    emptyMessage: string;
    summaryLabel: string;
    summaryDescription?: string;
    total: number | null;
    totalCost: number | null;
    totalRequestedQuantity: number | null;
    components: Array<{
      componentId: string;
      componentName: string;
      requestedQuantity: number | null;
      actualAreaPerBagM2: number | null;
      costPerBag: number | null;
      recomputedTotal: number | null;
      sources: Array<{
        sourceId: string;
        sourceName: string;
        sourceType: "stock" | "import";
        allocatedBags: number | null;
        actualAreaPerBagM2: number | null;
        qtyUsedM2: number | null;
        unitCostUsdPerM2: number | null;
        landedCostEgp: number | null;
        customsPercent: number | null;
        customsCostPerM2Egp: number | null;
        freightCostPerM2Egp: number | null;
        clearanceCostPerM2Egp: number | null;
        landedCostPerM2Egp: number | null;
        totalCostEgp: number | null;
      }>;
    }>;
    breakdownSections: Array<{
      id: string;
      title: string;
      description: string;
      costPerBag: number | null;
      totalCost: number | null;
      items: Array<{
        id: string;
        label: string;
        costPerBag: number | null;
        totalCost: number | null;
        valueType?: "currency" | "quantity";
      }>;
    }>;
  } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [saveMode, setSaveMode] = useState<"draft" | "continue" | null>(null);
  const [collapsedProducts, setCollapsedProducts] = useState<Record<string, boolean>>({});
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
        const [loadedTender, loadedConfiguration, loadedRollCalculation, loadedMaterialSourcing, loadedMaterials, saved] =
          await Promise.all([
            api.get<TenderRequest>(`/tenders/${tenderId}?tenantId=alimex-demo`),
            api.get<ProductConfiguration>(`/tenders/${tenderId}/product-configuration?tenantId=alimex-demo`),
            api
              .get<RollCalculation>(`/tenders/${tenderId}/roll-calculation?tenantId=alimex-demo`)
              .catch((reason) => {
                if (reason instanceof ApiError && reason.status === 404) {
                  return null;
                }

                throw reason;
              }),
            api
              .get<MaterialSourceSelection>(`/tenders/${tenderId}/material-sourcing?tenantId=alimex-demo`)
              .catch((reason) => {
                if (reason instanceof ApiError && reason.status === 404) {
                  return null;
                }

                throw reason;
              }),
            api.get<Material[]>(`/materials?tenantId=alimex-demo`),
            api
              .get<CostBuildUp>(`/tenders/${tenderId}/cost-build-up?tenantId=alimex-demo`)
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
        setProductConfiguration(loadedConfiguration);
        setRollCalculation(loadedRollCalculation);
        setMaterialSourcing(loadedMaterialSourcing);
        setMaterials(loadedMaterials.filter((item) => item.active));

        if (!loadedMaterialSourcing) {
          setError(
            "Material Sourcing & Costing needs to be rebuilt from the latest Product Configuration before cost build-up can be finalized.",
          );
        }

        const materialLineOverrides = calculateMaterialLineOverrides({
          materialSourcing: loadedMaterialSourcing,
          exchangeRate: loadedTender.exchangeRate ?? null,
          currencySafetyFactorPercent: loadedTender.currencySafetyFactorPercent ?? null,
          materials: loadedMaterials,
        });
        const costDefaults = deriveCostDefaults(loadedConfiguration);
        if (saved) {
          const nextForm = toForm(
            saved,
            materialLineOverrides,
            costDefaults,
            loadedConfiguration.productSnapshots ?? [],
          );
          setForm(nextForm);
          setLastSavedSignature(JSON.stringify(nextForm));
          return;
        }

        const nextForm = {
          ...initialForm(tenderId),
          tenantId: loadedTender.tenantId,
          productConfigId: loadedConfiguration.productConfigId,
          quantity: loadedConfiguration.quantity?.toString() ?? "",
          exchangeRate: loadedTender.exchangeRate?.toString() ?? "",
          currencySafetyFactorPercent: loadedTender.currencySafetyFactorPercent?.toString() ?? "",
          effectiveExchangeRate:
            loadedTender.exchangeRate !== null &&
            loadedTender.exchangeRate !== undefined &&
            loadedTender.currencySafetyFactorPercent !== null &&
            loadedTender.currencySafetyFactorPercent !== undefined
              ? (
                  loadedTender.exchangeRate *
                  (1 + loadedTender.currencySafetyFactorPercent / 100)
                ).toString()
              : "",
          costLines: mergeCostLines(
            undefined,
            materialLineOverrides,
            costDefaults,
            loadedConfiguration.productSnapshots ?? [],
          ),
        };
        setForm(nextForm);
        setLastSavedSignature(JSON.stringify(nextForm));
      } catch (reason) {
        if (isMounted) {
          setError(reason instanceof Error ? reason.message : "Unable to load cost build-up.");
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
  const exchangeRate = numberOrNull(form.exchangeRate);
  const currencySafetyFactorPercent = numberOrNull(form.currencySafetyFactorPercent);
  const effectiveExchangeRate =
    exchangeRate !== null && currencySafetyFactorPercent !== null
      ? exchangeRate * (1 + currencySafetyFactorPercent / 100)
      : null;
  const materialLineOverrides = useMemo(
    () =>
      calculateMaterialLineOverrides({
        materialSourcing,
        exchangeRate,
        currencySafetyFactorPercent,
        materials,
      }),
    [materialSourcing, exchangeRate, currencySafetyFactorPercent, materials],
  );
  const productSnapshots = productConfiguration?.productSnapshots ?? [];
  const orderQuantity = useMemo(() => {
    const totalProductQuantity = productSnapshots.reduce(
      (sum, product) => sum + (product.requestedQuantity ?? 0),
      0,
    );

    return totalProductQuantity > 0 ? totalProductQuantity : quantity;
  }, [productSnapshots, quantity]);

  useEffect(() => {
    setCollapsedProducts(
      Object.fromEntries(productSnapshots.map((product) => [product.productId, true])),
    );
  }, [productSnapshots]);

  const productOverheadValues = useMemo(
    () =>
      productSnapshots.map((product) => {
        const readProductValue = (baseCode: "F" | "G" | "G2", fallback: number | null | undefined) => {
          const savedValue = form.costLines.find(
            (line) => line.code === productOverheadLineCode(baseCode, product.productId),
          )?.costPerBag;
          return savedValue !== undefined ? numberOrNull(savedValue) : fallback ?? null;
        };

        return {
          productId: product.productId,
          productName: product.productName || "Untitled product",
          requestedQuantity: product.requestedQuantity ?? null,
          factoryOverheadPerBag: readProductValue("F", product.factoryOverheadPerBag),
          manufacturingOverheadPerBag: readProductValue("G", product.manufacturingOverheadPerBag),
          managementOverheadPerBag: readProductValue("G2", product.managementOverheadPerBag),
        };
      }),
    [form.costLines, productSnapshots],
  );

  const productSyncStatuses = useMemo(
    () =>
      getProductConfigurationSyncStatuses(
        productConfiguration,
        materials,
        (materialSourcing?.componentSelections ?? []).map((selection) => ({
          productId: selection.productId,
          productName: selection.productName,
          componentId: selection.componentId,
          componentName: selection.componentName,
          componentType: null,
          materialId: selection.materialId,
          accessoryTotalPricePerBagEgp: null,
          requestedQuantity: selection.requestedQuantity,
          bagDiameterMm: selection.bagDiameterMm,
          bagLengthMm: selection.bagLengthMm,
          seamAllowanceMm: selection.seamAllowanceMm,
          topBottomAllowanceMm: selection.topBottomAllowanceMm,
        })),
      ),
    [materialSourcing?.componentSelections, materials, productConfiguration],
  );

  const sourcingBreakdown = materialSourcing?.componentSelections ?? [];

  const productCards = useMemo(
    () =>
      productSnapshots.map((product) => ({
        productId: product.productId,
        productName: product.productName || "Untitled product",
        productType: product.productType,
        requestedQuantity: product.requestedQuantity,
        isOutOfSync: productSyncStatuses.get(product.productId)?.isOutOfSync ?? false,
        componentsCount: product.components.length,
        bagBodyCount: product.components.filter(
          (component) =>
          component.componentType.trim().toLowerCase() === "bag" ||
          component.componentName.trim().toLowerCase() === "bag" ||
          component.componentType.trim().toLowerCase() === "bag body" ||
          component.componentName.trim().toLowerCase() === "bag body",
        ).length,
        factoryOverheadPerBag: product.factoryOverheadPerBag ?? null,
        manufacturingOverheadPerBag: product.manufacturingOverheadPerBag ?? null,
        managementOverheadPerBag: product.managementOverheadPerBag ?? null,
      })),
    [productSnapshots, productSyncStatuses],
  );

  const productCostCards = useMemo(() => {
    const editableByCode = new Map(
      form.costLines.map((line) => [line.code, { ...line, costPerBag: numberOrNull(line.costPerBag) }]),
    );

    const readNullable = (code: string) => editableByCode.get(code)?.costPerBag ?? null;
    const read = (code: string) => readNullable(code) ?? 0;
    const salesPercent = numberOrNull(form.salesPercent) ?? 0;
    const salesFixedAmount = numberOrNull(form.salesFixedAmount) ?? 0;
    const packagingCostPerBag = read("D");
    const rushCostPerBag = read("I_RUSH");
    const transportationCostPerBag = read("J");
    const installationCostPerBag = read("K");
    const totalBags = orderQuantity !== null && Number.isFinite(orderQuantity) && orderQuantity > 0 ? orderQuantity : 0;

    const productSummaries = productCards.map((product) => {
      const requestedQuantityValue =
        product.requestedQuantity !== null &&
        product.requestedQuantity !== undefined &&
        Number.isFinite(product.requestedQuantity) &&
        product.requestedQuantity > 0
          ? product.requestedQuantity
          : 0;
      const sourcingLines = sourcingBreakdown.filter((selection) => selection.productId === product.productId);

      let fabricMaterialTotal = 0;
      let ringMaterialTotal = 0;
      let threadMaterialTotal = 0;

      sourcingLines.forEach((selection) => {
        const requestedQuantity = selection.requestedQuantity ?? product.requestedQuantity ?? null;
        const componentTotal =
          selection.totalMaterialCostEgp ??
          (selection.materialCostPerBagEgp !== null &&
          selection.materialCostPerBagEgp !== undefined &&
          requestedQuantity !== null &&
          requestedQuantity !== undefined
            ? selection.materialCostPerBagEgp * requestedQuantity
            : 0);
        const category = resolveMaterialCategoryForSelection(selection, materials);

        if (isFabricMaterialCategory(category)) {
          fabricMaterialTotal += componentTotal;
        } else if (isRingMaterialCategory(category)) {
          ringMaterialTotal += componentTotal;
        } else if (isThreadingMaterialCategory(category)) {
          threadMaterialTotal += componentTotal;
        }
      });

      const packagingTotal = packagingCostPerBag * requestedQuantityValue;
      const factoryOverheadPerBag =
        productOverheadValues.find((item) => item.productId === product.productId)?.factoryOverheadPerBag ??
        readNullable("F") ??
        0;
      const manufacturingOverheadPerBag =
        productOverheadValues.find((item) => item.productId === product.productId)?.manufacturingOverheadPerBag ??
        readNullable("G") ??
        0;
      const managementOverheadPerBag =
        productOverheadValues.find((item) => item.productId === product.productId)?.managementOverheadPerBag ??
        readNullable("G2") ??
        0;
      const factoryOverheadTotal = factoryOverheadPerBag * requestedQuantityValue;
      const manufacturingOverheadTotal = manufacturingOverheadPerBag * requestedQuantityValue;
      const managementOverheadTotal = managementOverheadPerBag * requestedQuantityValue;
      const rushTotal = rushCostPerBag * requestedQuantityValue;
      const transportationTotal = transportationCostPerBag * requestedQuantityValue;
      const installationTotal = installationCostPerBag * requestedQuantityValue;
      const directMaterialTotal = fabricMaterialTotal + ringMaterialTotal + threadMaterialTotal;
      const materialTotal = directMaterialTotal + packagingTotal;
      const additionalTotal = rushTotal + transportationTotal + installationTotal;
      const salesBasisTotal = materialTotal + manufacturingOverheadTotal + additionalTotal;

      return {
        ...product,
        requestedQuantityValue,
        fabricMaterialTotal,
        ringMaterialTotal,
        threadMaterialTotal,
        directMaterialTotal,
        packagingTotal,
        materialTotal,
        factoryOverheadTotal,
        manufacturingOverheadTotal,
        managementOverheadTotal,
        rushTotal,
        transportationTotal,
        installationTotal,
        additionalTotal,
        salesBasisTotal,
        overheads: productOverheadValues.find((item) => item.productId === product.productId) ?? null,
      };
    });

    const totalSalesBasis = productSummaries.reduce((sum, product) => sum + product.salesBasisTotal, 0);
    const totalSalesAmount =
      form.salesInputMode === "percent" ? totalSalesBasis * (salesPercent / 100) : salesFixedAmount;

    return productSummaries.map((product) => {
      const salesTotal =
        form.salesInputMode === "percent"
          ? totalSalesBasis > 0
            ? totalSalesAmount * (product.salesBasisTotal / totalSalesBasis)
            : 0
          : totalBags > 0
            ? totalSalesAmount * (product.requestedQuantityValue / totalBags)
            : 0;
      const operatingTotal =
        product.factoryOverheadTotal +
        product.manufacturingOverheadTotal +
        product.managementOverheadTotal +
        salesTotal;
      const totalCost = product.materialTotal + operatingTotal + product.additionalTotal;
      const materialPerBag =
        product.requestedQuantityValue > 0 ? product.materialTotal / product.requestedQuantityValue : 0;
      const operatingPerBag =
        product.requestedQuantityValue > 0 ? operatingTotal / product.requestedQuantityValue : 0;
      const additionalPerBag =
        product.requestedQuantityValue > 0 ? product.additionalTotal / product.requestedQuantityValue : 0;
      const totalPerBag = product.requestedQuantityValue > 0 ? totalCost / product.requestedQuantityValue : 0;

      return {
        ...product,
        salesTotal,
        operatingTotal,
        totalCost,
        materialPerBag,
        operatingPerBag,
        additionalPerBag,
        totalPerBag,
      };
    });
  }, [
    form.costLines,
    form.salesFixedAmount,
    form.salesInputMode,
    form.salesPercent,
    materials,
    orderQuantity,
    productCards,
    productOverheadValues,
    sourcingBreakdown,
  ]);

  const tenderCostSummary = useMemo(() => {
    const totalQuantity =
      orderQuantity !== null && Number.isFinite(orderQuantity) && orderQuantity > 0 ? orderQuantity : null;
    const fabricMaterialTotal = productCostCards.reduce((sum, product) => sum + product.fabricMaterialTotal, 0);
    const ringMaterialTotal = productCostCards.reduce((sum, product) => sum + product.ringMaterialTotal, 0);
    const threadMaterialTotal = productCostCards.reduce((sum, product) => sum + product.threadMaterialTotal, 0);
    const packagingTotal = productCostCards.reduce((sum, product) => sum + product.packagingTotal, 0);
    const materialTotal = productCostCards.reduce((sum, product) => sum + product.materialTotal, 0);
    const factoryOverheadTotal = productCostCards.reduce((sum, product) => sum + product.factoryOverheadTotal, 0);
    const manufacturingOverheadTotal = productCostCards.reduce(
      (sum, product) => sum + product.manufacturingOverheadTotal,
      0,
    );
    const managementOverheadTotal = productCostCards.reduce((sum, product) => sum + product.managementOverheadTotal, 0);
    const salesTotal = productCostCards.reduce((sum, product) => sum + product.salesTotal, 0);
    const operatingTotal = productCostCards.reduce((sum, product) => sum + product.operatingTotal, 0);
    const rushTotal = productCostCards.reduce((sum, product) => sum + product.rushTotal, 0);
    const transportationTotal = productCostCards.reduce((sum, product) => sum + product.transportationTotal, 0);
    const installationTotal = productCostCards.reduce((sum, product) => sum + product.installationTotal, 0);
    const additionalTotal = productCostCards.reduce((sum, product) => sum + product.additionalTotal, 0);
    const totalCost = productCostCards.reduce((sum, product) => sum + product.totalCost, 0);
    const salesBasisTotal = productCostCards.reduce((sum, product) => sum + product.salesBasisTotal, 0);
    const perBag = (value: number, fallback: number | null = null) =>
      totalQuantity && totalQuantity > 0 ? value / totalQuantity : fallback;

    return {
      totalQuantity,
      fabricMaterialTotal,
      ringMaterialTotal,
      threadMaterialTotal,
      packagingTotal,
      materialTotal,
      factoryOverheadTotal,
      manufacturingOverheadTotal,
      managementOverheadTotal,
      salesTotal,
      operatingTotal,
      rushTotal,
      transportationTotal,
      installationTotal,
      additionalTotal,
      salesBasisTotal,
      totalCost,
      materialPerBag: perBag(materialTotal),
      operatingPerBag: perBag(operatingTotal),
      additionalPerBag: perBag(additionalTotal),
      totalPerBag: perBag(totalCost),
    };
  }, [orderQuantity, productCostCards]);

  const calculatedLines = useMemo(() => {
    const editableByCode = new Map(
      form.costLines.map((line) => [line.code, { ...line, costPerBag: numberOrNull(line.costPerBag) }]),
    );

    const readNullable = (code: string) => editableByCode.get(code)?.costPerBag ?? null;
    const totalQuantity = tenderCostSummary.totalQuantity;
    const perBag = (value: number, fallback: number | null = null) =>
      totalQuantity && totalQuantity > 0 ? value / totalQuantity : fallback;
    const totalCostPricePerBag = perBag(tenderCostSummary.totalCost);

    return form.costLines.map((line) => {
      let value = numberOrNull(line.costPerBag);

      if (line.code === "A") {
        value = perBag(tenderCostSummary.fabricMaterialTotal, materialLineOverrides.A);
      } else if (line.code === "B") {
        value = perBag(tenderCostSummary.ringMaterialTotal, materialLineOverrides.B);
      } else if (line.code === "C") {
        value = perBag(tenderCostSummary.threadMaterialTotal, materialLineOverrides.C);
      } else if (line.code === "D") {
        value = perBag(tenderCostSummary.packagingTotal, readNullable("D"));
      } else if (line.code === "F") {
        value = perBag(tenderCostSummary.factoryOverheadTotal, readNullable("F"));
      } else if (line.code === "G") {
        value = perBag(tenderCostSummary.manufacturingOverheadTotal, readNullable("G"));
      } else if (line.code === "G2") {
        value = perBag(tenderCostSummary.managementOverheadTotal, readNullable("G2"));
      } else if (line.code === "H") {
        value = perBag(tenderCostSummary.salesTotal, readNullable("H"));
      } else if (line.code === "I_RUSH") {
        value = perBag(tenderCostSummary.rushTotal, readNullable("I_RUSH"));
      } else if (line.code === "J") {
        value = perBag(tenderCostSummary.transportationTotal, readNullable("J"));
      } else if (line.code === "K") {
        value = perBag(tenderCostSummary.installationTotal, readNullable("K"));
      } else if (line.code === "I_TOTAL") {
        value = tenderCostSummary.materialPerBag;
      } else if (line.code === "II_TOTAL") {
        value = tenderCostSummary.operatingPerBag;
      } else if (line.code === "III_TOTAL") {
        value = tenderCostSummary.additionalPerBag;
      }

      return {
        ...line,
        costPerBag: value,
        percentOfTotal:
          totalCostPricePerBag !== null && totalCostPricePerBag > 0 && value !== null
            ? (value / totalCostPricePerBag) * 100
            : 0,
      };
    });
  }, [
    form.costLines,
    materialLineOverrides,
    tenderCostSummary,
  ]);

  const currentLineValues = useMemo(
    () =>
      new Map(calculatedLines.map((line) => [line.code, line.costPerBag ?? 0])),
    [calculatedLines],
  );

  const totals = useMemo(() => {
    return {
      totalMaterialCostPerBag: tenderCostSummary.materialPerBag,
      totalOperatingCostPerBag: tenderCostSummary.operatingPerBag,
      totalAdditionalCostPerBag: tenderCostSummary.additionalPerBag,
      totalCostPricePerBag: tenderCostSummary.totalPerBag,
      totalCostPriceForOrder: tenderCostSummary.totalCost,
    };
  }, [tenderCostSummary]);

  const tenderDefaultEffectiveExchangeRate =
    tender?.exchangeRate !== null &&
    tender?.exchangeRate !== undefined &&
    tender?.currencySafetyFactorPercent !== null &&
    tender?.currencySafetyFactorPercent !== undefined
      ? tender.exchangeRate * (1 + tender.currencySafetyFactorPercent / 100)
      : null;

  const chartData = [
    { name: "Material Cost", value: tenderCostSummary.materialTotal ?? 0 },
    { name: "Operating Cost", value: tenderCostSummary.operatingTotal ?? 0 },
    { name: "Additional Cost", value: tenderCostSummary.additionalTotal ?? 0 },
  ];

  const lineABreakdown = useMemo(() => {
    const components = sourcingBreakdown
      .filter((selection) => isFabricMaterialCategory(resolveMaterialCategoryForSelection(selection, materials)))
      .map((selection) => {
        const sources = selection.selectedSources.map((source) => {
          const qtyUsedM2 = source.qtyUsedM2 ?? null;
          const unitCostUsdPerM2 = source.unitCostUsdPerM2 ?? null;
          const landedCostEgp = source.landedCostEgp ?? null;
          const customsPercent = source.customsPercent ?? 0;
          const freightCostPerM2Egp = source.freightCostPerM2Egp ?? 0;
          const clearanceCostPerM2Egp = source.clearanceCostPerM2Egp ?? 0;
          const convertedCostPerM2Egp =
            unitCostUsdPerM2 !== null && effectiveExchangeRate !== null
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
                ? convertedCostPerM2Egp + (customsCostPerM2Egp ?? 0) + freightCostPerM2Egp + clearanceCostPerM2Egp
                : null;
          const totalCostEgp =
            qtyUsedM2 !== null && landedCostPerM2Egp !== null ? qtyUsedM2 * landedCostPerM2Egp : null;

          return {
            sourceId: source.sourceId,
            sourceName: source.sourceName,
            sourceType: source.sourceType,
            allocatedBags: source.allocatedBags ?? null,
            actualAreaPerBagM2: source.actualAreaPerBagM2 ?? null,
            qtyUsedM2,
            unitCostUsdPerM2,
            landedCostEgp,
            customsPercent,
            customsCostPerM2Egp,
            freightCostPerM2Egp,
            clearanceCostPerM2Egp,
            landedCostPerM2Egp,
            totalCostEgp,
          };
        });

        const recomputedTotal = sources.reduce((sum, source) => sum + (source.totalCostEgp ?? 0), 0);
        const requestedQuantity = selection.requestedQuantity ?? null;

        return {
          componentId: selection.componentId,
          componentName: selection.componentName,
          requestedQuantity,
          actualAreaPerBagM2: selection.actualAreaPerBagM2 ?? null,
          costPerBag:
            requestedQuantity !== null && requestedQuantity > 0
              ? recomputedTotal / requestedQuantity
              : selection.materialCostPerBagEgp ?? null,
          recomputedTotal: sources.length ? recomputedTotal : null,
          sources,
        };
      });

    const totalCost = components.reduce((sum, component) => sum + (component.recomputedTotal ?? 0), 0);
    const totalRequestedQuantity = components.reduce((sum, component) => sum + (component.requestedQuantity ?? 0), 0);

    return {
      totalCost,
      totalRequestedQuantity,
      total: totalRequestedQuantity > 0 ? totalCost / totalRequestedQuantity : components.reduce((sum, component) => sum + (component.costPerBag ?? 0), 0),
      components,
    };
  }, [effectiveExchangeRate, materialSourcing, materials, sourcingBreakdown]);

  const tenderMaterialTotalCost = useMemo(
    () => sourcingBreakdown.reduce((total, selection) => total + (selection.totalMaterialCostEgp ?? 0), 0),
    [sourcingBreakdown],
  );

  const materialBreakdownGrid = useMemo(
    () =>
      productCards.map((product) => {
        const productSnapshot = productSnapshots.find((item) => item.productId === product.productId);
        const components = (productSnapshot?.components ?? []).map((component) => {
          const sourcedSelection = sourcingBreakdown.find(
            (selection) => selection.productId === product.productId && selection.componentId === component.componentId,
          );
          const specification = sourcedSelection
            ? formatComponentSpecification(sourcedSelection)
            : {
                primary: component.material || component.accessorySnapshot?.accessoryName || "Not set",
                secondary: component.componentType || "Component",
              };
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

          return {
            componentId: component.componentId,
            componentName: component.componentName,
            componentType: component.componentType,
            materialId: specification.primary,
            detail: specification.secondary,
            requestedQuantity,
            unitCost,
            totalCost,
          };
        });

        const productMaterialTotalCost = components.reduce((sum, component) => sum + (component.totalCost ?? 0), 0);
        const productMaterialUnitCost =
          product.requestedQuantity !== null && product.requestedQuantity !== undefined && product.requestedQuantity > 0
            ? productMaterialTotalCost / product.requestedQuantity
            : null;
        const bagMaterialTotalCost = components.reduce((sum, component) => {
          const normalizedType = component.componentType.trim().toLowerCase();
          const normalizedName = component.componentName.trim().toLowerCase();
          const isBagComponent =
            normalizedType === "bag" ||
            normalizedType === "bag body" ||
            normalizedName === "bag" ||
            normalizedName === "bag body";

          return isBagComponent ? sum + (component.totalCost ?? 0) : sum;
        }, 0);
        const accessoryMaterialTotalCost = Math.max(0, productMaterialTotalCost - bagMaterialTotalCost);
        const bagMaterialUnitCost =
          product.requestedQuantity !== null && product.requestedQuantity !== undefined && product.requestedQuantity > 0
            ? bagMaterialTotalCost / product.requestedQuantity
            : null;
        const accessoryMaterialUnitCost =
          product.requestedQuantity !== null && product.requestedQuantity !== undefined && product.requestedQuantity > 0
            ? accessoryMaterialTotalCost / product.requestedQuantity
            : null;
        const costSummary = productCostCards.find((item) => item.productId === product.productId);
        const totalUnitCost = costSummary?.totalPerBag ?? productMaterialUnitCost;
        const totalCost = costSummary?.totalCost ?? productMaterialTotalCost;

        return {
          ...product,
          components,
          productMaterialUnitCost,
          productMaterialTotalCost,
          bagMaterialUnitCost,
          bagMaterialTotalCost,
          accessoryMaterialUnitCost,
          accessoryMaterialTotalCost,
          overheads: costSummary?.overheads ?? null,
          materialPerBag: costSummary?.materialPerBag ?? productMaterialUnitCost ?? 0,
          operatingPerBag: costSummary?.operatingPerBag ?? 0,
          additionalPerBag: costSummary?.additionalPerBag ?? 0,
          totalUnitCost,
          totalCost,
        };
      }),
    [productCards, productCostCards, productSnapshots, sourcingBreakdown],
  );

  const tenderGridSummary = useMemo(() => {
    return {
      totalQuantity: tenderCostSummary.totalQuantity ?? quantity,
      unitCost: tenderCostSummary.totalPerBag,
      totalCost: tenderCostSummary.totalCost,
    };
  }, [quantity, tenderCostSummary]);

  const salesSummary = useMemo(() => {
    const fixedSalesAmount = numberOrNull(form.salesFixedAmount) ?? 0;
    const salesPercent = numberOrNull(form.salesPercent) ?? 0;
    const totalBeforeSalesOrder = tenderCostSummary.totalCost - tenderCostSummary.salesTotal;
    const totalBeforeSalesPerBag =
      totalBeforeSalesOrder !== null &&
      tenderCostSummary.totalQuantity !== null &&
      Number.isFinite(tenderCostSummary.totalQuantity) &&
      tenderCostSummary.totalQuantity > 0
        ? totalBeforeSalesOrder / tenderCostSummary.totalQuantity
        : null;

    return {
      overtimeCostPerBag:
        tenderCostSummary.totalQuantity && tenderCostSummary.totalQuantity > 0
          ? tenderCostSummary.rushTotal / tenderCostSummary.totalQuantity
          : 0,
      transportationCostPerBag:
        tenderCostSummary.totalQuantity && tenderCostSummary.totalQuantity > 0
          ? tenderCostSummary.transportationTotal / tenderCostSummary.totalQuantity
          : 0,
      installationCostPerBag:
        tenderCostSummary.totalQuantity && tenderCostSummary.totalQuantity > 0
          ? tenderCostSummary.installationTotal / tenderCostSummary.totalQuantity
          : 0,
      fixedSalesAmount,
      salesPercent,
      salesCostPerBag: tenderCostSummary.totalPerBag !== null && totalBeforeSalesPerBag !== null
        ? tenderCostSummary.totalPerBag - totalBeforeSalesPerBag
        : 0,
      totalBeforeSalesPerBag,
      totalBeforeSalesOrder,
    };
  }, [form.salesFixedAmount, form.salesPercent, tenderCostSummary]);

  const costCompletion = useMemo(() => {
    const trackedValues = [
      form.exchangeRate,
      form.currencySafetyFactorPercent,
      form.costLines.find((line) => line.code === "I_RUSH")?.costPerBag ?? "",
      form.costLines.find((line) => line.code === "J")?.costPerBag ?? "",
      form.costLines.find((line) => line.code === "K")?.costPerBag ?? "",
      form.salesInputMode === "percent" ? form.salesPercent : form.salesFixedAmount,
    ];
    const filledLines = trackedValues.filter((value) => value.trim() !== "").length;
    return {
      filledLines,
      totalLines: trackedValues.length,
      percent: trackedValues.length > 0 ? Math.round((filledLines / trackedValues.length) * 100) : 0,
    };
  }, [form]);

  const updateLineCost = (code: string, value: string) => {
    const nextValue = value.trim() === "" ? "0" : value;

    setForm((current) => ({
      ...current,
      costLines: current.costLines.map((line) =>
        line.code === code ? { ...line, costPerBag: nextValue } : line,
      ),
    }));
  };

  const updateField = <K extends keyof CostBuildUpForm>(key: K, value: CostBuildUpForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleProductCollapse = (productId: string) => {
    setCollapsedProducts((current) => ({
      ...current,
      [productId]: !current[productId],
    }));
  };

  const rowCellClassName = (base: string, rowBackground: string) => `${rowBackground} ${base}`;

  const payload = useMemo<CostBuildUp>(
    () => ({
      entityType: "COST_BUILDUP",
      tenantId: form.tenantId,
      tenderId,
      productConfigId: form.productConfigId || productConfiguration?.productConfigId || "base",
      alternativeId: form.alternativeId || "base",
      quantity,
      currency: "EGP",
      exchangeRate,
      currencySafetyFactorPercent,
      effectiveExchangeRate,
      costLines: [
        ...calculatedLines.map((line) => ({
          code: line.code,
          category: line.category,
          description: line.description,
          calculationBasis: line.calculationBasis,
          costPerBag: line.costPerBag,
          editable: line.editable,
        })),
        {
          code: "H_PERCENT",
          category: "Sales Input",
          description: "Stored sales percentage input for cost build-up.",
          calculationBasis: "Used when sales mode is percent",
          costPerBag: form.salesInputMode === "percent" ? numberOrNull(form.salesPercent) : null,
          editable: true,
        },
        {
          code: "H_FIXED",
          category: "Sales Input",
          description: "Stored fixed sales amount input for the full tender cost build-up.",
          calculationBasis: "Used when sales mode is fixed for the whole tender",
          costPerBag: form.salesInputMode === "fixed" ? numberOrNull(form.salesFixedAmount) : null,
          editable: true,
        },
      ],
      totalMaterialCostPerBag: totals.totalMaterialCostPerBag,
      totalOperatingCostPerBag: totals.totalOperatingCostPerBag,
      totalAdditionalCostPerBag: totals.totalAdditionalCostPerBag,
      totalCostPricePerBag: totals.totalCostPricePerBag,
      totalCostPriceForOrder: totals.totalCostPriceForOrder,
      createdAt: "",
      updatedAt: "",
    }),
    [
      form.tenantId,
      form.productConfigId,
      form.alternativeId,
      quantity,
      tenderId,
      productConfiguration,
      exchangeRate,
      currencySafetyFactorPercent,
      effectiveExchangeRate,
      calculatedLines,
      form.salesFixedAmount,
      form.salesInputMode,
      form.salesPercent,
      totals,
    ],
  );
  const currentSignature = useMemo(() => JSON.stringify(form), [form]);
  const isDirty = currentSignature !== lastSavedSignature;

  useUnsavedChangesWarning(isDirty);

  const save = async (mode: "draft" | "continue") => {
    setMessage("");
    setError("");
    setSaveMode(mode);

    if (!isApiConfigured) {
      setError("Set VITE_API_BASE_URL before saving cost build-up.");
      setSaveMode(null);
      return;
    }

    try {
      const syncedConfiguration = productConfiguration
        ? syncProductConfigurationOverheads(productConfiguration, form.costLines)
        : null;
      const persistedConfiguration = syncedConfiguration
        ? await api.put<ProductConfiguration>(
            `/tenders/${tenderId}/product-configuration`,
            syncedConfiguration,
          )
        : null;
      const response = await api.put<CostBuildUp>(`/tenders/${tenderId}/cost-build-up`, payload);
      const nextMaterialLineOverrides = calculateMaterialLineOverrides({
        materialSourcing,
        exchangeRate,
        currencySafetyFactorPercent,
        materials,
      });
      const nextConfiguration = persistedConfiguration ?? productConfiguration;
      const nextForm = toForm(
        response,
        nextMaterialLineOverrides,
        deriveCostDefaults(nextConfiguration),
        nextConfiguration?.productSnapshots ?? [],
      );
      setProductConfiguration(nextConfiguration);
      setForm(nextForm);
      setLastSavedSignature(JSON.stringify(nextForm));
      setMessage(
        mode === "draft" ? "Cost build-up saved." : "Cost build-up saved. Continuing to alternatives.",
      );

      if (mode === "continue") {
        navigate(`/tenders/${tenderId}/alternatives`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save cost build-up.");
    } finally {
      setSaveMode(null);
    }
  };

  return (
    <div className="space-y-6">
      <TenderWorkflowStepper currentStep={4} tenderId={tenderId} isDirty={isDirty} />

      {isLoading ? (
        <div className="rounded-2xl bg-slate-50 p-6 text-sm text-muted-foreground">
          Loading tender, configuration, roll calculation, material sourcing, and saved cost build-up...
        </div>
      ) : null}

      {!isLoading ? (
        <>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_320px]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Cost Build-Up Per Bag</CardTitle>
                  <CardDescription>
                    Calculate the full cost price per bag after material sourcing is complete.
                  </CardDescription>
                </div>
                <Badge variant="default">COST_BUILDUP</Badge>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                  <section className="rounded-[1.25rem] border border-blue-100 bg-gradient-to-br from-sky-50 via-white to-blue-50 p-5">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Cost Inputs</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Tender defaults load automatically, and any overrides here update the full cost build-up.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-100 p-3 text-blue-700">
                        <Calculator className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Exchange Rate
                        <Input
                          inputMode="decimal"
                          value={form.exchangeRate}
                          onChange={(event) => updateField("exchangeRate", event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Tender default: {formatMetric(tender?.exchangeRate ?? null, 3)}
                        </p>
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Currency Safety Factor %
                        <Input
                          inputMode="decimal"
                          value={form.currencySafetyFactorPercent}
                          onChange={(event) => updateField("currencySafetyFactorPercent", event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Tender default: {formatMetric(tender?.currencySafetyFactorPercent ?? null, 2, "%")}
                        </p>
                      </label>
                      <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-700">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Effective Exchange Rate</p>
                        <p className="mt-2 font-semibold text-slate-900">{formatMetric(effectiveExchangeRate, 3)}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Tender default: {formatMetric(tenderDefaultEffectiveExchangeRate, 3)}
                        </p>
                      </div>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Overtime / Bag
                        <Input
                          inputMode="decimal"
                          value={form.costLines.find((line) => line.code === "I_RUSH")?.costPerBag ?? "0"}
                          onChange={(event) => updateLineCost("I_RUSH", event.target.value)}
                        />
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Installation / Bag
                        <Input
                          inputMode="decimal"
                          value={form.costLines.find((line) => line.code === "K")?.costPerBag ?? "0"}
                          onChange={(event) => updateLineCost("K", event.target.value)}
                        />
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Transportation Cost / Bag
                        <Input
                          inputMode="decimal"
                          value={form.costLines.find((line) => line.code === "J")?.costPerBag ?? "0"}
                          onChange={(event) => updateLineCost("J", event.target.value)}
                        />
                      </label>
                    </div>

                    <div className="mt-4 rounded-[1.25rem] border border-blue-100 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Sales Input</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Use a percentage of the tender cost before sales, or set one fixed sales amount for the whole tender.
                          </p>
                        </div>
                        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                          <button
                            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                              form.salesInputMode === "percent"
                                ? "bg-blue-600 text-white"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                            onClick={() => updateField("salesInputMode", "percent")}
                            type="button"
                          >
                            Percentage
                          </button>
                          <button
                            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                              form.salesInputMode === "fixed"
                                ? "bg-blue-600 text-white"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                            onClick={() => updateField("salesInputMode", "fixed")}
                            type="button"
                          >
                            Fixed
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px_280px]">
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Sales Basis</p>
                          <p className="mt-2 font-semibold text-slate-900">
                            {`${formatMetric(salesSummary.totalBeforeSalesOrder, 2, " EGP")} total tender cost before sales`}
                          </p>
                        </div>
                        <label className="space-y-2 text-sm font-medium text-slate-700">
                          {form.salesInputMode === "percent" ? "Sales Percentage %" : "Sales Fixed"}
                          <Input
                            inputMode="decimal"
                            value={form.salesInputMode === "percent" ? form.salesPercent : form.salesFixedAmount}
                            onChange={(event) =>
                              form.salesInputMode === "percent"
                                ? updateField("salesPercent", event.target.value)
                                : updateField("salesFixedAmount", event.target.value)
                            }
                          />
                        </label>
                        <div className="rounded-2xl border border-blue-100 bg-blue-50/40 px-4 py-3 text-sm text-slate-700">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Calculated Sales / Bag</p>
                          <p className="mt-2 font-semibold text-slate-900">
                            {formatMetric(currentLineValues.get("H") ?? null, 2, " EGP")}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Base before sales: {formatMetric(salesSummary.totalBeforeSalesPerBag, 2, " EGP")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Cost Breakdown Per Bag</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Review the tender total, nested products, and each bag or accessory component in one collapsed hierarchy.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <Calculator className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-[1.25rem] border border-border bg-white">
                        <div className="overflow-x-auto">
                          <div className="min-w-[650px]">
                            <div className="grid grid-cols-[minmax(260px,2.15fr)_100px_135px_155px] bg-slate-50/90 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                              {[
                                "Hierarchy",
                                "Quantity",
                                "Unit Cost",
                                "Total Cost",
                              ].map((label, index, allLabels) => (
                                <div
                                  key={label}
                                  className={`border-b border-border bg-slate-50/90 px-4 py-3.5 leading-5 ${
                                    index === allLabels.length - 1 ? "rounded-tr-[1.25rem]" : ""
                                  }`}
                                >
                                  {label}
                                </div>
                              ))}
                            </div>

                            <div className="grid grid-cols-[minmax(260px,2.15fr)_100px_135px_155px] border-b border-border bg-white">
                              <div className={rowCellClassName("px-4 py-4.5", "bg-white")}>
                                <div className="flex items-start gap-3">
                                  <ChevronDown className="mt-1 h-4 w-4 text-slate-500" />
                                  <div>
                                    <p className="text-base font-semibold text-slate-900">
                                      {tender?.tenderNumber || tenderId}
                                    </p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                      {tender?.customerName || "Tender"} · COST_BUILDUP
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className={rowCellClassName("px-4 py-4.5 text-base text-slate-700", "bg-white")}>
                                {tenderGridSummary.totalQuantity !== null
                                  ? tenderGridSummary.totalQuantity.toLocaleString()
                                  : "-"}
                              </div>
                              <div className={rowCellClassName("px-4 py-4.5", "bg-white")}>
                                <div className="flex items-center gap-2 text-base text-slate-700">
                                  <span>{formatMetric(tenderGridSummary.unitCost, 2, " EGP")}</span>
                                  <button
                                    className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-slate-50 text-[11px] font-medium text-muted-foreground transition hover:border-slate-300 hover:text-slate-700"
                                    onClick={() =>
                                      setActiveLineHelp({
                                        code: "TENDER_TOTAL",
                                        title: "Tender total",
                                        description: "This is a simple summary of how the tender total is calculated.",
                                        emptyMessage: "",
                                        summaryLabel: "Tender total",
                                        summaryDescription: undefined,
                                        total: tenderGridSummary.unitCost,
                                        totalCost: tenderGridSummary.totalCost,
                                        totalRequestedQuantity: tenderGridSummary.totalQuantity,
                                        components: [],
                                        breakdownSections: [
                                          {
                                            id: "tender-total-summary",
                                            title: "How it works",
                                            description: "We add all product totals together, then divide by the total quantity to get the unit cost.",
                                            costPerBag: tenderGridSummary.unitCost,
                                            totalCost: tenderGridSummary.totalCost,
                                            items: [
                                              {
                                                id: "tender-total-products",
                                                label: "All product total costs added together",
                                                costPerBag: null,
                                                totalCost: tenderGridSummary.totalCost,
                                                valueType: "currency",
                                              },
                                              {
                                                id: "tender-total-quantity",
                                                label: "Total quantity",
                                                costPerBag: null,
                                                totalCost: tenderGridSummary.totalQuantity,
                                                valueType: "quantity",
                                              },
                                            ],
                                          },
                                        ],
                                      })
                                    }
                                    type="button"
                                  >
                                    ?
                                  </button>
                                </div>
                              </div>
                              <div className={rowCellClassName("px-4 py-4.5 text-base font-semibold text-slate-900", "bg-white")}>
                                {formatMetric(tenderGridSummary.totalCost, 2, " EGP")}
                              </div>
                            </div>

                            {materialBreakdownGrid.map((product, productIndex) => (
                              <div key={product.productId}>
                                <div className={productIndex % 2 === 0 ? "bg-white" : "bg-slate-50/35"}>
                                  {(() => {
                                    const rowBackground = productIndex % 2 === 0 ? "bg-white" : "bg-slate-50/35";
                                    return (
                                      <div
                                        className={`grid grid-cols-[minmax(260px,2.15fr)_100px_135px_155px] border-b border-border text-left ${rowBackground}`}
                                      >
                                        <div className={rowCellClassName("px-4 py-4.5", rowBackground)}>
                                          <button
                                            aria-expanded={!collapsedProducts[product.productId]}
                                            className="flex w-full items-start gap-3 pl-8 text-left"
                                            onClick={() => toggleProductCollapse(product.productId)}
                                            type="button"
                                          >
                                            <ChevronDown
                                              className={`mt-1 h-4 w-4 text-slate-500 transition-transform ${
                                                collapsedProducts[product.productId] ? "-rotate-90" : ""
                                              }`}
                                            />
                                            <div>
                                              <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-base font-semibold text-slate-900">{product.productName}</p>
                                                {product.isOutOfSync ? (
                                                  <Badge variant="warning">Needs Sync</Badge>
                                                ) : null}
                                              </div>
                                              <p className="mt-1 text-sm text-muted-foreground">
                                                {product.productId} · {product.components.length} components
                                              </p>
                                            </div>
                                          </button>
                                        </div>
                                        <div className={rowCellClassName("px-4 py-4.5 text-base text-slate-700", rowBackground)}>
                                          {product.requestedQuantity !== null && product.requestedQuantity !== undefined
                                            ? product.requestedQuantity.toLocaleString()
                                            : "-"}
                                        </div>
                                        <div className={rowCellClassName("px-4 py-4.5 text-base text-slate-700", rowBackground)}>
                                          <div className="flex items-center gap-2">
                                            <span>{formatMetric(product.totalUnitCost, 2, " EGP")}</span>
                                            <button
                                              className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-slate-50 text-[11px] font-medium text-muted-foreground transition hover:border-slate-300 hover:text-slate-700"
                                              onClick={() =>
                                                setActiveLineHelp({
                                                  code: product.productId,
                                                  title: product.productName,
                                                  description: "This shows the material, operational, and additional costs used to build this product total.",
                                                  emptyMessage: "No component detail is available for this product yet.",
                                                  summaryLabel: "Product total",
                                                  summaryDescription: `${formatMetric(product.materialPerBag, 2, " EGP")} material cost + ${formatMetric(product.operatingPerBag, 2, " EGP")} operational cost + ${formatMetric(product.additionalPerBag, 2, " EGP")} additional cost = ${formatMetric(product.totalUnitCost, 2, " EGP per bag")}`,
                                                  total: product.totalUnitCost,
                                                  totalCost: product.totalCost,
                                                  totalRequestedQuantity: product.requestedQuantity ?? null,
                                                  components: product.components.map((component) => ({
                                                    componentId: component.componentId,
                                                    componentName: component.componentName,
                                                    requestedQuantity: component.requestedQuantity,
                                                    actualAreaPerBagM2: null,
                                                    costPerBag: component.unitCost,
                                                    recomputedTotal: component.totalCost,
                                                    sources: [],
                                                  })),
                                                  breakdownSections: [
                                                    {
                                                      id: `${product.productId}-material`,
                                                      title: "Material cost",
                                                      description: "Sum of all component material costs plus packaging for this product.",
                                                      costPerBag: product.materialPerBag,
                                                      totalCost:
                                                        product.requestedQuantity !== null &&
                                                        product.requestedQuantity !== undefined
                                                          ? product.materialPerBag * product.requestedQuantity
                                                          : null,
                                                      items: [
                                                        {
                                                          id: `${product.productId}-material-bag`,
                                                          label: "Bag cost",
                                                          costPerBag: product.bagMaterialUnitCost,
                                                          totalCost: product.bagMaterialTotalCost,
                                                        },
                                                        {
                                                          id: `${product.productId}-material-accessories`,
                                                          label: "Accessories cost",
                                                          costPerBag: product.accessoryMaterialUnitCost,
                                                          totalCost: product.accessoryMaterialTotalCost,
                                                        },
                                                        {
                                                          id: `${product.productId}-material-packaging`,
                                                          label: "Packaging",
                                                          costPerBag:
                                                            Math.max(
                                                              0,
                                                              (product.materialPerBag ?? 0) -
                                                                (product.productMaterialUnitCost ?? 0),
                                                            ),
                                                          totalCost:
                                                            product.requestedQuantity !== null &&
                                                            product.requestedQuantity !== undefined
                                                              ? Math.max(
                                                                  0,
                                                                  (product.materialPerBag ?? 0) -
                                                                    (product.productMaterialUnitCost ?? 0),
                                                                ) * product.requestedQuantity
                                                              : null,
                                                        },
                                                      ],
                                                    },
                                                    {
                                                      id: `${product.productId}-operating`,
                                                      title: "Operational cost",
                                                      description: "Factory, manufacturing cost, management overhead, and sales cost allocated to this product.",
                                                      costPerBag: product.operatingPerBag,
                                                      totalCost:
                                                        product.requestedQuantity !== null &&
                                                        product.requestedQuantity !== undefined
                                                          ? product.operatingPerBag * product.requestedQuantity
                                                          : null,
                                                      items: [
                                                        {
                                                          id: `${product.productId}-factory`,
                                                          label: "Factory overhead",
                                                          costPerBag: product.overheads?.factoryOverheadPerBag ?? null,
                                                          totalCost:
                                                            product.requestedQuantity !== null &&
                                                            product.requestedQuantity !== undefined
                                                              ? (product.overheads?.factoryOverheadPerBag ?? 0) *
                                                                product.requestedQuantity
                                                              : null,
                                                        },
                                                        {
                                                          id: `${product.productId}-manufacturing`,
                                                          label: "Manufacturing cost",
                                                          costPerBag: product.overheads?.manufacturingOverheadPerBag ?? null,
                                                          totalCost:
                                                            product.requestedQuantity !== null &&
                                                            product.requestedQuantity !== undefined
                                                              ? (product.overheads?.manufacturingOverheadPerBag ?? 0) *
                                                                product.requestedQuantity
                                                              : null,
                                                        },
                                                        {
                                                          id: `${product.productId}-management`,
                                                          label: "Management overhead",
                                                          costPerBag: product.overheads?.managementOverheadPerBag ?? null,
                                                          totalCost:
                                                            product.requestedQuantity !== null &&
                                                            product.requestedQuantity !== undefined
                                                              ? (product.overheads?.managementOverheadPerBag ?? 0) *
                                                                product.requestedQuantity
                                                              : null,
                                                        },
                                                        {
                                                          id: `${product.productId}-sales`,
                                                          label: "Sales cost",
                                                          costPerBag: Math.max(
                                                            0,
                                                            (product.operatingPerBag ?? 0) -
                                                              ((product.overheads?.factoryOverheadPerBag ?? 0) +
                                                                (product.overheads?.manufacturingOverheadPerBag ?? 0) +
                                                                (product.overheads?.managementOverheadPerBag ?? 0)),
                                                          ),
                                                          totalCost:
                                                            product.requestedQuantity !== null &&
                                                            product.requestedQuantity !== undefined
                                                              ? Math.max(
                                                                  0,
                                                                  (product.operatingPerBag ?? 0) -
                                                                    ((product.overheads?.factoryOverheadPerBag ?? 0) +
                                                                      (product.overheads?.manufacturingOverheadPerBag ?? 0) +
                                                                      (product.overheads?.managementOverheadPerBag ?? 0)),
                                                                ) * product.requestedQuantity
                                                              : null,
                                                        },
                                                      ],
                                                    },
                                                    {
                                                      id: `${product.productId}-additional`,
                                                      title: "Additional cost",
                                                      description: "Rush, transportation, and installation cost allocated to this product.",
                                                      costPerBag: product.additionalPerBag,
                                                      totalCost:
                                                        product.requestedQuantity !== null &&
                                                        product.requestedQuantity !== undefined
                                                          ? product.additionalPerBag * product.requestedQuantity
                                                          : null,
                                                      items: [
                                                        {
                                                          id: `${product.productId}-rush`,
                                                          label: "Rush / overtime",
                                                          costPerBag: currentLineValues.get("I_RUSH") ?? 0,
                                                          totalCost:
                                                            product.requestedQuantity !== null &&
                                                            product.requestedQuantity !== undefined
                                                              ? (currentLineValues.get("I_RUSH") ?? 0) *
                                                                product.requestedQuantity
                                                              : null,
                                                        },
                                                        {
                                                          id: `${product.productId}-transport`,
                                                          label: "Transportation",
                                                          costPerBag: currentLineValues.get("J") ?? 0,
                                                          totalCost:
                                                            product.requestedQuantity !== null &&
                                                            product.requestedQuantity !== undefined
                                                              ? (currentLineValues.get("J") ?? 0) * product.requestedQuantity
                                                              : null,
                                                        },
                                                        {
                                                          id: `${product.productId}-installation`,
                                                          label: "Installation",
                                                          costPerBag: currentLineValues.get("K") ?? 0,
                                                          totalCost:
                                                            product.requestedQuantity !== null &&
                                                            product.requestedQuantity !== undefined
                                                              ? (currentLineValues.get("K") ?? 0) * product.requestedQuantity
                                                              : null,
                                                        },
                                                      ],
                                                    },
                                                  ],
                                                })
                                              }
                                              type="button"
                                            >
                                              ?
                                            </button>
                                          </div>
                                        </div>
                                        <div className={rowCellClassName("px-4 py-4.5 text-base font-semibold text-slate-900", rowBackground)}>
                                          {formatMetric(product.totalCost, 2, " EGP")}
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>

                                {!collapsedProducts[product.productId] ? (
                                  <>
                                    {product.components.map((component) => (
                                      <div
                                        key={component.componentId}
                                        className="grid grid-cols-[minmax(260px,2.15fr)_100px_135px_155px] border-b border-border bg-white"
                                      >
                                        <div className={rowCellClassName("px-4 py-4", "bg-white")}>
                                          <div className="pl-12">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <p className="text-[15px] font-medium text-slate-900">{component.componentName}</p>
                                              <Badge variant="neutral">{component.componentType}</Badge>
                                            </div>
                                            <p className="mt-1 text-sm text-muted-foreground">{component.materialId}</p>
                                            <p className="mt-1 max-w-[210px] text-sm leading-5 text-muted-foreground">
                                              {component.detail}
                                            </p>
                                          </div>
                                        </div>
                                        <div className={rowCellClassName("px-4 py-4 text-base text-slate-700", "bg-white")}>
                                          {component.requestedQuantity !== null
                                            ? component.requestedQuantity.toLocaleString()
                                            : "-"}
                                        </div>
                                        <div className={rowCellClassName("px-4 py-4 text-base text-slate-700", "bg-white")}>
                                          {formatMetric(component.unitCost, 2, " EGP")}
                                        </div>
                                        <div className={rowCellClassName("px-4 py-4 text-base font-semibold text-slate-900", "bg-white")}>
                                          {formatMetric(component.totalCost, 2, " EGP")}
                                        </div>
                                      </div>
                                    ))}

                                    <div className="grid grid-cols-[minmax(260px,2.15fr)_100px_135px_155px] border-b border-border bg-slate-50/70">
                                      <div className={rowCellClassName("px-4 py-4 pl-12 text-[15px] font-semibold text-slate-900", "bg-slate-50/70")}>
                                        Product Subtotal
                                      </div>
                                      <div className={rowCellClassName("px-4 py-4 text-base text-slate-700", "bg-slate-50/70")}>
                                        {product.requestedQuantity !== null && product.requestedQuantity !== undefined
                                          ? product.requestedQuantity.toLocaleString()
                                          : "-"}
                                      </div>
                                      <div className={rowCellClassName("px-4 py-4 text-base text-slate-700", "bg-slate-50/70")}>
                                        {formatMetric(product.totalUnitCost, 2, " EGP")}
                                      </div>
                                      <div className={rowCellClassName("px-4 py-4 text-base font-semibold text-slate-900", "bg-slate-50/70")}>
                                        {formatMetric(product.totalCost, 2, " EGP")}
                                      </div>
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            ))}

                            <div className="grid grid-cols-[minmax(260px,2.15fr)_100px_135px_155px]">
                              <div className={rowCellClassName("px-4 py-4 text-[15px] font-semibold text-slate-900", "bg-slate-50/90")}>
                                Tender Total
                              </div>
                              <div className={rowCellClassName("px-4 py-4 text-base text-slate-700", "bg-slate-50/90")}>
                                {tenderGridSummary.totalQuantity !== null
                                  ? tenderGridSummary.totalQuantity.toLocaleString()
                                  : "-"}
                              </div>
                              <div className={rowCellClassName("px-4 py-4 text-base text-slate-700", "bg-slate-50/90")}>
                                {formatMetric(tenderGridSummary.unitCost, 2, " EGP")}
                              </div>
                              <div className={rowCellClassName("px-4 py-4 text-base font-semibold text-slate-900 rounded-br-[1.25rem]", "bg-slate-50/90")}>
                                {formatMetric(tenderGridSummary.totalCost, 2, " EGP")}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </section>

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

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2">
                <Button
                  onClick={() => {
                    if (!confirmDiscardUnsavedChanges(isDirty)) {
                      return;
                    }

                    navigate(`/tenders/${tenderId}/material-sourcing`);
                  }}
                  type="button"
                  variant="ghost"
                >
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
                    {saveMode === "continue" ? "Saving..." : "Next: Alternatives"}
                  </Button>
                </div>
              </div>
              </CardContent>
            </Card>

            <div className="space-y-6 xl:sticky xl:top-6">
              <section className="overflow-hidden rounded-[1.5rem] border border-blue-100 bg-gradient-to-br from-blue-600 via-blue-600 to-sky-500 text-white">
                <div className="space-y-4 p-5">
                  <div>
                    <p className="text-sm font-medium text-blue-100">Total Cost Overview</p>
                  </div>

                  <div className="rounded-2xl bg-white/10 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-blue-100">Order Total</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {formatMetric(tenderGridSummary.totalCost, 2, " EGP")}
                    </p>
                    <p className="mt-2 text-sm text-blue-100">
                      Cost / Bag: {formatMetric(tenderGridSummary.unitCost, 2, " EGP")}
                    </p>
                    <p className="mt-1 text-sm text-blue-100">
                      Quantity: {tenderGridSummary.totalQuantity !== null ? `${tenderGridSummary.totalQuantity.toLocaleString()} bags` : "Not set"}
                    </p>
                  </div>

                  {productCostCards.length ? (
                    <div className="grid gap-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-blue-100">Bag Price By Product</p>
                      {productCostCards.map((product) => (
                        <div key={product.productId} className="rounded-2xl bg-white/12 px-4 py-3 backdrop-blur-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-white">{product.productName}</p>
                                {product.isOutOfSync ? (
                                  <Badge className="bg-amber-100 text-amber-900" variant="warning">
                                    Needs Sync
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs text-blue-100">
                                {product.requestedQuantity !== null && product.requestedQuantity !== undefined
                                  ? `${product.requestedQuantity.toLocaleString()} bags`
                                  : "Quantity not set"}
                              </p>
                            </div>
                            <Badge className="bg-white/15 text-white" variant="default">
                              {product.productType}
                            </Badge>
                          </div>
                          <p className="mt-3 text-2xl font-semibold text-white">
                            {formatMetric(product.totalPerBag, 2, " EGP")}
                          </p>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-blue-100">
                            <div>
                              <p className="uppercase tracking-[0.14em]">Mat.</p>
                              <p className="mt-1 font-medium text-white">{formatMetric(product.materialPerBag, 1)}</p>
                            </div>
                            <div>
                              <p className="uppercase tracking-[0.14em]">Op.</p>
                              <p className="mt-1 font-medium text-white">{formatMetric(product.operatingPerBag, 1)}</p>
                            </div>
                            <div>
                              <p className="uppercase tracking-[0.14em]">Add.</p>
                              <p className="mt-1 font-medium text-white">{formatMetric(product.additionalPerBag, 1)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="rounded-2xl bg-white/10 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-blue-100">Input Completion</p>
                      <Badge className="bg-white/15 text-white" variant="default">
                        {costCompletion.filledLines}/{costCompletion.totalLines}
                      </Badge>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white/15">
                      <div className="h-2 rounded-full bg-white" style={{ width: `${costCompletion.percent}%` }} />
                    </div>
                    <p className="mt-2 text-sm text-blue-100">
                      {costCompletion.percent}% of editable cost inputs have values.
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-slate-900">Cost Distribution</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Visual share of material, operating, and additional cost within the total order cost.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="h-72 rounded-2xl border border-border bg-white p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={3}
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) =>
                            `${typeof value === "number" ? value.toFixed(2) : Number(value ?? 0).toFixed(2)} EGP`
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid gap-3">
                    {chartData.map((item, index) => (
                      <div key={item.name} className="rounded-2xl border border-border bg-white p-4">
                        <div className="flex items-center gap-3">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: chartColors[index % chartColors.length] }}
                          />
                          <p className="text-sm font-medium text-slate-900">{item.name}</p>
                        </div>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{item.value.toFixed(2)} EGP</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </>
      ) : null}

      <Dialog
        description={activeLineHelp?.description ?? "Calculation details"}
        onClose={() => setActiveLineHelp(null)}
        open={activeLineHelp !== null}
        size="lg"
        title={activeLineHelp ? `${activeLineHelp.title} calculation` : "Line calculation"}
      >
        {activeLineHelp ? (
          <div className="space-y-5">
            {!activeLineHelp.breakdownSections.length ? (
              <div className="rounded-2xl border border-dashed border-border bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">
                {activeLineHelp.emptyMessage}
              </div>
            ) : null}

            {activeLineHelp.breakdownSections.length ? (
              <div
                className={
                  activeLineHelp.breakdownSections.length === 1
                    ? "w-full"
                    : "grid gap-3 md:grid-cols-3"
                }
              >
                {activeLineHelp.breakdownSections.map((section) => (
                  <div key={section.id} className="rounded-2xl border border-border bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-blue-700">{section.title}</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {formatMetric(section.costPerBag, 2, " EGP / bag")}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      {section.items
                        .filter((item) => {
                          if (item.valueType === "quantity") {
                            return true;
                          }

                          const hasPerBagValue =
                            item.costPerBag !== null && Number.isFinite(item.costPerBag) && Math.abs(item.costPerBag) > 0;
                          const hasTotalValue =
                            item.totalCost !== null && Number.isFinite(item.totalCost) && Math.abs(item.totalCost) > 0;

                          return hasPerBagValue || hasTotalValue;
                        })
                        .map((item) => (
                        <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                          <span className="text-slate-700">{item.label}</span>
                          <div className="text-right">
                            {item.costPerBag !== null && Number.isFinite(item.costPerBag) ? (
                              <p className="font-medium text-slate-900">
                                {formatMetric(item.costPerBag, 2, " EGP / bag")}
                              </p>
                            ) : null}
                            <p className="text-muted-foreground">
                              {item.valueType === "quantity"
                                ? item.totalCost !== null && Number.isFinite(item.totalCost)
                                  ? item.totalCost.toLocaleString()
                                  : "Not calculated"
                                : formatMetric(item.totalCost, 2, " EGP")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-sm text-slate-700">
                      {formatMetric(section.totalCost, 2, " EGP")} total
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="rounded-2xl bg-blue-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-blue-700">{activeLineHelp.summaryLabel}</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {formatMetric(activeLineHelp.total, 2, " EGP")}
              </p>
              <p className="mt-2 text-sm text-slate-700">
                {activeLineHelp.summaryDescription ??
                  `${formatMetric(activeLineHelp.totalCost, 2, " EGP")} / ${
                    activeLineHelp.totalRequestedQuantity?.toLocaleString() ?? "Not set"
                  } = ${formatMetric(activeLineHelp.total, 2, " EGP per bag")}`}
              </p>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
};

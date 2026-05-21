import { ArrowLeft, ArrowRight, Calculator, ChevronDown, MoreHorizontal, Package, Save } from "lucide-react";
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
    description: "Factory overhead allocation pulled from the product default when available.",
    calculationBasis: "Factory overhead per bag",
    editable: true,
  },
  {
    code: "G",
    category: "Manufacturing Overhead",
    description: "Manufacturing overhead allocation pulled from the product default when available.",
    calculationBasis: "Manufacturing overhead per bag",
    editable: true,
  },
  {
    code: "G2",
    category: "Management Overhead",
    description: "Management overhead absorbed per bag.",
    calculationBasis: "Management overhead per bag",
    editable: true,
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
  },
  {
    code: "J",
    category: "Transportation",
    description: "Transport and dispatch cost loaded per bag.",
    calculationBasis: "Transportation allocation per bag",
    editable: true,
  },
  {
    code: "K",
    category: "Installation",
    description: "Installation and site support where applicable.",
    calculationBasis: "Installation allocation per bag",
    editable: true,
  },
  {
    code: "III_TOTAL",
    category: "Total Additional Cost",
    description: "Subtotal of rush, transportation, and installation cost.",
    calculationBasis: "I + J + K",
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

const formatComponentSpecification = (
  component: NonNullable<MaterialSourceSelection["componentSelections"]>[number],
) => {
  const primary = component.materialId || "Not set";
  const details = [formatRequestedUnits(component.componentName, component.requestedQuantity)];

  if (component.bagDiameterMm !== null && component.bagDiameterMm !== undefined) {
    details.push(`${component.bagDiameterMm} m`);
  }

  if (component.bagLengthMm !== null && component.bagLengthMm !== undefined) {
    details.push(`${component.bagLengthMm} m`);
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
        const customsEstimate = source.customsEstimate ?? 0;
        const freightCostPerM2Egp = materialSourcing.freightCostPerM2Egp ?? 0;
        const otherChargesPerM2Egp = materialSourcing.otherChargesPerM2Egp ?? 0;

        if (qtyUsedM2 === null || unitCostUsdPerM2 === null) {
          return total;
        }

        const landedCostPerM2Egp =
          unitCostUsdPerM2 * effectiveExchangeRate +
          freightCostPerM2Egp +
          customsEstimate +
          otherChargesPerM2Egp;

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

const buildDefaultLines = (materialLineOverrides: MaterialLineOverrides, defaults?: CostDefaults) =>
  lineDefinitions.map((line) => ({
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
  }));

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
): CostLineForm[] => {
  const defaultLines = buildDefaultLines(materialLineOverrides, defaults);
  const savedByCode = new Map((savedLines ?? []).map((line) => [line.code, line]));

  return defaultLines.map((line) => {
    const saved = savedByCode.get(line.code);
    const costPerBag =
      ["A", "B", "C"].includes(line.code)
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

const toForm = (
  payload: CostBuildUp,
  materialLineOverrides: MaterialLineOverrides,
  defaults?: CostDefaults,
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
  costLines: mergeCostLines(payload.costLines, materialLineOverrides, defaults),
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
    total: number | null;
    totalCost: number | null;
    totalRequestedQuantity: number | null;
    components: Array<{
      componentId: string;
      componentName: string;
      requestedQuantity: number | null;
      costPerBag: number | null;
      recomputedTotal: number | null;
      sources: Array<{
        sourceId: string;
        sourceName: string;
        qtyUsedM2: number | null;
        unitCostUsdPerM2: number | null;
        customsEstimate: number | null;
        freightCostPerM2Egp: number | null;
        otherChargesPerM2Egp: number | null;
        landedCostPerM2Egp: number | null;
        totalCostEgp: number | null;
      }>;
    }>;
  } | null>(null);
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
          setForm(toForm(saved, materialLineOverrides, costDefaults));
          return;
        }

        setForm({
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
          costLines: mergeCostLines(undefined, materialLineOverrides, costDefaults),
        });
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

  const calculatedLines = useMemo(() => {
    const editableByCode = new Map(
      form.costLines.map((line) => [line.code, { ...line, costPerBag: numberOrNull(line.costPerBag) }]),
    );

    const read = (code: string) => editableByCode.get(code)?.costPerBag ?? 0;
    const fabricMaterialCost = materialLineOverrides.A ?? 0;
    const ringMaterialCost = materialLineOverrides.B ?? 0;
    const threadingMaterialCost = materialLineOverrides.C ?? 0;
    const packagingMaterialCost = read("D");
    const materialCostPerBag =
      fabricMaterialCost + ringMaterialCost + threadingMaterialCost + packagingMaterialCost;
    const operatingCostPerBag = read("F") + read("G") + read("G2") + read("H");
    const additionalCostPerBag = read("I_RUSH") + read("J") + read("K");
    const totalCostPricePerBag = materialCostPerBag + operatingCostPerBag + additionalCostPerBag;
    const totalCostPriceForOrder =
      quantity !== null && Number.isFinite(quantity) ? totalCostPricePerBag * quantity : null;

    return form.costLines.map((line) => {
      let value = numberOrNull(line.costPerBag);

      if (line.code === "A") {
        value = materialLineOverrides.A;
      } else if (line.code === "B") {
        value = materialLineOverrides.B;
      } else if (line.code === "C") {
        value = materialLineOverrides.C;
      } else if (line.code === "I_TOTAL") {
        value = materialCostPerBag;
      } else if (line.code === "II_TOTAL") {
        value = operatingCostPerBag;
      } else if (line.code === "III_TOTAL") {
        value = additionalCostPerBag;
      }

      return {
        ...line,
        costPerBag: value,
        percentOfTotal:
          totalCostPricePerBag > 0 && value !== null ? (value / totalCostPricePerBag) * 100 : 0,
      };
    });
  }, [form.costLines, materialLineOverrides, quantity]);

  const totals = useMemo(() => {
    const findValue = (code: string) =>
      calculatedLines.find((line) => line.code === code)?.costPerBag ?? null;

    const totalMaterialCostPerBag = findValue("I_TOTAL");
    const totalOperatingCostPerBag = findValue("II_TOTAL");
    const totalAdditionalCostPerBag = findValue("III_TOTAL");
    const totalCostPricePerBag =
      (totalMaterialCostPerBag ?? 0) + (totalOperatingCostPerBag ?? 0) + (totalAdditionalCostPerBag ?? 0);
    const totalCostPriceForOrder =
      quantity !== null && Number.isFinite(quantity) ? totalCostPricePerBag * quantity : null;

    return {
      totalMaterialCostPerBag,
      totalOperatingCostPerBag,
      totalAdditionalCostPerBag,
      totalCostPricePerBag,
      totalCostPriceForOrder,
    };
  }, [calculatedLines, quantity]);

  const chartData = [
    { name: "Material Cost", value: totals.totalMaterialCostPerBag ?? 0 },
    { name: "Operating Cost", value: totals.totalOperatingCostPerBag ?? 0 },
    { name: "Additional Cost", value: totals.totalAdditionalCostPerBag ?? 0 },
  ];

  const sourcingBreakdown = materialSourcing?.componentSelections ?? [];

  const lineABreakdown = useMemo(() => {
    const freightCostPerM2Egp = materialSourcing?.freightCostPerM2Egp ?? 0;
    const otherChargesPerM2Egp = materialSourcing?.otherChargesPerM2Egp ?? 0;

    const components = sourcingBreakdown
      .filter((selection) => isFabricMaterialCategory(resolveMaterialCategoryForSelection(selection, materials)))
      .map((selection) => {
        const sources = selection.selectedSources.map((source) => {
          const qtyUsedM2 = source.qtyUsedM2 ?? null;
          const unitCostUsdPerM2 = source.unitCostUsdPerM2 ?? null;
          const customsEstimate = source.customsEstimate ?? 0;
          const landedCostPerM2Egp =
            unitCostUsdPerM2 !== null && effectiveExchangeRate !== null
              ? unitCostUsdPerM2 * effectiveExchangeRate + freightCostPerM2Egp + customsEstimate + otherChargesPerM2Egp
              : null;
          const totalCostEgp =
            qtyUsedM2 !== null && landedCostPerM2Egp !== null ? qtyUsedM2 * landedCostPerM2Egp : null;

          return {
            sourceId: source.sourceId,
            sourceName: source.sourceName,
            qtyUsedM2,
            unitCostUsdPerM2,
            customsEstimate,
            freightCostPerM2Egp,
            otherChargesPerM2Egp,
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

  const currentLineValues = useMemo(
    () =>
      new Map(calculatedLines.map((line) => [line.code, line.costPerBag ?? 0])),
    [calculatedLines],
  );

  const productCards = useMemo(
    () =>
      (productConfiguration?.productSnapshots ?? []).map((product) => ({
        productId: product.productId,
        productName: product.productName || "Untitled product",
        productType: product.productType,
        requestedQuantity: product.requestedQuantity,
        componentsCount: product.components.length,
        bagBodyCount: product.components.filter(
          (component) =>
            component.componentType.trim().toLowerCase() === "bag body" ||
            component.componentName.trim().toLowerCase() === "bag body",
        ).length,
        factoryOverheadPerBag: product.factoryOverheadPerBag ?? null,
        manufacturingOverheadPerBag: product.manufacturingOverheadPerBag ?? null,
        managementOverheadPerBag: product.managementOverheadPerBag ?? null,
      })),
    [productConfiguration],
  );

  const productCostCards = useMemo(
    () =>
      productCards.map((product) => {
        const sourcingLines = sourcingBreakdown.filter((selection) => selection.productId === product.productId);
        const requestedQuantity = product.requestedQuantity ?? null;
        const sourcedMaterialTotal = sourcingLines.reduce(
          (total, selection) => total + (selection.totalMaterialCostEgp ?? 0),
          0,
        );
        const sourcedMaterialCostPerBag =
          requestedQuantity && requestedQuantity > 0 ? sourcedMaterialTotal / requestedQuantity : null;

        const packagingCost = currentLineValues.get("D") ?? 0;
        const factoryOverhead = product.factoryOverheadPerBag ?? (currentLineValues.get("F") ?? 0);
        const manufacturingOverhead =
          product.manufacturingOverheadPerBag ?? (currentLineValues.get("G") ?? 0);
        const managementOverhead =
          product.managementOverheadPerBag ?? (currentLineValues.get("G2") ?? 0);
        const salesCost = currentLineValues.get("H") ?? 0;
        const rushCost = currentLineValues.get("I_RUSH") ?? 0;
        const transportationCost = currentLineValues.get("J") ?? 0;
        const installationCost = currentLineValues.get("K") ?? 0;

        const materialPerBag = (sourcedMaterialCostPerBag ?? 0) + packagingCost;
        const operatingPerBag =
          factoryOverhead + manufacturingOverhead + managementOverhead + salesCost;
        const additionalPerBag = rushCost + transportationCost + installationCost;
        const totalPerBag = materialPerBag + operatingPerBag + additionalPerBag;

        return {
          ...product,
          materialPerBag,
          operatingPerBag,
          additionalPerBag,
          totalPerBag,
        };
      }),
    [currentLineValues, productCards, sourcingBreakdown],
  );

  const breakdownSections = useMemo(
    () => [
      {
        id: "material",
        title: "Material Cost Breakdown",
        description: "Review material cost grouped by type and adjust only the manual inputs.",
        totalCode: "I_TOTAL",
        rows: calculatedLines.filter((line) => ["A", "B", "C", "D"].includes(line.code)),
      },
      {
        id: "operating",
        title: "Operating Cost Breakdown",
        description: "Labour and overhead defaults come from product master data and stay editable here.",
        totalCode: "II_TOTAL",
        rows: calculatedLines.filter((line) => ["F", "G", "G2", "H"].includes(line.code)),
      },
      {
        id: "additional",
        title: "Additional Cost Breakdown",
        description: "Use this section for rush, transportation, and installation charges that vary by order.",
        totalCode: "III_TOTAL",
        rows: calculatedLines.filter((line) => ["I_RUSH", "J", "K"].includes(line.code)),
      },
    ],
    [calculatedLines],
  );

  const materialTypeGroups = useMemo(
    () => [
      {
        id: "fabric-material",
        title: "Fabric Material",
        rows: calculatedLines.filter((line) => ["A"].includes(line.code)),
      },
      {
        id: "ring-material",
        title: "Ring Material",
        rows: calculatedLines.filter((line) => ["B"].includes(line.code)),
      },
      {
        id: "threading-material",
        title: "Threading Material",
        rows: calculatedLines.filter((line) => ["C"].includes(line.code)),
      },
      {
        id: "packaging",
        title: "Packaging",
        rows: calculatedLines.filter((line) => ["D"].includes(line.code)),
      },
    ].filter((group) => group.rows.length > 0),
    [calculatedLines],
  );

  const costCompletion = useMemo(() => {
    const editableLines = calculatedLines.filter((line) => line.editable);
    const filledLines = editableLines.filter((line) => line.costPerBag !== null).length;
    return {
      filledLines,
      totalLines: editableLines.length,
      percent:
        editableLines.length > 0 ? Math.round((filledLines / editableLines.length) * 100) : 0,
    };
  }, [calculatedLines]);

  const updateLineCost = (code: string, value: string) => {
    setForm((current) => ({
      ...current,
      costLines: current.costLines.map((line) =>
        line.code === code ? { ...line, costPerBag: value } : line,
      ),
    }));
  };

  const updateField = <K extends keyof CostBuildUpForm>(key: K, value: CostBuildUpForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

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
      costLines: calculatedLines.map((line) => ({
        code: line.code,
        category: line.category,
        description: line.description,
        calculationBasis: line.calculationBasis,
        costPerBag: line.costPerBag,
        editable: line.editable,
      })),
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
      totals,
    ],
  );

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
      const response = await api.put<CostBuildUp>(`/tenders/${tenderId}/cost-build-up`, payload);
      const nextMaterialLineOverrides = calculateMaterialLineOverrides({
        materialSourcing,
        exchangeRate,
        currencySafetyFactorPercent,
        materials,
      });
      setForm(
        toForm(
          response,
          nextMaterialLineOverrides,
          deriveCostDefaults(productConfiguration),
        ),
      );
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
      <TenderWorkflowStepper currentStep={4} tenderId={tenderId} />

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
                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Material Sourcing Detail</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          This section shows how the sourced material cost flows into the final cost price.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <Package className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="space-y-4">
                      {sourcingBreakdown.length ? (
                        sourcingBreakdown.map((component) => (
                          <div key={component.componentId} className="rounded-2xl border border-border bg-white p-4">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {component.productName} · {component.componentName}
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  Material ID: {component.materialId || "Not set"} · Requested quantity:{" "}
                                  {component.requestedQuantity?.toLocaleString() ?? "Not set"}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
                              <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                  <tr>
                                    <th className="px-4 py-3">Source</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3">Allocated Bags</th>
                                    <th className="px-4 py-3">Actual Area / Bag</th>
                                    <th className="px-4 py-3">Qty Used</th>
                                    <th className="px-4 py-3">Unit Cost</th>
                                    <th className="px-4 py-3">Total Cost</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {component.selectedSources.length ? (
                                    component.selectedSources.map((source) => (
                                      <tr key={`${component.componentId}-${source.sourceId}`} className="border-t border-border">
                                        <td className="px-4 py-3 font-medium text-slate-900">{source.sourceName}</td>
                                        <td className="px-4 py-3">{source.sourceType}</td>
                                        <td className="px-4 py-3">{source.allocatedBags?.toLocaleString() ?? "-"}</td>
                                        <td className="px-4 py-3">{formatMetric(source.actualAreaPerBagM2 ?? null, 4, " m²")}</td>
                                        <td className="px-4 py-3">{formatMetric(source.qtyUsedM2 ?? null, 4, " m²")}</td>
                                        <td className="px-4 py-3">
                                          {source.actualAreaPerBagM2 !== null
                                            ? (
                                                <div className="space-y-1">
                                                  <p>{formatMetric(source.unitCostUsdPerM2 ?? null, 3, " USD/m²")}</p>
                                                  <p className="text-xs text-muted-foreground">
                                                    {formatMetric(
                                                      source.unitCostUsdPerM2 !== null && effectiveExchangeRate !== null
                                                        ? source.unitCostUsdPerM2 * effectiveExchangeRate
                                                        : null,
                                                      2,
                                                      " EGP/m²",
                                                    )}
                                                  </p>
                                                </div>
                                              )
                                            : formatMetric(source.unitCostUsdPerM2 ?? null, 2, " EGP/bag")}
                                        </td>
                                        <td className="px-4 py-3">
                                          {source.actualAreaPerBagM2 !== null
                                            ? (
                                                <div className="space-y-1">
                                                  <p>{formatMetric(source.totalCostUsd ?? null, 2, " USD")}</p>
                                                  <p className="text-xs text-muted-foreground">
                                                    {formatMetric(
                                                      source.totalCostUsd !== null && effectiveExchangeRate !== null
                                                        ? source.totalCostUsd * effectiveExchangeRate
                                                        : null,
                                                      2,
                                                      " EGP",
                                                    )}
                                                  </p>
                                                </div>
                                              )
                                            : formatMetric(source.allocatedBags != null && source.unitCostUsdPerM2 !== null ? source.allocatedBags * source.unitCostUsdPerM2 : null, 2, " EGP")}
                                        </td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td className="px-4 py-5 text-center text-muted-foreground" colSpan={7}>
                                        No sourcing lines saved for this component yet.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-muted-foreground">
                          No material sourcing detail is available yet.
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Landed Cost Inputs</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Exchange defaults come from Tender Intake. You can override them here and the sourced fabric cost will recalculate.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <Calculator className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
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
                          onChange={(event) => updateField("currencySafetyFactorPercent", event.target.value)}
                        />
                      </label>
                      <div className="rounded-2xl border border-border bg-white px-4 py-3 text-sm text-slate-700">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          Effective Exchange Rate
                        </p>
                        <p className="mt-2 font-semibold text-slate-900">
                          {formatMetric(effectiveExchangeRate, 3)}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Tender default: {formatMetric(
                            tender?.exchangeRate !== null &&
                              tender?.exchangeRate !== undefined &&
                              tender?.currencySafetyFactorPercent !== null &&
                              tender?.currencySafetyFactorPercent !== undefined
                              ? tender.exchangeRate * (1 + tender.currencySafetyFactorPercent / 100)
                              : null,
                            3,
                          )}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border bg-white px-4 py-3 text-sm text-slate-700">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          Freight Cost / m²
                        </p>
                        <p className="mt-2 font-semibold text-slate-900">
                          {formatMetric(materialSourcing?.freightCostPerM2Egp ?? null, 2, " EGP")}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Managed in Material Sourcing & Costing.
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Cost Breakdown Per Bag</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Review the cost in business-friendly sections and adjust only the lines that need manual input.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <Calculator className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="space-y-4">
                      {breakdownSections.map((section) => {
                        const subtotal = calculatedLines.find((line) => line.code === section.totalCode)?.costPerBag ?? null;

                        return (
                          <div key={section.id} className="rounded-2xl border border-border bg-white p-4">
                            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <h4 className="text-sm font-semibold text-slate-900">{section.title}</h4>
                                <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                              </div>
                              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
                                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Subtotal / Bag</p>
                                <div className="mt-1 flex items-center justify-end gap-2">
                                  <p className="text-lg font-semibold text-slate-900">
                                    {formatMetric(subtotal, 2, " EGP")}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-3">
                              {(section.id === "material"
                                ? materialTypeGroups.flatMap((group) =>
                                    group.rows.map((line, index) => ({
                                      groupTitle: index === 0 ? group.title : null,
                                      line,
                                    })),
                                  )
                                : section.rows.map((line) => ({ groupTitle: null, line }))).map(
                                ({ groupTitle, line }) => (
                                  <div key={line.code} className="space-y-2">
                                    {groupTitle ? (
                                      <div className="px-1">
                                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                          {groupTitle}
                                        </p>
                                      </div>
                                    ) : null}
                                    <div className="grid gap-3 rounded-2xl border border-border bg-slate-50/80 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_180px_110px]">
                                      <div>
                                        <p className="text-sm font-semibold text-slate-900">{line.category}</p>
                                        <p className="mt-1 text-sm text-muted-foreground">{line.description}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Calculation Basis</p>
                                        <p className="mt-1 text-sm text-slate-700">{line.calculationBasis}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Cost / Bag</p>
                                        <div className="mt-1">
                                          {line.editable ? (
                                            <Input
                                              inputMode="decimal"
                                              value={form.costLines.find((item) => item.code === line.code)?.costPerBag ?? ""}
                                              onChange={(event) => updateLineCost(line.code, event.target.value)}
                                            />
                                          ) : (
                                            <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-medium text-slate-700">
                                              <span>
                                                {line.costPerBag === null ? "Calculated" : `${line.costPerBag.toFixed(2)} EGP`}
                                              </span>
                                              {line.code === "A" ? (
                                                <button
                                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-slate-50 text-xs font-medium text-muted-foreground transition hover:border-slate-300 hover:text-slate-700"
                                                  onClick={() =>
                                                    setActiveLineHelp({
                                                      code: line.code,
                                                      title: `${line.code} · ${line.category}`,
                                                      total: lineABreakdown.total,
                                                      totalCost: lineABreakdown.totalCost,
                                                      totalRequestedQuantity: lineABreakdown.totalRequestedQuantity,
                                                      components: lineABreakdown.components,
                                                    })
                                                  }
                                                  type="button"
                                                >
                                                  ?
                                                </button>
                                              ) : null}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <div>
                                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">% of Total</p>
                                        <p className="mt-2 text-sm font-semibold text-slate-900">
                                          {line.percentOfTotal.toFixed(1)}%
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        );
                      })}
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
                <Button onClick={() => navigate(`/tenders/${tenderId}/material-sourcing`)} type="button" variant="ghost">
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
                    <h3 className="mt-2 text-3xl font-semibold tracking-tight">
                      {formatMetric(totals.totalCostPricePerBag, 2, " EGP / bag")}
                    </h3>
                    <p className="mt-2 text-sm text-blue-100">
                      Final cost price built from sourced material, operating overhead, and order-specific charges.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    {[
                      {
                        label: "Material",
                        value: formatMetric(totals.totalMaterialCostPerBag, 2, " EGP"),
                      },
                      {
                        label: "Operating",
                        value: formatMetric(totals.totalOperatingCostPerBag, 2, " EGP"),
                      },
                      {
                        label: "Additional",
                        value: formatMetric(totals.totalAdditionalCostPerBag, 2, " EGP"),
                      },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl bg-white/12 px-4 py-4 backdrop-blur-sm">
                        <p className="text-xs uppercase tracking-[0.16em] text-blue-100">{item.label}</p>
                        <p className="mt-2 text-lg font-semibold text-white">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-[1.5rem] bg-white/8 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                    <div className="rounded-2xl bg-white/10 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-blue-100">Order Total</p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {formatMetric(totals.totalCostPriceForOrder, 2, " EGP")}
                      </p>
                      <p className="mt-2 text-sm text-blue-100">
                        Quantity: {quantity !== null ? `${quantity.toLocaleString()} bags` : "Not set"}
                      </p>
                    </div>
                    <div className="mt-4 rounded-2xl bg-white/10 px-4 py-4">
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

                  {productCostCards.length ? (
                    <div className="grid gap-3">
                      {productCostCards.map((product) => (
                        <div key={product.productId} className="rounded-2xl bg-white/12 px-4 py-3 backdrop-blur-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">{product.productName}</p>
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
                </div>
              </section>

              <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-slate-900">Cost Distribution</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Visual share of material, operating, and additional cost within the total bag price.
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
        description="This shows the actual sourcing numbers used to build line A."
        onClose={() => setActiveLineHelp(null)}
        open={activeLineHelp !== null}
        size="lg"
        title={activeLineHelp ? `${activeLineHelp.title} calculation` : "Line calculation"}
      >
        {activeLineHelp ? (
          <div className="space-y-5">
            {activeLineHelp.components.length ? (
              activeLineHelp.components.map((component) => (
                <div key={component.componentId} className="rounded-2xl border border-border bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{component.componentName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Requested quantity: {component.requestedQuantity?.toLocaleString() ?? "Not set"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Component cost / bag</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {formatMetric(component.costPerBag, 2, " EGP")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {component.sources.map((source) => (
                      <div key={source.sourceId} className="rounded-2xl border border-border bg-white p-4">
                        <p className="text-sm font-semibold text-slate-900">{source.sourceName}</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Qty used</p>
                            <p className="mt-1 text-sm text-slate-900">{formatMetric(source.qtyUsedM2, 4, " m²")}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Unit cost</p>
                            <p className="mt-1 text-sm text-slate-900">{formatMetric(source.unitCostUsdPerM2, 3, " USD/m²")}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Effective FX</p>
                            <p className="mt-1 text-sm text-slate-900">{formatMetric(effectiveExchangeRate, 3)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Freight / m²</p>
                            <p className="mt-1 text-sm text-slate-900">{formatMetric(source.freightCostPerM2Egp, 2, " EGP")}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Customs</p>
                            <p className="mt-1 text-sm text-slate-900">{formatMetric(source.customsEstimate, 2, " EGP")}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Other charges / m²</p>
                            <p className="mt-1 text-sm text-slate-900">{formatMetric(source.otherChargesPerM2Egp, 2, " EGP")}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Landed cost / m²</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">
                              {formatMetric(source.landedCostPerM2Egp, 2, " EGP/m²")}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Source total</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">
                              {formatMetric(source.totalCostEgp, 2, " EGP")}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-blue-700">Component total</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {formatMetric(component.recomputedTotal, 2, " EGP")}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {formatMetric(component.recomputedTotal, 2, " EGP")} /{" "}
                      {component.requestedQuantity?.toLocaleString() ?? "Not set"} ={" "}
                      {formatMetric(component.costPerBag, 2, " EGP per bag")}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">
                No fabric sourcing detail is available for line A yet.
              </div>
            )}

            <div className="rounded-2xl bg-blue-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-blue-700">Line A total</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {formatMetric(activeLineHelp.total, 2, " EGP")}
              </p>
              <p className="mt-2 text-sm text-slate-700">
                {formatMetric(activeLineHelp.totalCost, 2, " EGP")} /{" "}
                {activeLineHelp.totalRequestedQuantity?.toLocaleString() ?? "Not set"} ={" "}
                {formatMetric(activeLineHelp.total, 2, " EGP per bag")}
              </p>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
};

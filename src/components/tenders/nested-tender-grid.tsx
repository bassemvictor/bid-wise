import {
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Layers3,
  Package,
  Search,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import type {
  CostBuildUp,
  MaterialSourceSelection,
  PricingApproval,
  Product,
  ProductConfiguration,
  ScenarioAlternative,
  TenderRequest,
} from "../../../shared/types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";

type NestedTenderGridProps = {
  tender: TenderRequest | null;
  productConfiguration: ProductConfiguration | null;
  materialSourcing: MaterialSourceSelection | null;
  costBuildUp: CostBuildUp | null;
  alternatives: ScenarioAlternative | null;
  pricingApproval: PricingApproval | null;
};

type Summary = {
  materialCost: number | null;
  labourCost: number | null;
  manufacturingCost: number | null;
  salesCost: number | null;
  adminCost: number | null;
  otherCosts: number | null;
  totalCost: number | null;
  markupPercent: number | null;
  marginPercent: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  profitAmount: number | null;
};

type PricingChoice = {
  label: string;
  markupPercent: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
} | null;

type SourceNode = {
  id: string;
  rowType: "source";
  label: string;
  sourceType: string;
  supplierName: string;
  materialCode: string;
  unitCost: number | null;
  currency: string;
  leadTime: number | null;
  notes: string;
  costImpact: number | null;
  priceImpact: number | null;
  summary: Summary;
};

type ComponentNode = {
  id: string;
  rowType: "component";
  label: string;
  componentType: string;
  materialSpec: string;
  quantityPerProduct: number | null;
  totalQuantity: number | null;
  unitCost: number | null;
  totalCost: number | null;
  priceContributionPercent: number | null;
  summary: Summary;
  children: SourceNode[];
};

type ProductNode = {
  id: string;
  rowType: "product";
  label: string;
  productType: string;
  quantity: number | null;
  unitCost: number | null;
  totalCost: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  summary: Summary;
  children: ComponentNode[];
};

const formatNumber = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "\u2014"
    : value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });

const formatCurrency = (value: number | null | undefined, digits = 2, suffix = "EGP") =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "\u2014"
    : `${value.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })} ${suffix}`;

const formatPercent = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value) ? "\u2014" : `${formatNumber(value, 2)}%`;

const sumNullable = (values: Array<number | null | undefined>) => {
  const numeric = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  return numeric.length ? numeric.reduce((total, value) => total + value, 0) : null;
};

const divideOrNull = (numerator: number | null, denominator: number | null) =>
  numerator !== null && denominator !== null && denominator !== 0 ? numerator / denominator : null;

const marginPercent = (price: number | null, cost: number | null) =>
  price !== null && cost !== null && price !== 0 ? ((price - cost) / price) * 100 : null;

const resolvePricingChoice = (
  alternatives: ScenarioAlternative | null,
  pricingApproval: PricingApproval | null,
): PricingChoice => {
  const approvedDecision =
    pricingApproval?.decisions.find((decision) => decision.status === "approved") ?? null;
  if (approvedDecision) {
    return {
      label: approvedDecision.label,
      markupPercent: null,
      unitPrice: approvedDecision.pricePerBag,
      totalPrice: approvedDecision.totalPrice,
    };
  }

  const firstScenario = alternatives?.scenarios[0] ?? null;
  if (!firstScenario) {
    return null;
  }

  const totalCost =
    firstScenario.totalCost ??
    (alternatives?.baseCostPerBag !== null &&
    alternatives?.baseCostPerBag !== undefined &&
    alternatives?.quantity !== null &&
    alternatives?.quantity !== undefined
      ? alternatives.baseCostPerBag * alternatives.quantity
      : null);
  const markupPercent =
    totalCost !== null &&
    totalCost > 0 &&
    firstScenario.totalPrice !== null &&
    firstScenario.totalPrice !== undefined
      ? ((firstScenario.totalPrice - totalCost) / totalCost) * 100
      : null;

  return {
    label: firstScenario.label,
    markupPercent,
    unitPrice: firstScenario.pricePerBag,
    totalPrice: firstScenario.totalPrice,
  };
};

const buildSpecificationLabel = (component: Product["components"][number]) => {
  const visibleSpecifications = Object.entries(component.specifications)
    .filter(([, value]) => value !== null && value !== "")
    .slice(0, 2)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return visibleSpecifications.length ? visibleSpecifications.join(" · ") : component.material || "\u2014";
};

const summaryCards = (summary: Summary) => [
  { label: "Material", value: formatCurrency(summary.materialCost) },
  { label: "Labour", value: formatCurrency(summary.labourCost) },
  { label: "Manufacturing", value: formatCurrency(summary.manufacturingCost) },
  { label: "Sales", value: formatCurrency(summary.salesCost) },
  { label: "Admin", value: formatCurrency(summary.adminCost) },
  { label: "Other", value: formatCurrency(summary.otherCosts) },
  { label: "Total Cost", value: formatCurrency(summary.totalCost) },
  { label: "Markup %", value: formatPercent(summary.markupPercent) },
  { label: "Margin %", value: formatPercent(summary.marginPercent) },
  { label: "Unit Price", value: formatCurrency(summary.unitPrice) },
  { label: "Total Price", value: formatCurrency(summary.totalPrice) },
  { label: "Profit", value: formatCurrency(summary.profitAmount) },
];

const tableGridClassName =
  "grid grid-cols-[minmax(220px,2.2fr)_120px_150px_150px_110px_140px_140px] gap-4";
const tableMinWidthClassName = "min-w-[980px] lg:min-w-[1120px]";

export const NestedTenderGrid = ({
  tender,
  productConfiguration,
  materialSourcing,
  costBuildUp,
  alternatives,
  pricingApproval,
}: NestedTenderGridProps) => {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("tender");
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [expandedComponents, setExpandedComponents] = useState<Record<string, boolean>>({});

  const pricingChoice = useMemo(
    () => resolvePricingChoice(alternatives, pricingApproval),
    [alternatives, pricingApproval],
  );

  const costLine = (code: string) => costBuildUp?.costLines.find((line) => line.code === code)?.costPerBag ?? null;

  const tenderSummary = useMemo<Summary>(() => {
    const materialCost = costBuildUp?.totalMaterialCostPerBag ?? null;
    const labourCost = costLine("E");
    const manufacturingCost = sumNullable([costLine("F"), costLine("G")]);
    const salesCost = costLine("H");
    const adminCost = costLine("G2");
    const otherCosts = costBuildUp?.totalAdditionalCostPerBag ?? null;
    const totalCost = costBuildUp?.totalCostPriceForOrder ?? null;
    const unitPrice = pricingChoice?.unitPrice ?? null;
    const totalPrice = pricingChoice?.totalPrice ?? null;
    const profitAmount = totalPrice !== null && totalCost !== null ? totalPrice - totalCost : null;

    return {
      materialCost,
      labourCost,
      manufacturingCost,
      salesCost,
      adminCost,
      otherCosts,
      totalCost,
      markupPercent: pricingChoice?.markupPercent ?? null,
      marginPercent: marginPercent(totalPrice, totalCost),
      unitPrice,
      totalPrice,
      profitAmount,
    };
  }, [costBuildUp, pricingChoice]);

  const productNodes = useMemo<ProductNode[]>(() => {
    const productSnapshots = productConfiguration?.productSnapshots ?? [];
    const componentSelections = materialSourcing?.componentSelections ?? [];
    const tenderQuantity = productConfiguration?.quantity ?? null;
    const totalTenderCostPerBag = costBuildUp?.totalCostPricePerBag ?? null;
    const totalMaterialCostPerBag = costBuildUp?.totalMaterialCostPerBag ?? null;
    const totalTenderPricePerBag = pricingChoice?.unitPrice ?? null;
    const pricingTotalPrice = pricingChoice?.totalPrice ?? null;
    const effectiveExchangeRate = materialSourcing?.effectiveExchangeRate ?? null;
    const freightCostPerM2Egp = materialSourcing?.freightCostPerM2Egp ?? null;
    const otherChargesPerM2Egp = materialSourcing?.otherChargesPerM2Egp ?? null;
    const totalTenderTotalCost = costBuildUp?.totalCostPriceForOrder ?? null;

    return productSnapshots.map((product) => {
      const productComponents = product.components.map((component) => {
        const componentSelection = componentSelections.find((selection) => selection.componentId === component.componentId);
        const productQuantity = product.requestedQuantity ?? null;
        const quantityPerProduct =
          componentSelection?.requestedQuantity !== null &&
          componentSelection?.requestedQuantity !== undefined &&
          productQuantity !== null &&
          productQuantity !== 0
            ? componentSelection.requestedQuantity / productQuantity
            : null;
        const totalQuantity = componentSelection?.requestedQuantity ?? productQuantity;
        const totalMaterialCost = componentSelection?.totalMaterialCostEgp ?? null;
        const unitMaterialCost = divideOrNull(totalMaterialCost, productQuantity);
        const costShare =
          totalTenderCostPerBag !== null &&
          totalMaterialCostPerBag !== null &&
          totalMaterialCostPerBag !== 0 &&
          unitMaterialCost !== null
            ? unitMaterialCost / totalMaterialCostPerBag
            : null;
        const unitCost =
          totalTenderCostPerBag !== null && costShare !== null ? totalTenderCostPerBag * costShare : unitMaterialCost;
        const totalCost =
          unitCost !== null && productQuantity !== null ? unitCost * productQuantity : totalMaterialCost;
        const unitPrice =
          unitCost !== null &&
          totalTenderCostPerBag !== null &&
          totalTenderPricePerBag !== null &&
          totalTenderCostPerBag !== 0
            ? unitCost * (totalTenderPricePerBag / totalTenderCostPerBag)
            : null;
        const totalPrice = unitPrice !== null && productQuantity !== null ? unitPrice * productQuantity : null;
        const profitAmount = totalPrice !== null && totalCost !== null ? totalPrice - totalCost : null;
        const priceContributionPercent =
          totalPrice !== null && pricingTotalPrice !== null && pricingTotalPrice !== 0
            ? (totalPrice / pricingTotalPrice) * 100
            : null;

        const sourceNodes: SourceNode[] = (componentSelection?.selectedSources ?? []).map((source, sourceIndex) => {
          const supplierName = source.sourceName.split(" · ")[0] || "\u2014";
          const costImpact =
            source.qtyUsedM2 !== null &&
            ((source.sourceType === "stock" && source.landedCostEgp !== null) ||
              (source.unitCostUsdPerM2 !== null && effectiveExchangeRate !== null))
              ? source.qtyUsedM2 *
                (source.sourceType === "stock"
                  ? (source.landedCostEgp ?? 0)
                  : ((source.unitCostUsdPerM2 ?? 0) * effectiveExchangeRate!) *
                      (1 + ((source.customsPercent ?? 0) / 100)) +
                    (source.freightCostPerM2Egp ?? freightCostPerM2Egp ?? 0) +
                    (source.clearanceCostPerM2Egp ?? otherChargesPerM2Egp ?? 0))
              : null;
          const priceImpact =
            costImpact !== null &&
            totalCost !== null &&
            totalPrice !== null &&
            totalCost !== 0
              ? costImpact * (totalPrice / totalCost)
              : null;
          const sourceSummary: Summary = {
            materialCost: costImpact,
            labourCost: null,
            manufacturingCost: null,
            salesCost: null,
            adminCost: null,
            otherCosts: null,
            totalCost: costImpact,
            markupPercent:
              priceImpact !== null && costImpact !== null && costImpact !== 0
                ? ((priceImpact - costImpact) / costImpact) * 100
                : pricingChoice?.markupPercent ?? null,
            marginPercent: marginPercent(priceImpact, costImpact),
            unitPrice: priceImpact,
            totalPrice: priceImpact,
            profitAmount: priceImpact !== null && costImpact !== null ? priceImpact - costImpact : null,
          };

          return {
            id: `${component.componentId}-source-${source.sourceId}-${sourceIndex}`,
            rowType: "source",
            label: source.sourceName || `Source ${sourceIndex + 1}`,
            sourceType: source.sourceType === "stock" ? "Stock" : "Supplier",
            supplierName,
            materialCode: source.materialId ?? "\u2014",
            unitCost: source.unitCostUsdPerM2,
            currency: source.actualAreaPerBagM2 !== null ? "USD/m²" : "EGP/bag",
            leadTime: source.leadTimeDays ?? null,
            notes: "\u2014",
            costImpact,
            priceImpact,
            summary: sourceSummary,
          };
        });

        const componentSummary: Summary = {
          materialCost: totalMaterialCost,
          labourCost: null,
          manufacturingCost: null,
          salesCost: null,
          adminCost: null,
          otherCosts: null,
          totalCost,
          markupPercent: pricingChoice?.markupPercent ?? null,
          marginPercent: marginPercent(totalPrice, totalCost),
          unitPrice,
          totalPrice,
          profitAmount,
        };

        return {
          id: component.componentId,
          rowType: "component" as const,
          label: component.componentName,
          componentType: component.componentType,
          materialSpec: buildSpecificationLabel(component),
          quantityPerProduct,
          totalQuantity,
          unitCost,
          totalCost,
          priceContributionPercent,
          summary: componentSummary,
          children: sourceNodes,
        };
      });

      const quantity = product.requestedQuantity ?? null;
      const totalCost =
        quantity !== null && totalTenderTotalCost !== null && tenderQuantity !== null && tenderQuantity !== 0
          ? (quantity / tenderQuantity) * totalTenderTotalCost
          : sumNullable(productComponents.map((component) => component.summary.totalCost));
      const unitCost = divideOrNull(totalCost, quantity);
      const totalPrice =
        quantity !== null && pricingTotalPrice !== null && tenderQuantity !== null && tenderQuantity !== 0
          ? (quantity / tenderQuantity) * pricingTotalPrice
          : sumNullable(productComponents.map((component) => component.summary.totalPrice));
      const unitPrice = divideOrNull(totalPrice, quantity);
      const profitAmount = totalPrice !== null && totalCost !== null ? totalPrice - totalCost : null;
      const productSummary: Summary = {
        materialCost: sumNullable(productComponents.map((component) => component.summary.materialCost)),
        labourCost: null,
        manufacturingCost: sumNullable(productComponents.map((component) => component.summary.manufacturingCost)),
        salesCost: sumNullable(productComponents.map((component) => component.summary.salesCost)),
        adminCost: sumNullable(productComponents.map((component) => component.summary.adminCost)),
        otherCosts: sumNullable(productComponents.map((component) => component.summary.otherCosts)),
        totalCost,
        markupPercent: pricingChoice?.markupPercent ?? null,
        marginPercent: marginPercent(totalPrice, totalCost),
        unitPrice,
        totalPrice,
        profitAmount,
      };

      return {
        id: product.productId,
        rowType: "product",
        label: product.productName,
        productType: product.productType,
        quantity,
        unitCost,
        totalCost,
        unitPrice,
        totalPrice,
        summary: productSummary,
        children: productComponents,
      };
    });
  }, [costBuildUp, materialSourcing, pricingChoice, productConfiguration]);

  const allProductIds = useMemo(() => productNodes.map((product) => product.id), [productNodes]);
  const allComponentIds = useMemo(
    () => productNodes.flatMap((product) => product.children.map((component) => component.id)),
    [productNodes],
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return productNodes;
    }

    return productNodes
      .map((product) => {
        const matchingComponents = product.children
          .map((component) => ({
            ...component,
            children: component.children.filter(
              (source) =>
                source.label.toLowerCase().includes(query) ||
                source.supplierName.toLowerCase().includes(query) ||
                source.materialCode.toLowerCase().includes(query),
            ),
          }))
          .filter(
            (component) =>
              component.label.toLowerCase().includes(query) ||
              component.componentType.toLowerCase().includes(query) ||
              component.materialSpec.toLowerCase().includes(query) ||
              component.children.length > 0,
          );

        if (
          product.label.toLowerCase().includes(query) ||
          product.productType.toLowerCase().includes(query) ||
          matchingComponents.length > 0
        ) {
          return { ...product, children: matchingComponents.length ? matchingComponents : product.children };
        }

        return null;
      })
      .filter((product): product is ProductNode => Boolean(product));
  }, [productNodes, search]);

  const selectedSummary = useMemo(() => {
    if (selectedId === "tender") {
      return {
        title: tender?.tenderNumber || "Tender",
        subtitle: pricingChoice?.label ? `Pricing basis: ${pricingChoice.label}` : tender?.status || "\u2014",
        summary: tenderSummary,
      };
    }

    for (const product of productNodes) {
      if (product.id === selectedId) {
        return {
          title: product.label,
          subtitle: product.productType,
          summary: product.summary,
        };
      }

      for (const component of product.children) {
        if (component.id === selectedId) {
          return {
            title: component.label,
            subtitle: component.componentType,
            summary: component.summary,
          };
        }

        for (const source of component.children) {
          if (source.id === selectedId) {
            return {
              title: source.label,
              subtitle: source.sourceType,
              summary: source.summary,
            };
          }
        }
      }
    }

    return null;
  }, [pricingChoice, productNodes, selectedId, tender, tenderSummary]);

  if (!tender) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">
          No tender overview data is available yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Tender ID", value: tender.tenderId || "\u2014", icon: Layers3 },
              { label: "Tender Name", value: tender.internalInquiryNumber || tender.tenderNumber || "\u2014", icon: Package },
              { label: "Customer", value: tender.customerName || "\u2014", icon: CircleDollarSign },
              { label: "Status", value: tender.status || "\u2014", icon: Wrench },
              { label: "Currency", value: alternatives?.currency || pricingApproval?.currency || "EGP", icon: CircleDollarSign },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.label}>
                  <CardContent className="flex items-start justify-between gap-4 p-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{item.value}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3 text-slate-700">
                      <Icon className="h-4 w-4" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Exchange Rate", value: formatNumber(materialSourcing?.exchangeRate ?? costBuildUp?.exchangeRate, 3) },
              { label: "Total Cost", value: formatCurrency(tenderSummary.totalCost) },
              { label: "Total Price", value: formatCurrency(tenderSummary.totalPrice) },
              { label: "Margin %", value: formatPercent(tenderSummary.marginPercent) },
              { label: "Profit Amount", value: formatCurrency(tenderSummary.profitAmount) },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Nested Pricing Breakdown</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Expand tender pricing from products to components to selected sourcing lines.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => {
                    setExpandedProducts(Object.fromEntries(allProductIds.map((id) => [id, true])));
                    setExpandedComponents(Object.fromEntries(allComponentIds.map((id) => [id, true])));
                  }}>
                    Expand All
                  </Button>
                  <Button type="button" variant="outline" onClick={() => {
                    setExpandedProducts({});
                    setExpandedComponents({});
                  }}>
                    Collapse All
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-0 flex-1 sm:min-w-[260px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search products, components, suppliers, or sourcing"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <Badge variant="neutral">
                  <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
                  {filteredProducts.length} product(s)
                </Badge>
              </div>

              <div className="max-w-full overflow-x-auto rounded-[1.25rem] border border-border">
                <div className={tableMinWidthClassName}>
                <div className={`${tableGridClassName} bg-slate-50 px-4 py-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground`}>
                  <div className="whitespace-nowrap">Hierarchy</div>
                  <div className="whitespace-nowrap">Quantity</div>
                  <div className="whitespace-nowrap">Total Cost</div>
                  <div className="whitespace-nowrap">Total Price</div>
                  <div className="whitespace-nowrap">Margin %</div>
                  <div className="whitespace-nowrap">Profit</div>
                  <div className="whitespace-nowrap">Type / Detail</div>
                </div>

                <div className="divide-y divide-border bg-white">
                  <button
                    className={`${tableGridClassName} w-full px-4 py-3 text-left hover:bg-slate-50`}
                    onClick={() => setSelectedId("tender")}
                    type="button"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-slate-900">{tender.tenderNumber || tender.tenderId}</p>
                      <p className="mt-1 break-words text-sm text-muted-foreground">
                        {tender.customerName || "\u2014"} · {tender.status || "\u2014"}
                      </p>
                    </div>
                    <div className="min-w-0 whitespace-nowrap text-sm text-slate-700">{formatNumber(productConfiguration?.quantity, 0)}</div>
                    <div className="min-w-0 whitespace-nowrap text-sm font-medium text-slate-900">{formatCurrency(tenderSummary.totalCost)}</div>
                    <div className="min-w-0 whitespace-nowrap text-sm text-slate-700">{formatCurrency(tenderSummary.totalPrice)}</div>
                    <div className="min-w-0 whitespace-nowrap text-sm text-slate-700">{formatPercent(tenderSummary.marginPercent)}</div>
                    <div className="min-w-0 whitespace-nowrap text-sm text-slate-700">{formatCurrency(tenderSummary.profitAmount)}</div>
                    <div className="min-w-0 break-words text-sm text-slate-700">{pricingChoice?.label || "\u2014"}</div>
                  </button>

                  {filteredProducts.map((product) => {
                    const productExpanded = expandedProducts[product.id] ?? false;

                    return (
                      <Fragment key={product.id}>
                        <button
                          className={`${tableGridClassName} w-full bg-slate-50/50 px-4 py-3 text-left hover:bg-slate-50`}
                          onClick={() => {
                            setSelectedId(product.id);
                            setExpandedProducts((current) => ({ ...current, [product.id]: !productExpanded }));
                          }}
                          type="button"
                        >
                          <div className="flex min-w-0 items-start gap-2 pl-4">
                            {productExpanded ? (
                              <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0">
                              <p className="break-words font-semibold text-slate-900">{product.label}</p>
                              <p className="mt-1 break-words text-sm text-muted-foreground">{product.id}</p>
                            </div>
                          </div>
                          <div className="min-w-0 whitespace-nowrap text-sm text-slate-700">{formatNumber(product.quantity, 0)}</div>
                          <div className="min-w-0 whitespace-nowrap text-sm font-medium text-slate-900">{formatCurrency(product.totalCost)}</div>
                          <div className="min-w-0 whitespace-nowrap text-sm text-slate-700">{formatCurrency(product.totalPrice)}</div>
                          <div className="min-w-0 whitespace-nowrap text-sm text-slate-700">{formatPercent(product.summary.marginPercent)}</div>
                          <div className="min-w-0 whitespace-nowrap text-sm text-slate-700">{formatCurrency(product.summary.profitAmount)}</div>
                          <div className="min-w-0 break-words text-sm text-slate-700">{product.productType}</div>
                        </button>

                        {productExpanded ? (
                          <>
                            {product.children.map((component) => {
                              const componentExpanded = expandedComponents[component.id] ?? false;
                              return (
                                <Fragment key={component.id}>
                                  <button
                                    className={`${tableGridClassName} w-full px-4 py-3 text-left hover:bg-slate-50`}
                                    onClick={() => {
                                      setSelectedId(component.id);
                                      setExpandedComponents((current) => ({
                                        ...current,
                                        [component.id]: !componentExpanded,
                                      }));
                                    }}
                                    type="button"
                                  >
                                    <div className="flex items-start gap-2 pl-12">
                                      {component.children.length ? (
                                        componentExpanded ? (
                                          <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                                        ) : (
                                          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                                        )
                                      ) : (
                                        <span className="mt-1 h-4 w-4 shrink-0" />
                                      )}
                                      <div>
                                        <p className="font-medium text-slate-900">{component.label}</p>
                                        <p className="mt-1 text-sm text-muted-foreground">{component.materialSpec}</p>
                                      </div>
                                    </div>
                                    <div className="text-sm text-slate-700">{formatNumber(component.totalQuantity, 0)}</div>
                                    <div className="text-sm font-medium text-slate-900">{formatCurrency(component.totalCost)}</div>
                                    <div className="text-sm text-slate-700">{formatCurrency(component.summary.totalPrice)}</div>
                                    <div className="text-sm text-slate-700">{formatPercent(component.summary.marginPercent)}</div>
                                    <div className="text-sm text-slate-700">{formatCurrency(component.summary.profitAmount)}</div>
                                    <div className="text-sm text-slate-700">{component.componentType}</div>
                                  </button>

                                  {componentExpanded ? (
                                    <>
                                      {component.children.map((source) => (
                                        <button
                                          key={source.id}
                                          className={`${tableGridClassName} w-full bg-slate-50/30 px-4 py-3 text-left hover:bg-slate-50`}
                                          onClick={() => setSelectedId(source.id)}
                                          type="button"
                                        >
                                          <div className="pl-20">
                                            <p className="font-medium text-slate-900">{source.label}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">{source.supplierName}</p>
                                          </div>
                                          <div className="text-sm text-slate-700">{formatNumber(source.leadTime, 0)}</div>
                                          <div className="text-sm font-medium text-slate-900">{formatCurrency(source.costImpact)}</div>
                                          <div className="text-sm text-slate-700">{formatCurrency(source.priceImpact)}</div>
                                          <div className="text-sm text-slate-700">{formatPercent(source.summary.marginPercent)}</div>
                                          <div className="text-sm text-slate-700">{formatCurrency(source.summary.profitAmount)}</div>
                                          <div className="text-sm text-slate-700">{source.sourceType}</div>
                                        </button>
                                      ))}
                                      <div className={`${tableGridClassName} border-t border-dashed border-border bg-slate-50 px-4 py-3 text-sm`}>
                                        <div className="pl-12 font-medium text-slate-900">Component Subtotal</div>
                                        <div />
                                        <div className="font-medium text-slate-900">{formatCurrency(component.summary.totalCost)}</div>
                                        <div className="text-slate-700">{formatCurrency(component.summary.totalPrice)}</div>
                                        <div className="text-slate-700">{formatPercent(component.summary.marginPercent)}</div>
                                        <div className="text-slate-700">{formatCurrency(component.summary.profitAmount)}</div>
                                        <div className="text-slate-700">{formatPercent(component.priceContributionPercent)}</div>
                                      </div>
                                    </>
                                  ) : null}
                                </Fragment>
                              );
                            })}
                            <div className={`${tableGridClassName} border-t border-border bg-slate-50 px-4 py-3 text-sm`}>
                              <div className="pl-4 font-semibold text-slate-900">Product Subtotal</div>
                              <div className="text-slate-700">{formatNumber(product.quantity, 0)}</div>
                              <div className="font-semibold text-slate-900">{formatCurrency(product.totalCost)}</div>
                              <div className="text-slate-700">{formatCurrency(product.totalPrice)}</div>
                              <div className="text-slate-700">{formatPercent(product.summary.marginPercent)}</div>
                              <div className="text-slate-700">{formatCurrency(product.summary.profitAmount)}</div>
                              <div className="text-slate-700">{product.productType}</div>
                            </div>
                          </>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{selectedSummary?.title || "Pricing Summary"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{selectedSummary?.subtitle || "Select a row to inspect rollups."}</p>
              </div>
              <div className="grid gap-3">
                {summaryCards(selectedSummary?.summary ?? tenderSummary).map((item) => (
                  <div key={item.label} className="rounded-2xl border border-border bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

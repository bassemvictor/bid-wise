import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type {
  Accessory,
  Material,
  Product,
  ProductConfiguration,
  ProductComponentAccessorySnapshot,
  TenderRequest,
} from "../../shared/types";
import { TenderWorkflowStepper } from "../components/tenders/tender-workflow-stepper";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { api, ApiError, isApiConfigured } from "../lib/api";
import {
  confirmDiscardUnsavedChanges,
  useUnsavedChangesWarning,
} from "../lib/use-unsaved-changes";

type SpecificationFormRow = {
  key: string;
  value: string;
};

type ProductSnapshotComponentForm = {
  componentId: string;
  componentName: string;
  componentType: string;
  material: string;
  accessoryId: string;
  accessoryPricingItems: SpecificationFormRow[];
  accessoryTotalPricePerBagEgp: string;
  diameter: string;
  length: string;
  seamAllowanceMm: string;
  topBottomAllowanceMm: string;
  specificationRows: SpecificationFormRow[];
};

type ProductSnapshotForm = {
  productId: string;
  tenantId: string;
  productName: string;
  productType: Product["productType"];
  requestedQuantity: string;
  factoryOverheadPerBag: string;
  manufacturingOverheadPerBag: string;
  managementOverheadPerBag: string;
  active: boolean;
  components: ProductSnapshotComponentForm[];
};

type ProductConfigurationForm = Omit<
  ProductConfiguration,
  | "entityType"
  | "createdAt"
  | "updatedAt"
  | "quantity"
  | "bagDiameterMm"
  | "bagLengthMm"
  | "seamAllowanceMm"
  | "topBottomAllowanceMm"
  | "wearStripHeightMm"
  | "bagsPerCarton"
  | "productSnapshots"
> & {
  quantity: string;
  bagDiameterMm: string;
  bagLengthMm: string;
  seamAllowanceMm: string;
  topBottomAllowanceMm: string;
  wearStripHeightMm: string;
  bagsPerCarton: string;
  productSnapshots: ProductSnapshotForm[];
};

type ComponentDrawerState = {
  mode: "add" | "edit";
  productIndex: number;
  componentIndex: number | null;
  value: ProductSnapshotComponentForm;
};

const componentTypeOptions = ["Bag", "Accessories", "Other"] as const;
type ComponentTypeOption = (typeof componentTypeOptions)[number];

const getMaterialCategoryForComponentType = (componentType: string): Material["category"] | null => {
  switch (componentType) {
    case "Bag":
      return "Fabric Material";
    case "Thread":
      return "Threading Material";
    case "Ring":
      return "Ring Material";
    default:
      return null;
  }
};

const getMaterialPlaceholderForComponentType = (componentType: string) => {
  switch (componentType) {
    case "Bag":
      return "Select fabric material";
    case "Accessories":
      return "Select accessory";
    case "Thread":
      return "Select threading material";
    case "Ring":
      return "Select ring material";
    default:
      return "Select material";
  }
};

const initialForm = (tenderId: string): ProductConfigurationForm => ({
  tenantId: "alimex-demo",
  tenderId,
  productConfigId: "base",
  selectedProductIds: [],
  productSnapshots: [],
  productType: "Filter Bag",
  quantity: "",
  bagDiameterMm: "",
  bagLengthMm: "",
  seamAllowanceMm: "",
  topBottomAllowanceMm: "",
  topDesign: "",
  bottomDesign: "",
  seamType: "",
  includeWearStrip: false,
  wearStripHeightMm: "",
  mainFabricMaterialId: "",
  accessoriesMaterialId: "",
  threadMaterialId: "",
  packagingType: "",
  bagsPerCarton: "",
  packagingNotes: "",
});

const numberOrNull = (value: string) => {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toMillimeterInputValue = (value: string | number | boolean | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }

  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2).replace(/\.?0+$/, "");
};

const numberOrNullMillimeterInput = (value: string) => {
  const parsed = numberOrNull(value);
  return parsed;
};

const formatAccessoryTotal = (value: number) =>
  value.toFixed(2).replace(/\.?0+$/, "");

const computeAccessoryTotalPrice = (rows: SpecificationFormRow[]) =>
  rows.reduce((total, row) => {
    const parsed = Number(row.value.trim());
    return Number.isFinite(parsed) ? total + parsed : total;
  }, 0);

const resolveAccessoryId = (
  component: Pick<ProductSnapshotComponentForm, "accessoryId" | "material">,
  accessories: Accessory[],
) => {
  const directMatch = accessories.find(
    (accessory) => accessory.accessoryId === component.accessoryId,
  );

  if (directMatch) {
    return directMatch.accessoryId;
  }

  const nameMatch = accessories.find(
    (accessory) =>
      accessory.accessoryName === component.material ||
      accessory.accessoryName === component.accessoryId,
  );

  return nameMatch?.accessoryId ?? "";
};

const createComponentForm = (
  seed?: Partial<ProductSnapshotComponentForm>,
): ProductSnapshotComponentForm => ({
  componentId: seed?.componentId ?? crypto.randomUUID(),
  componentName: seed?.componentName ?? "",
  componentType: seed?.componentType ?? "Bag",
  material: seed?.material ?? "",
  accessoryId: seed?.accessoryId ?? "",
  accessoryPricingItems: seed?.accessoryPricingItems ?? [],
  accessoryTotalPricePerBagEgp: seed?.accessoryTotalPricePerBagEgp ?? "",
  diameter: seed?.diameter ?? "",
  length: seed?.length ?? "",
  seamAllowanceMm: seed?.seamAllowanceMm ?? "",
  topBottomAllowanceMm: seed?.topBottomAllowanceMm ?? "",
  specificationRows: seed?.specificationRows ?? [],
});

const createComponentFromType = (componentType: ComponentTypeOption = "Bag") =>
  createComponentForm({
    componentType,
    componentName: componentType === "Other" ? "" : componentType,
  });

const isBagBody = (component: ProductSnapshotComponentForm) =>
  component.componentType.trim().toLowerCase().includes("bag") ||
  component.componentName.trim().toLowerCase().includes("bag") ||
  component.componentType.trim().toLowerCase().includes("bag body") ||
  component.componentName.trim().toLowerCase().includes("bag body");

const specificationsToRows = (
  specifications: Product["components"][number]["specifications"],
) =>
  Object.entries(specifications)
    .filter(
      ([key]) =>
        key !== "diameter" &&
        key !== "length" &&
        key !== "seamAllowanceMm" &&
        key !== "topBottomAllowanceMm",
    )
    .map(([key, value]) => ({
      key,
      value: value === null ? "" : String(value),
    }));

const toSnapshotComponentForm = (
  component: Product["components"][number],
): ProductSnapshotComponentForm => ({
  componentId: component.componentId,
  componentName: component.componentName,
  componentType: component.componentType,
  material: component.material,
  accessoryId: component.accessorySnapshot?.accessoryId ?? "",
  accessoryPricingItems:
    component.accessorySnapshot?.pricingItems.map((item) => ({
      key: item.key,
      value: item.price?.toString() ?? "",
    })) ?? [],
  accessoryTotalPricePerBagEgp:
    component.accessorySnapshot?.totalPricePerBagEgp?.toString() ?? "",
  diameter:
    component.specifications.diameter === null ||
    component.specifications.diameter === undefined
      ? ""
      : toMillimeterInputValue(component.specifications.diameter),
  length:
    component.specifications.length === null ||
    component.specifications.length === undefined
      ? ""
      : toMillimeterInputValue(component.specifications.length),
  seamAllowanceMm:
    component.specifications.seamAllowanceMm === null ||
    component.specifications.seamAllowanceMm === undefined
      ? ""
      : toMillimeterInputValue(component.specifications.seamAllowanceMm),
  topBottomAllowanceMm:
    component.specifications.topBottomAllowanceMm === null ||
    component.specifications.topBottomAllowanceMm === undefined
      ? ""
      : toMillimeterInputValue(component.specifications.topBottomAllowanceMm),
  specificationRows: specificationsToRows(component.specifications),
});

const toSnapshotForm = (product: Product): ProductSnapshotForm => ({
  productId: product.productId,
  tenantId: product.tenantId,
  productName: product.productName,
  productType: product.productType,
  requestedQuantity:
    product.requestedQuantity === null || product.requestedQuantity === undefined
      ? ""
      : String(product.requestedQuantity),
  factoryOverheadPerBag:
    product.factoryOverheadPerBag === null ||
    product.factoryOverheadPerBag === undefined
      ? ""
      : String(product.factoryOverheadPerBag),
  manufacturingOverheadPerBag:
    product.manufacturingOverheadPerBag === null ||
    product.manufacturingOverheadPerBag === undefined
      ? ""
      : String(product.manufacturingOverheadPerBag),
  managementOverheadPerBag:
    product.managementOverheadPerBag === null ||
    product.managementOverheadPerBag === undefined
      ? ""
      : String(product.managementOverheadPerBag),
  active: product.active,
  components: product.components.map(toSnapshotComponentForm),
});

const buildSnapshotProduct = (product: ProductSnapshotForm): Product => {
  const components = product.components.map((component) => {
    const specifications = Object.fromEntries(
      component.specificationRows
        .filter((row) => row.key.trim())
        .map((row) => {
          const trimmedValue = row.value.trim();
          const numericValue = trimmedValue === "" ? null : Number(trimmedValue);
          return [
            row.key.trim(),
            trimmedValue === ""
              ? null
              : Number.isFinite(numericValue)
                ? numericValue
                : trimmedValue,
          ];
        }),
    ) as Record<string, string | number | boolean | null>;

    if (isBagBody(component)) {
      specifications.diameter = numberOrNullMillimeterInput(component.diameter);
      specifications.length = numberOrNullMillimeterInput(component.length);
      specifications.seamAllowanceMm = numberOrNullMillimeterInput(component.seamAllowanceMm);
      specifications.topBottomAllowanceMm = numberOrNullMillimeterInput(component.topBottomAllowanceMm);
    }

    return {
      componentId: component.componentId,
      componentName: component.componentName.trim(),
      componentType: component.componentType.trim(),
      material: component.material.trim(),
      specifications,
      accessorySnapshot:
        component.componentType === "Accessories"
          ? ({
              accessoryId: component.accessoryId,
              accessoryName: component.material.trim(),
              pricingItems: component.accessoryPricingItems
                .filter((row) => row.key.trim() || row.value.trim())
                .map((row) => ({
                  key: row.key.trim(),
                  price: row.value.trim() === "" ? null : Number(row.value),
                })),
              totalPricePerBagEgp:
                component.accessoryTotalPricePerBagEgp.trim() === ""
                  ? null
                  : Number(component.accessoryTotalPricePerBagEgp),
            } satisfies ProductComponentAccessorySnapshot)
          : null,
    };
  });

  return {
    entityType: "PRODUCT",
    tenantId: product.tenantId,
    productId: product.productId,
    productName: product.productName.trim(),
    productType: product.productType,
    requestedQuantity: numberOrNull(product.requestedQuantity),
    factoryOverheadPerBag: numberOrNull(product.factoryOverheadPerBag),
    manufacturingOverheadPerBag: numberOrNull(product.manufacturingOverheadPerBag),
    managementOverheadPerBag: numberOrNull(product.managementOverheadPerBag),
    components,
    active: product.active,
    createdAt: "",
    updatedAt: "",
  };
};

const normalizeMaterialReference = (value: string, materials: Material[]) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const match = materials.find(
    (material) => material.materialId === trimmed || material.materialName === trimmed,
  );

  return match?.materialId ?? trimmed;
};

const resolveMaterialLabel = (value: string, materials: Material[]) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const match = materials.find(
    (material) => material.materialId === trimmed || material.materialName === trimmed,
  );

  return match?.materialName ?? trimmed;
};

const applyDerivedSnapshotValues = (
  current: ProductConfigurationForm,
  snapshots: ProductSnapshotForm[],
  materials: Material[],
): ProductConfigurationForm => {
  const allComponents = snapshots.flatMap((product) => product.components);
  const bagBody = allComponents.find(isBagBody);
  const accessory = allComponents.find(
    (component) => component.componentType === "Accessories",
  );
  const ring = allComponents.find((component) => component.componentType === "Ring");
  const thread = allComponents.find((component) => component.componentType === "Thread");
  const totalRequestedQuantity = snapshots.reduce((total, product) => {
    const parsed = numberOrNull(product.requestedQuantity);
    return parsed === null ? total : total + parsed;
  }, 0);

  return {
    ...current,
    selectedProductIds: snapshots.map((product) => product.productId),
    productSnapshots: snapshots,
    productType: snapshots[0]?.productType ?? "Filter Bag",
    quantity: totalRequestedQuantity > 0 ? String(totalRequestedQuantity) : "",
    bagDiameterMm: bagBody?.diameter ?? "",
    bagLengthMm: bagBody?.length ?? "",
    seamAllowanceMm: bagBody?.seamAllowanceMm ?? "",
    topBottomAllowanceMm: bagBody?.topBottomAllowanceMm ?? "",
    mainFabricMaterialId: bagBody
      ? normalizeMaterialReference(bagBody.material, materials)
      : "",
    accessoriesMaterialId: accessory?.accessoryId
      ? accessory.accessoryId
      : ring
        ? normalizeMaterialReference(ring.material, materials)
      : "",
    threadMaterialId: thread
      ? normalizeMaterialReference(thread.material, materials)
      : "",
  };
};

const toForm = (config: ProductConfiguration): ProductConfigurationForm => ({
  tenantId: config.tenantId,
  tenderId: config.tenderId,
  productConfigId: config.productConfigId,
  selectedProductIds: config.selectedProductIds ?? [],
  productSnapshots: (config.productSnapshots ?? []).map((product, index, allProducts) => {
    const snapshot = toSnapshotForm(product);

    if (
      snapshot.requestedQuantity === "" &&
      config.quantity !== null &&
      config.quantity !== undefined &&
      allProducts.length === 1
    ) {
      return { ...snapshot, requestedQuantity: String(config.quantity) };
    }

    return snapshot;
  }),
  productType: config.productType,
  quantity: config.quantity?.toString() ?? "",
  bagDiameterMm: toMillimeterInputValue(config.bagDiameterMm),
  bagLengthMm: toMillimeterInputValue(config.bagLengthMm),
  seamAllowanceMm: toMillimeterInputValue(config.seamAllowanceMm),
  topBottomAllowanceMm: toMillimeterInputValue(config.topBottomAllowanceMm),
  topDesign: config.topDesign,
  bottomDesign: config.bottomDesign,
  seamType: config.seamType,
  includeWearStrip: config.includeWearStrip,
  wearStripHeightMm: config.wearStripHeightMm?.toString() ?? "",
  mainFabricMaterialId: config.mainFabricMaterialId,
  accessoriesMaterialId: config.accessoriesMaterialId,
  threadMaterialId: config.threadMaterialId,
  packagingType: config.packagingType,
  bagsPerCarton: config.bagsPerCarton?.toString() ?? "",
  packagingNotes: config.packagingNotes ?? "",
});

const formatDimension = (label: string, value: string) =>
  value.trim() ? `${label} ${Number(value).toFixed(0)} mm` : "";

const getKeyDimensions = (component: ProductSnapshotComponentForm) => {
  const values = [
    formatDimension("Ø", component.diameter),
    formatDimension("L", component.length),
  ].filter(Boolean);
  return values.length ? values.join(" • ") : "-";
};

const ProductComponentDrawer = ({
  materials,
  accessories,
  onClose,
  onSave,
  state,
}: {
  materials: Material[];
  accessories: Accessory[];
  onClose: () => void;
  onSave: (
    productIndex: number,
    mode: "add" | "edit",
    componentIndex: number | null,
    value: ProductSnapshotComponentForm,
  ) => void;
  state: ComponentDrawerState | null;
}) => {
  const [draft, setDraft] = useState<ProductSnapshotComponentForm>(
    state?.value ?? createComponentFromType("Bag"),
  );

  useEffect(() => {
    if (state) {
      setDraft((current) => {
        const nextValue = createComponentForm(state.value);

        if (nextValue.componentType !== "Accessories") {
          return nextValue;
        }

        const resolvedAccessoryId = resolveAccessoryId(nextValue, accessories);
        const accessory = accessories.find(
          (item) => item.accessoryId === resolvedAccessoryId,
        );
        const nextRows =
          nextValue.accessoryPricingItems.length > 0
            ? nextValue.accessoryPricingItems
            : accessory?.pricingItems.map((item) => ({
                key: item.key,
                value: item.price?.toString() ?? "",
              })) ?? [];

        return {
          ...nextValue,
          accessoryId: resolvedAccessoryId,
          material: nextValue.material || accessory?.accessoryName || "",
          accessoryPricingItems: nextRows,
          accessoryTotalPricePerBagEgp: formatAccessoryTotal(
            computeAccessoryTotalPrice(nextRows),
          ),
        };
      });
    }
  }, [accessories, state]);

  if (!state) {
    return null;
  }

  const selectedMaterialCategory = getMaterialCategoryForComponentType(draft.componentType);
  const availableMaterials = selectedMaterialCategory
    ? materials.filter((material) => material.category === selectedMaterialCategory)
    : materials;
  const selectableComponentTypeOptions = componentTypeOptions.includes(
    draft.componentType as ComponentTypeOption,
  )
    ? componentTypeOptions
    : [draft.componentType, ...componentTypeOptions];

  const addAccessoryPricingRow = () => {
    setDraft((current) => ({
      ...current,
      accessoryPricingItems: [...current.accessoryPricingItems, { key: "", value: "" }],
    }));
  };

  const updateAccessoryPricingRow = (
    rowIndex: number,
    patch: Partial<SpecificationFormRow>,
  ) => {
    setDraft((current) => {
      const nextRows = current.accessoryPricingItems.map((row, currentRowIndex) =>
        currentRowIndex === rowIndex ? { ...row, ...patch } : row,
      );

      return {
        ...current,
        accessoryPricingItems: nextRows,
        accessoryTotalPricePerBagEgp: formatAccessoryTotal(
          computeAccessoryTotalPrice(nextRows),
        ),
      };
    });
  };

  const removeAccessoryPricingRow = (rowIndex: number) => {
    setDraft((current) => {
      const nextRows = current.accessoryPricingItems.filter(
        (_, currentRowIndex) => currentRowIndex !== rowIndex,
      );

      return {
        ...current,
        accessoryPricingItems: nextRows,
        accessoryTotalPricePerBagEgp: formatAccessoryTotal(
          computeAccessoryTotalPrice(nextRows),
        ),
      };
    });
  };

  const addSpecificationRow = () => {
    setDraft((current) => ({
      ...current,
      specificationRows: [...current.specificationRows, { key: "", value: "" }],
    }));
  };

  const updateSpecificationRow = (
    rowIndex: number,
    patch: Partial<SpecificationFormRow>,
  ) => {
    setDraft((current) => ({
      ...current,
      specificationRows: current.specificationRows.map((row, currentRowIndex) =>
        currentRowIndex === rowIndex ? { ...row, ...patch } : row,
      ),
    }));
  };

  const removeSpecificationRow = (rowIndex: number) => {
    setDraft((current) => ({
      ...current,
      specificationRows: current.specificationRows.filter(
        (_, currentRowIndex) => currentRowIndex !== rowIndex,
      ),
    }));
  };

  const save = () => {
    if (!draft.componentName.trim()) {
      return;
    }

    const resolvedAccessoryId =
      draft.componentType === "Accessories"
        ? resolveAccessoryId(draft, accessories)
        : "";

    onSave(state.productIndex, state.mode, state.componentIndex, {
      ...draft,
      accessoryId: resolvedAccessoryId,
      accessoryTotalPricePerBagEgp:
        draft.componentType === "Accessories"
          ? formatAccessoryTotal(computeAccessoryTotalPrice(draft.accessoryPricingItems))
          : draft.accessoryTotalPricePerBagEgp,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/30">
      <button
        aria-label="Close component drawer overlay"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <aside className="relative z-10 flex h-full w-full flex-col border-l border-border bg-white shadow-2xl sm:max-w-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5 sm:py-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {state.mode === "add" ? "Add Component" : "Edit Component"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {draft.componentType || "Select a component type"}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
                Component Name
                <Input
                  value={draft.componentName}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, componentName: event.target.value }))
                  }
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Component Type
                <Select
                  value={draft.componentType}
                  onChange={(event) => {
                    const nextType = event.target.value as ComponentTypeOption;
                    setDraft((current) => ({
                      ...current,
                      componentType: nextType,
                      componentName:
                        current.componentName.trim() === "" ||
                        current.componentName === current.componentType
                          ? nextType === "Other"
                            ? ""
                            : nextType
                          : current.componentName,
                      material:
                        nextType === "Accessories"
                          ? current.material
                          : (() => {
                              const nextCategory = getMaterialCategoryForComponentType(nextType);
                              const normalizedMaterialId = normalizeMaterialReference(
                                current.material,
                                materials,
                              );

                              if (!normalizedMaterialId || !nextCategory) {
                                return "";
                              }

                              return materials.some(
                                (material) =>
                                  material.materialId === normalizedMaterialId &&
                                  material.category === nextCategory,
                              )
                                ? normalizedMaterialId
                                : "";
                            })(),
                      accessoryId: nextType === "Accessories" ? current.accessoryId : "",
                      accessoryPricingItems:
                        nextType === "Accessories" ? current.accessoryPricingItems : [],
                      accessoryTotalPricePerBagEgp:
                        nextType === "Accessories"
                          ? formatAccessoryTotal(
                              computeAccessoryTotalPrice(current.accessoryPricingItems),
                            )
                          : "",
                    }));
                  }}
                >
                  {selectableComponentTypeOptions.map((componentType) => (
                    <option key={componentType} value={componentType}>
                      {componentType}
                    </option>
                  ))}
                </Select>
              </label>
              {draft.componentType === "Accessories" ? (
                <>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Accessory
                    <Select
                      value={resolveAccessoryId(draft, accessories)}
                      onChange={(event) => {
                        const nextAccessory =
                          accessories.find(
                            (accessory) => accessory.accessoryId === event.target.value,
                          ) ?? null;

                        setDraft((current) => {
                          const nextRows =
                            nextAccessory?.pricingItems.map((item) => ({
                              key: item.key,
                              value: item.price?.toString() ?? "",
                            })) ?? [];

                          return {
                            ...current,
                            accessoryId: event.target.value,
                            material: nextAccessory?.accessoryName ?? "",
                            componentName:
                              current.componentName.trim() === "" ||
                              current.componentName === "Accessories"
                                ? nextAccessory?.accessoryName ?? current.componentName
                                : current.componentName,
                            accessoryPricingItems: nextRows,
                            accessoryTotalPricePerBagEgp: formatAccessoryTotal(
                              computeAccessoryTotalPrice(nextRows),
                            ),
                          };
                        });
                      }}
                    >
                      <option value="">
                        {getMaterialPlaceholderForComponentType(draft.componentType)}
                      </option>
                      {accessories.map((accessory) => (
                        <option key={accessory.accessoryId} value={accessory.accessoryId}>
                          {accessory.accessoryName}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
                    Total Price Per Bag (EGP)
                    <Input
                      inputMode="decimal"
                      value={draft.accessoryTotalPricePerBagEgp}
                      readOnly
                    />
                  </label>
                  <div className="space-y-3 sm:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-700">
                        Accessory Pricing Snapshot
                      </p>
                      <Button onClick={addAccessoryPricingRow} type="button" variant="outline">
                        <Plus className="h-4 w-4" />
                        Add Item
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {draft.accessoryPricingItems.length ? (
                        draft.accessoryPricingItems.map((row, rowIndex) => (
                          <div
                            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)_auto]"
                            key={`${draft.componentId}-accessory-${rowIndex}`}
                          >
                            <Input
                              placeholder="Type / Category"
                              value={row.key}
                              onChange={(event) =>
                                updateAccessoryPricingRow(rowIndex, {
                                  key: event.target.value,
                                })
                              }
                            />
                            <Input
                              inputMode="decimal"
                              placeholder="Price"
                              value={row.value}
                              onChange={(event) =>
                                updateAccessoryPricingRow(rowIndex, {
                                  value: event.target.value,
                                })
                              }
                            />
                            <Button
                              onClick={() => removeAccessoryPricingRow(rowIndex)}
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No accessory pricing rows loaded yet.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Material
                    <Select
                      value={normalizeMaterialReference(draft.material, materials)}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, material: event.target.value }))
                      }
                    >
                      <option value="">
                        {getMaterialPlaceholderForComponentType(draft.componentType)}
                      </option>
                      {availableMaterials.map((material) => (
                        <option key={material.materialId} value={material.materialId}>
                          {material.materialName}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Diameter (mm)
                    <Input
                      inputMode="decimal"
                      value={draft.diameter}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, diameter: event.target.value }))
                      }
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Length (mm)
                    <Input
                      inputMode="decimal"
                      value={draft.length}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, length: event.target.value }))
                      }
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Seam Allowance (mm)
                    <Input
                      inputMode="decimal"
                      value={draft.seamAllowanceMm}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          seamAllowanceMm: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Top / Bottom Allowance (mm)
                    <Input
                      inputMode="decimal"
                      value={draft.topBottomAllowanceMm}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          topBottomAllowanceMm: event.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              )}
            </div>

            <details className="rounded-[1.15rem] border border-border bg-slate-50/70">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900">
                Advanced Details
              </summary>
              <div className="border-t border-border px-4 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Add less common component details as key-value fields.
                  </p>
                  <Button onClick={addSpecificationRow} type="button" variant="outline">
                    <Plus className="h-4 w-4" />
                    Add Field
                  </Button>
                </div>
                <div className="space-y-3">
                  {draft.specificationRows.length ? (
                    draft.specificationRows.map((row, rowIndex) => (
                      <div
                        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                        key={`${draft.componentId}-${rowIndex}`}
                      >
                        <Input
                          placeholder="Field name"
                          value={row.key}
                          onChange={(event) =>
                            updateSpecificationRow(rowIndex, { key: event.target.value })
                          }
                        />
                        <Input
                          placeholder="Value"
                          value={row.value}
                          onChange={(event) =>
                            updateSpecificationRow(rowIndex, { value: event.target.value })
                          }
                        />
                        <Button
                          onClick={() => removeSpecificationRow(rowIndex)}
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No advanced fields added yet.
                    </p>
                  )}
                </div>
              </div>
            </details>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-border px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
          <Button className="w-full sm:w-auto" onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button className="w-full sm:w-auto" disabled={!draft.componentName.trim()} onClick={save} type="button">
            Save Component
          </Button>
        </div>
      </aside>
    </div>
  );
};

export const ProductConfigurationPage = () => {
  const navigate = useNavigate();
  const { tenderId = "" } = useParams();
  const [form, setForm] = useState<ProductConfigurationForm>(() => initialForm(tenderId));
  const [materials, setMaterials] = useState<Material[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState("");
  const [collapsedProducts, setCollapsedProducts] = useState<Record<string, boolean>>({});
  const [drawerState, setDrawerState] = useState<ComponentDrawerState | null>(null);
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
        const [loadedMaterials, loadedProducts, loadedAccessories] = await Promise.all([
          api.get<Material[]>("/materials?tenantId=alimex-demo"),
          api.get<Product[]>("/products?tenantId=alimex-demo"),
          api.get<Accessory[]>("/accessories?tenantId=alimex-demo"),
        ]);

        const activeMaterials = loadedMaterials.filter((item) => item.active);
        const activeProducts = loadedProducts.filter((item) => item.active);
        const activeAccessories = loadedAccessories.filter((item) => item.active);

        if (isMounted) {
          setMaterials(activeMaterials);
          setProducts(activeProducts);
          setAccessories(activeAccessories);
        }

        try {
          const config = await api.get<ProductConfiguration>(
            `/tenders/${tenderId}/product-configuration?tenantId=alimex-demo`,
          );

          if (isMounted) {
            const nextForm = toForm(config);
            const derivedForm = applyDerivedSnapshotValues(
              nextForm,
              nextForm.productSnapshots,
              activeMaterials,
            );
            setForm(derivedForm);
            setLastSavedSignature(JSON.stringify(derivedForm));
          }
        } catch (reason) {
          if (reason instanceof ApiError && reason.status === 404) {
            const tender = await api.get<TenderRequest>(
              `/tenders/${tenderId}?tenantId=alimex-demo`,
            );
            const tenderSnapshots =
              tender.productSnapshots.length > 0
                ? tender.productSnapshots.map(toSnapshotForm)
                : activeProducts
                    .filter((product) =>
                      tender.selectedProductIds.includes(product.productId),
                    )
                    .map(toSnapshotForm);

            if (isMounted) {
              const nextForm = applyDerivedSnapshotValues(
                {
                  ...initialForm(tenderId),
                  selectedProductIds: tender.selectedProductIds ?? [],
                  productSnapshots: tenderSnapshots,
                },
                tenderSnapshots,
                activeMaterials,
              );
              setForm(nextForm);
              setLastSavedSignature(JSON.stringify(nextForm));
            }
          } else {
            throw reason;
          }
        }
      } catch (reason) {
        if (isMounted) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load product configuration.",
          );
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

  const updateProductSnapshot = (
    productIndex: number,
    patch: Partial<ProductSnapshotForm>,
  ) => {
    setForm((current) => {
      const nextSnapshots = current.productSnapshots.map((product, index) =>
        index === productIndex ? { ...product, ...patch } : product,
      );

      return applyDerivedSnapshotValues(current, nextSnapshots, materials);
    });
  };

  const openAddComponentDrawer = (productIndex: number) => {
    setDrawerState({
      mode: "add",
      productIndex,
      componentIndex: null,
      value: createComponentFromType("Bag"),
    });
  };

  const openEditComponentDrawer = (
    productIndex: number,
    componentIndex: number,
    component: ProductSnapshotComponentForm,
  ) => {
    setDrawerState({
      mode: "edit",
      productIndex,
      componentIndex,
      value: createComponentForm(component),
    });
  };

  const saveComponent = (
    productIndex: number,
    mode: "add" | "edit",
    componentIndex: number | null,
    value: ProductSnapshotComponentForm,
  ) => {
    setForm((current) => {
      const nextSnapshots = current.productSnapshots.map((product, index) => {
        if (index !== productIndex) {
          return product;
        }

        return {
          ...product,
          components:
            mode === "edit" && componentIndex !== null
              ? product.components.map((component, currentComponentIndex) =>
                  currentComponentIndex === componentIndex ? value : component,
                )
              : [...product.components, value],
        };
      });

      return applyDerivedSnapshotValues(current, nextSnapshots, materials);
    });

    setDrawerState(null);
  };

  const removeComponent = (productIndex: number, componentIndex: number) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this component from the tender snapshot?")
    ) {
      return;
    }

    setForm((current) => {
      const nextSnapshots = current.productSnapshots.map((product, index) =>
        index === productIndex
          ? {
              ...product,
              components: product.components.filter(
                (_, currentComponentIndex) =>
                  currentComponentIndex !== componentIndex,
              ),
            }
          : product,
      );

      return applyDerivedSnapshotValues(current, nextSnapshots, materials);
    });
  };

  const addProductToConfiguration = () => {
    const product = products.find((item) => item.productId === selectedProductToAdd);

    if (!product) {
      setError("Select a product before adding it to the configuration.");
      return;
    }

    setForm((current) => {
      if (current.selectedProductIds.includes(product.productId)) {
        return current;
      }

      const nextSnapshots = [...current.productSnapshots, toSnapshotForm(product)];
      return applyDerivedSnapshotValues(current, nextSnapshots, materials);
    });

    setSelectedProductToAdd("");
    setError("");
    setMessage(`${product.productName} added as a tender-specific snapshot.`);
  };

  const removeProductFromConfiguration = (productId: string) => {
    setForm((current) => {
      const nextSnapshots = current.productSnapshots.filter(
        (product) => product.productId !== productId,
      );
      return applyDerivedSnapshotValues(current, nextSnapshots, materials);
    });

    setCollapsedProducts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  };

  const toggleProductCollapse = (productId: string) => {
    setCollapsedProducts((current) => ({
      ...current,
      [productId]: !current[productId],
    }));
  };

  const validate = () => {
    if (!form.productSnapshots.length) {
      setError("Add at least one product to configure this tender.");
      return false;
    }

    if (
      form.productSnapshots.some(
        (product) =>
          !product.productName.trim() ||
          product.components.some((component) => !component.componentName.trim()),
      )
    ) {
      setError("Each selected product and each Product Component must have a name.");
      return false;
    }

    if (
      form.productSnapshots.some(
        (product) =>
          product.requestedQuantity.trim() === "" ||
          numberOrNull(product.requestedQuantity) === null,
      )
    ) {
      setError("Provide a requested quantity for each added product.");
      return false;
    }

    if (!form.bagDiameterMm || !form.bagLengthMm || !form.mainFabricMaterialId) {
      setError(
        "Add a Bag component with diameter, length, and material before continuing.",
      );
      return false;
    }

    return true;
  };

  const payload = useMemo<ProductConfiguration>(
    () => ({
      entityType: "PRODUCT_CONFIGURATION",
      tenantId: form.tenantId,
      tenderId,
      productConfigId: form.productConfigId || "base",
      selectedProductIds: form.selectedProductIds,
      productSnapshots: form.productSnapshots.map(buildSnapshotProduct),
      productType: form.productType,
      quantity: numberOrNull(form.quantity),
      bagDiameterMm: numberOrNullMillimeterInput(form.bagDiameterMm),
      bagLengthMm: numberOrNullMillimeterInput(form.bagLengthMm),
      seamAllowanceMm: numberOrNullMillimeterInput(form.seamAllowanceMm),
      topBottomAllowanceMm: numberOrNullMillimeterInput(form.topBottomAllowanceMm),
      topDesign: form.topDesign.trim(),
      bottomDesign: form.bottomDesign.trim(),
      seamType: form.seamType.trim(),
      includeWearStrip: form.includeWearStrip,
      wearStripHeightMm: form.includeWearStrip
        ? numberOrNull(form.wearStripHeightMm)
        : null,
      mainFabricMaterialId: normalizeMaterialReference(
        form.mainFabricMaterialId,
        materials,
      ),
      accessoriesMaterialId: normalizeMaterialReference(
        form.accessoriesMaterialId,
        materials,
      ),
      threadMaterialId: normalizeMaterialReference(form.threadMaterialId, materials),
      packagingType: form.packagingType.trim(),
      bagsPerCarton: numberOrNull(form.bagsPerCarton),
      packagingNotes: form.packagingNotes?.trim() ?? "",
      createdAt: "",
      updatedAt: "",
    }),
    [form, materials, tenderId],
  );
  const currentSignature = useMemo(() => JSON.stringify(form), [form]);
  const isDirty = currentSignature !== lastSavedSignature;

  useUnsavedChangesWarning(isDirty);

  const save = async (mode: "draft" | "continue") => {
    setError("");
    setMessage("");
    setSaveMode(mode);

    if (!isApiConfigured) {
      setError("Set VITE_API_BASE_URL before saving product configuration.");
      setSaveMode(null);
      return;
    }

    if (mode === "continue" && !validate()) {
      setSaveMode(null);
      return;
    }

    try {
      const response = await api.put<ProductConfiguration>(
        `/tenders/${tenderId}/product-configuration`,
        payload,
      );

      const nextForm = toForm(response);
      const derivedForm = applyDerivedSnapshotValues(
        nextForm,
        nextForm.productSnapshots,
        materials,
      );
      setForm(derivedForm);
      setLastSavedSignature(JSON.stringify(derivedForm));
      setMessage(
        mode === "draft"
          ? "Product configuration snapshot saved."
          : "Product configuration snapshot saved. Continuing to material sourcing and costing.",
      );

      if (mode === "continue") {
        navigate(`/tenders/${tenderId}/material-sourcing`);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save product configuration.",
      );
    } finally {
      setSaveMode(null);
    }
  };

  return (
    <div className="space-y-5">
      <TenderWorkflowStepper currentStep={2} tenderId={tenderId} isDirty={isDirty} />

      <Card>
        <CardHeader className="border-b border-border pb-5">
          <div>
            <CardTitle>Product Configuration</CardTitle>
            <CardDescription>
              Add tender-specific product snapshots and edit reusable component details only when you need them.
            </CardDescription>
          </div>
          <Badge variant="default">PRODUCT_CONFIGURATION</Badge>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          {isLoading ? (
            <div className="rounded-2xl bg-slate-50 p-6 text-sm text-muted-foreground">
              Loading product configuration...
            </div>
          ) : null}

          {!isLoading ? (
            <>
              <section className="rounded-[1.2rem] border border-border bg-slate-50/70 px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Add Products</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Start with one or more reusable products, then adjust the tender snapshot as needed.
                    </p>
                  </div>
                  <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
                    <div className="w-full md:w-auto md:min-w-[20rem]">
                      <Select
                        value={selectedProductToAdd}
                        onChange={(event) => setSelectedProductToAdd(event.target.value)}
                      >
                        <option value="">Select a product</option>
                        {products.map((product) => (
                          <option key={product.productId} value={product.productId}>
                            {product.productName} ({product.productType})
                          </option>
                        ))}
                      </Select>
                    </div>
                      <Button className="w-full md:w-auto" onClick={addProductToConfiguration} type="button">
                      <Plus className="h-4 w-4" />
                      Add Product
                    </Button>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                {form.productSnapshots.length ? (
                  form.productSnapshots.map((product, productIndex) => (
                    <div
                      className="rounded-[1.2rem] border border-border bg-white"
                      key={product.productId}
                    >
                      <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:px-5">
                        <button
                          className="flex min-w-0 flex-1 items-start gap-3 text-left"
                          onClick={() => toggleProductCollapse(product.productId)}
                          type="button"
                        >
                          {collapsedProducts[product.productId] ? (
                            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold text-slate-900">
                                {product.productName || "Untitled product snapshot"}
                              </p>
                              <Badge variant="default">{product.productType}</Badge>
                              <Badge variant="neutral">
                                {product.components.length} component(s)
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Tender snapshot only. Master product data stays unchanged.
                            </p>
                          </div>
                        </button>
                        <Button
                          className="w-full sm:w-auto"
                          onClick={() => removeProductFromConfiguration(product.productId)}
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove Product
                        </Button>
                      </div>

                      {!collapsedProducts[product.productId] ? (
                        <div className="space-y-5 px-4 py-4 sm:px-5 sm:py-5">
                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <label className="space-y-2 text-sm font-medium text-slate-700">
                              Product Name
                              <Input
                                value={product.productName}
                                onChange={(event) =>
                                  updateProductSnapshot(productIndex, {
                                    productName: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="space-y-2 text-sm font-medium text-slate-700">
                              Product Type
                              <Select
                                value={product.productType}
                                onChange={(event) =>
                                  updateProductSnapshot(productIndex, {
                                    productType: event.target.value as Product["productType"],
                                  })
                                }
                              >
                                <option value="Filter Bag">Filter Bag</option>
                                <option value="Other">Other</option>
                              </Select>
                            </label>
                            <label className="space-y-2 text-sm font-medium text-slate-700">
                              Requested Quantity
                              <Input
                                inputMode="decimal"
                                value={product.requestedQuantity}
                                onChange={(event) =>
                                  updateProductSnapshot(productIndex, {
                                    requestedQuantity: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="space-y-2 text-sm font-medium text-slate-700">
                              Manufacturing Cost
                              <Input
                                inputMode="decimal"
                                value={product.manufacturingOverheadPerBag}
                                onChange={(event) =>
                                  updateProductSnapshot(productIndex, {
                                    manufacturingOverheadPerBag: event.target.value,
                                  })
                                }
                              />
                            </label>
                          </div>

                          <div className="space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <h4 className="text-sm font-semibold text-slate-900">Components</h4>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  Keep the tender view light. Open a component only when you need to edit details.
                                </p>
                              </div>
                              <Button
                                className="w-full sm:w-auto"
                                onClick={() => openAddComponentDrawer(productIndex)}
                                type="button"
                              >
                                <Plus className="h-4 w-4" />
                                Add Component
                              </Button>
                            </div>

                            <div className="overflow-x-auto rounded-[1.15rem] border border-border">
                              <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                  <tr>
                                    <th className="px-4 py-3">Component Name</th>
                                    <th className="px-4 py-3">Component Type</th>
                                    <th className="px-4 py-3">Material</th>
                                    <th className="px-4 py-3">Key Dimensions</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {product.components.length ? (
                                    product.components.map((component, componentIndex) => (
                                      <tr
                                        className="border-t border-border"
                                        key={component.componentId}
                                      >
                                        <td className="px-4 py-3 font-medium text-slate-900">
                                          {component.componentName || "-"}
                                        </td>
                                        <td className="px-4 py-3">
                                          {component.componentType || "-"}
                                        </td>
                                        <td className="px-4 py-3">
                                          {resolveMaterialLabel(component.material, materials) || "-"}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                          {getKeyDimensions(component)}
                                        </td>
                                        <td className="px-4 py-3">
                                          <div className="flex justify-end gap-2">
                                            <Button
                                              className="h-8 px-3"
                                              onClick={() =>
                                                openEditComponentDrawer(
                                                  productIndex,
                                                  componentIndex,
                                                  component,
                                                )
                                              }
                                              size="sm"
                                              type="button"
                                              variant="ghost"
                                            >
                                              <Pencil className="h-3.5 w-3.5" />
                                              Edit
                                            </Button>
                                            <Button
                                              className="h-8 px-3"
                                              onClick={() =>
                                                removeComponent(productIndex, componentIndex)
                                              }
                                              size="sm"
                                              type="button"
                                              variant="ghost"
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                              Delete
                                            </Button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td
                                        className="px-4 py-8 text-center text-muted-foreground"
                                        colSpan={5}
                                      >
                                        No components added yet.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.2rem] border border-dashed border-border bg-slate-50/70 px-5 py-12 text-center text-sm text-muted-foreground">
                    No products added to this tender yet.
                  </div>
                )}
              </section>

              {message ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {message}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col gap-4 rounded-[1.2rem] border border-border bg-white p-4 md:flex-row md:items-center md:justify-between">
                <div className="text-sm">
                  {message ? <p className="mt-2 text-emerald-600">{message}</p> : null}
                  {error ? <p className="mt-2 text-rose-600">{error}</p> : null}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => {
                      if (!confirmDiscardUnsavedChanges(isDirty)) {
                        return;
                      }

                      navigate(`/tenders/intake/${tenderId}`);
                    }}
                    type="button"
                    variant="ghost"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => void save("draft")}
                    type="button"
                    variant="outline"
                  >
                    <Save className="h-4 w-4" />
                    {saveMode === "draft" ? "Saving..." : "Save Draft"}
                  </Button>
                  <Button className="w-full sm:w-auto" onClick={() => void save("continue")} type="button">
                    <ArrowRight className="h-4 w-4" />
                    {saveMode === "continue" ? "Saving..." : "Save & Continue"}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <ProductComponentDrawer
        accessories={accessories}
        materials={materials}
        onClose={() => setDrawerState(null)}
        onSave={saveComponent}
        state={drawerState}
      />
    </div>
  );
};

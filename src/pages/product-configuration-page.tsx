import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { TenderWorkflowStepper } from "../components/tenders/tender-workflow-stepper";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { api, ApiError, isApiConfigured } from "../lib/api";
import type { Material, Product, ProductConfiguration, TenderRequest } from "../../shared/types";

type SpecificationFormRow = {
  key: string;
  value: string;
};

type ProductSnapshotComponentForm = {
  componentId: string;
  componentName: string;
  componentType: string;
  material: string;
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

const isBagBody = (component: ProductSnapshotComponentForm) =>
  component.componentType.trim().toLowerCase() === "bag body" ||
  component.componentName.trim().toLowerCase() === "bag body";

const specificationsToRows = (specifications: Product["components"][number]["specifications"]) =>
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
  diameter:
    component.specifications.diameter === null || component.specifications.diameter === undefined
      ? ""
      : String(component.specifications.diameter),
  length:
    component.specifications.length === null || component.specifications.length === undefined
      ? ""
      : String(component.specifications.length),
  seamAllowanceMm:
    component.specifications.seamAllowanceMm === null ||
    component.specifications.seamAllowanceMm === undefined
      ? ""
      : String(component.specifications.seamAllowanceMm),
  topBottomAllowanceMm:
    component.specifications.topBottomAllowanceMm === null ||
    component.specifications.topBottomAllowanceMm === undefined
      ? ""
      : String(component.specifications.topBottomAllowanceMm),
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
    product.factoryOverheadPerBag === null || product.factoryOverheadPerBag === undefined
      ? ""
      : String(product.factoryOverheadPerBag),
  manufacturingOverheadPerBag:
    product.manufacturingOverheadPerBag === null || product.manufacturingOverheadPerBag === undefined
      ? ""
      : String(product.manufacturingOverheadPerBag),
  managementOverheadPerBag:
    product.managementOverheadPerBag === null || product.managementOverheadPerBag === undefined
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
      specifications.diameter = numberOrNull(component.diameter);
      specifications.length = numberOrNull(component.length);
      specifications.seamAllowanceMm = numberOrNull(component.seamAllowanceMm);
      specifications.topBottomAllowanceMm = numberOrNull(component.topBottomAllowanceMm);
    }

    return {
      componentId: component.componentId,
      componentName: component.componentName.trim(),
      componentType: component.componentType.trim(),
      material: component.material.trim(),
      specifications,
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

const applyDerivedSnapshotValues = (
  current: ProductConfigurationForm,
  snapshots: ProductSnapshotForm[],
  materials: Material[],
): ProductConfigurationForm => {
  const allComponents = snapshots.flatMap((product) => product.components);
  const bagBody = allComponents.find(isBagBody);
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
    mainFabricMaterialId: bagBody ? normalizeMaterialReference(bagBody.material, materials) : "",
    accessoriesMaterialId: ring ? normalizeMaterialReference(ring.material, materials) : "",
    threadMaterialId: thread ? normalizeMaterialReference(thread.material, materials) : "",
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
  bagDiameterMm: config.bagDiameterMm?.toString() ?? "",
  bagLengthMm: config.bagLengthMm?.toString() ?? "",
  seamAllowanceMm: config.seamAllowanceMm?.toString() ?? "",
  topBottomAllowanceMm: config.topBottomAllowanceMm?.toString() ?? "",
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

export const ProductConfigurationPage = () => {
  const navigate = useNavigate();
  const { tenderId = "" } = useParams();
  const [form, setForm] = useState<ProductConfigurationForm>(() => initialForm(tenderId));
  const [materials, setMaterials] = useState<Material[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState("");
  const [collapsedProducts, setCollapsedProducts] = useState<Record<string, boolean>>({});
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
        const [loadedMaterials, loadedProducts] = await Promise.all([
          api.get<Material[]>("/materials?tenantId=alimex-demo"),
          api.get<Product[]>("/products?tenantId=alimex-demo"),
        ]);

        const activeMaterials = loadedMaterials.filter((item) => item.active);
        const activeProducts = loadedProducts.filter((item) => item.active);

        if (isMounted) {
          setMaterials(activeMaterials);
          setProducts(activeProducts);
        }

        try {
          const config = await api.get<ProductConfiguration>(
            `/tenders/${tenderId}/product-configuration?tenantId=alimex-demo`,
          );

          if (isMounted) {
            setForm(applyDerivedSnapshotValues(toForm(config), toForm(config).productSnapshots, activeMaterials));
          }
        } catch (reason) {
          if (reason instanceof ApiError && reason.status === 404) {
            const tender = await api.get<TenderRequest>(`/tenders/${tenderId}?tenantId=alimex-demo`);
            const tenderSnapshots =
              tender.productSnapshots.length > 0
                ? tender.productSnapshots.map(toSnapshotForm)
                : activeProducts
                    .filter((product) => tender.selectedProductIds.includes(product.productId))
                    .map(toSnapshotForm);

            if (isMounted) {
              setForm((current) =>
                applyDerivedSnapshotValues(
                  {
                    ...current,
                    selectedProductIds: tender.selectedProductIds ?? [],
                    productSnapshots: tenderSnapshots,
                  },
                  tenderSnapshots,
                  activeMaterials,
                ),
              );
            }
          } else {
            throw reason;
          }
        }
      } catch (reason) {
        if (isMounted) {
          setError(reason instanceof Error ? reason.message : "Unable to load product configuration.");
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

  const updateProductSnapshot = (productIndex: number, patch: Partial<ProductSnapshotForm>) => {
    setForm((current) => {
      const nextSnapshots = current.productSnapshots.map((product, index) =>
        index === productIndex ? { ...product, ...patch } : product,
      );
      return applyDerivedSnapshotValues(current, nextSnapshots, materials);
    });
  };

  const updateComponent = (
    productIndex: number,
    componentIndex: number,
    patch: Partial<ProductSnapshotComponentForm>,
  ) => {
    setForm((current) => {
      const nextSnapshots = current.productSnapshots.map((product, index) =>
        index === productIndex
          ? {
              ...product,
              components: product.components.map((component, currentComponentIndex) =>
                currentComponentIndex === componentIndex ? { ...component, ...patch } : component,
              ),
            }
          : product,
      );

      return applyDerivedSnapshotValues(current, nextSnapshots, materials);
    });
  };

  const removeComponent = (productIndex: number, componentIndex: number) => {
    setForm((current) => {
      const nextSnapshots = current.productSnapshots.map((product, index) =>
        index === productIndex
          ? {
              ...product,
              components: product.components.filter((_, currentComponentIndex) => currentComponentIndex !== componentIndex),
            }
          : product,
      );

      return applyDerivedSnapshotValues(current, nextSnapshots, materials);
    });
  };

  const addSpecificationRow = (productIndex: number, componentIndex: number) => {
    setForm((current) => {
      const nextSnapshots = current.productSnapshots.map((product, index) =>
        index === productIndex
          ? {
              ...product,
              components: product.components.map((component, currentComponentIndex) =>
                currentComponentIndex === componentIndex
                  ? {
                      ...component,
                      specificationRows: [...component.specificationRows, { key: "", value: "" }],
                    }
                  : component,
              ),
            }
          : product,
      );

      return applyDerivedSnapshotValues(current, nextSnapshots, materials);
    });
  };

  const updateSpecificationRow = (
    productIndex: number,
    componentIndex: number,
    rowIndex: number,
    patch: Partial<SpecificationFormRow>,
  ) => {
    setForm((current) => {
      const nextSnapshots = current.productSnapshots.map((product, index) =>
        index === productIndex
          ? {
              ...product,
              components: product.components.map((component, currentComponentIndex) =>
                currentComponentIndex === componentIndex
                  ? {
                      ...component,
                      specificationRows: component.specificationRows.map((row, currentRowIndex) =>
                        currentRowIndex === rowIndex ? { ...row, ...patch } : row,
                      ),
                    }
                  : component,
              ),
            }
          : product,
      );

      return applyDerivedSnapshotValues(current, nextSnapshots, materials);
    });
  };

  const removeSpecificationRow = (productIndex: number, componentIndex: number, rowIndex: number) => {
    setForm((current) => {
      const nextSnapshots = current.productSnapshots.map((product, index) =>
        index === productIndex
          ? {
              ...product,
              components: product.components.map((component, currentComponentIndex) =>
                currentComponentIndex === componentIndex
                  ? {
                      ...component,
                      specificationRows: component.specificationRows.filter(
                        (_, currentRowIndex) => currentRowIndex !== rowIndex,
                      ),
                    }
                  : component,
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
      const nextSnapshots = current.productSnapshots.filter((product) => product.productId !== productId);
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
          product.requestedQuantity.trim() === "" || numberOrNull(product.requestedQuantity) === null,
      )
    ) {
      setError("Provide a requested quantity for each added product.");
      return false;
    }

    if (!form.bagDiameterMm || !form.bagLengthMm || !form.mainFabricMaterialId) {
      setError(
        "Add a Bag Body component with diameter, length, and material before continuing.",
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
      bagDiameterMm: numberOrNull(form.bagDiameterMm),
      bagLengthMm: numberOrNull(form.bagLengthMm),
      seamAllowanceMm: numberOrNull(form.seamAllowanceMm),
      topBottomAllowanceMm: numberOrNull(form.topBottomAllowanceMm),
      topDesign: form.topDesign.trim(),
      bottomDesign: form.bottomDesign.trim(),
      seamType: form.seamType.trim(),
      includeWearStrip: form.includeWearStrip,
      wearStripHeightMm: form.includeWearStrip ? numberOrNull(form.wearStripHeightMm) : null,
      mainFabricMaterialId: normalizeMaterialReference(form.mainFabricMaterialId, materials),
      accessoriesMaterialId: normalizeMaterialReference(form.accessoriesMaterialId, materials),
      threadMaterialId: normalizeMaterialReference(form.threadMaterialId, materials),
      packagingType: form.packagingType.trim(),
      bagsPerCarton: numberOrNull(form.bagsPerCarton),
      packagingNotes: form.packagingNotes?.trim() ?? "",
      createdAt: "",
      updatedAt: "",
    }),
    [form, materials, tenderId],
  );

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

      const nextForm = applyDerivedSnapshotValues(
        toForm(response),
        toForm(response).productSnapshots,
        materials,
      );
      setForm(nextForm);
      setMessage(
        mode === "draft"
          ? "Product configuration snapshot saved."
          : "Product configuration snapshot saved. Continuing to material sourcing and costing.",
      );

      if (mode === "continue") {
        navigate(`/tenders/${tenderId}/material-sourcing`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save product configuration.");
    } finally {
      setSaveMode(null);
    }
  };

  return (
    <div className="space-y-6">
      <TenderWorkflowStepper currentStep={2} tenderId={tenderId} />

      <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Product Configuration</CardTitle>
                <CardDescription>
                  Edit tender-specific product snapshots and Product Components without changing the master data records.
                </CardDescription>
              </div>
              <Badge variant="default">PRODUCT_CONFIGURATION</Badge>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="rounded-2xl bg-slate-50 p-6 text-sm text-muted-foreground">
                  Loading product configuration...
                </div>
              ) : null}

              {!isLoading ? (
                <>
                  <div className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4">
                      <h3 className="text-base font-semibold text-slate-900">Selected Products</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Start empty, add one or more products, then edit their snapshot details for this tender.
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 md:flex-row">
                      <div className="flex-1">
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
                      <Button onClick={addProductToConfiguration} type="button">
                        <Plus className="h-4 w-4" />
                        Add Product
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {form.productSnapshots.length ? (
                      form.productSnapshots.map((product, productIndex) => (
                        <div key={product.productId} className="rounded-[1.25rem] border border-border bg-white p-5">
                          <div className="mb-5 flex items-start justify-between gap-4">
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
                                <p className="text-base font-semibold text-slate-900">
                                  {product.productName || "Untitled product snapshot"}
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  Changes here are saved only on this tender snapshot.
                                </p>
                              </div>
                            </button>
                            <div className="flex items-center gap-2">
                              <Badge variant="default">{product.components.length} component(s)</Badge>
                              <Button
                                onClick={() => removeProductFromConfiguration(product.productId)}
                                type="button"
                                variant="ghost"
                              >
                                <Trash2 className="h-4 w-4" />
                                Remove Product
                              </Button>
                            </div>
                          </div>

                          {!collapsedProducts[product.productId] ? (
                            <>
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="space-y-2 text-sm font-medium text-slate-700">
                              Product Name
                              <Input
                                value={product.productName}
                                onChange={(event) =>
                                  updateProductSnapshot(productIndex, { productName: event.target.value })
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
                            <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
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
                          </div>

                          <div className="mt-5 space-y-4">
                            {product.components.length ? (
                              product.components.map((component, componentIndex) => (
                                <div
                                  key={component.componentId}
                                  className="rounded-2xl border border-border bg-slate-50 p-4"
                                >
                                  <div className="mb-4 flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {component.componentName || `Component ${componentIndex + 1}`}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Edit this Product Component for the tender snapshot.
                                      </p>
                                    </div>
                                    <Button
                                      onClick={() => removeComponent(productIndex, componentIndex)}
                                      type="button"
                                      variant="ghost"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>

                                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                    <label className="space-y-2 text-sm font-medium text-slate-700">
                                      Component Name
                                      <Input
                                        value={component.componentName}
                                        onChange={(event) =>
                                          updateComponent(productIndex, componentIndex, {
                                            componentName: event.target.value,
                                          })
                                        }
                                      />
                                    </label>
                                    <label className="space-y-2 text-sm font-medium text-slate-700">
                                      Component Type
                                      <Input
                                        value={component.componentType}
                                        onChange={(event) =>
                                          updateComponent(productIndex, componentIndex, {
                                            componentType: event.target.value,
                                          })
                                        }
                                      />
                                    </label>
                                    <label className="space-y-2 text-sm font-medium text-slate-700">
                                      Material
                                      <Select
                                        value={normalizeMaterialReference(component.material, materials)}
                                        onChange={(event) =>
                                          updateComponent(productIndex, componentIndex, {
                                            material: event.target.value,
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
                                  </div>

                                  {isBagBody(component) ? (
                                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                      <label className="space-y-2 text-sm font-medium text-slate-700">
                                        Diameter (m)
                                        <Input
                                          inputMode="decimal"
                                          value={component.diameter}
                                          onChange={(event) =>
                                            updateComponent(productIndex, componentIndex, {
                                              diameter: event.target.value,
                                            })
                                          }
                                        />
                                      </label>
                                      <label className="space-y-2 text-sm font-medium text-slate-700">
                                        Length (m)
                                        <Input
                                          inputMode="decimal"
                                          value={component.length}
                                          onChange={(event) =>
                                            updateComponent(productIndex, componentIndex, {
                                              length: event.target.value,
                                            })
                                          }
                                        />
                                      </label>
                                      <label className="space-y-2 text-sm font-medium text-slate-700">
                                        Seam Allowance (m)
                                        <Input
                                          inputMode="decimal"
                                          value={component.seamAllowanceMm}
                                          onChange={(event) =>
                                            updateComponent(productIndex, componentIndex, {
                                              seamAllowanceMm: event.target.value,
                                            })
                                          }
                                        />
                                      </label>
                                      <label className="space-y-2 text-sm font-medium text-slate-700">
                                        Top / Bottom Allowance (m)
                                        <Input
                                          inputMode="decimal"
                                          value={component.topBottomAllowanceMm}
                                          onChange={(event) =>
                                            updateComponent(productIndex, componentIndex, {
                                              topBottomAllowanceMm: event.target.value,
                                            })
                                          }
                                        />
                                      </label>
                                    </div>
                                  ) : null}

                                  <div className="mt-4 rounded-2xl border border-border bg-white p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-semibold text-slate-900">Specifications</p>
                                        <p className="text-xs text-muted-foreground">
                                          Add flexible key-value details for this component snapshot.
                                        </p>
                                      </div>
                                      <Button
                                        onClick={() => addSpecificationRow(productIndex, componentIndex)}
                                        type="button"
                                        variant="outline"
                                      >
                                        <Plus className="h-4 w-4" />
                                        Add Field
                                      </Button>
                                    </div>
                                    <div className="space-y-3">
                                      {component.specificationRows.length ? (
                                        component.specificationRows.map((row, rowIndex) => (
                                          <div
                                            key={`${component.componentId}-${rowIndex}`}
                                            className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"
                                          >
                                            <Input
                                              value={row.key}
                                              placeholder="Specification name"
                                              onChange={(event) =>
                                                updateSpecificationRow(
                                                  productIndex,
                                                  componentIndex,
                                                  rowIndex,
                                                  { key: event.target.value },
                                                )
                                              }
                                            />
                                            <Input
                                              value={row.value}
                                              placeholder="Specification value"
                                              onChange={(event) =>
                                                updateSpecificationRow(
                                                  productIndex,
                                                  componentIndex,
                                                  rowIndex,
                                                  { value: event.target.value },
                                                )
                                              }
                                            />
                                            <Button
                                              onClick={() =>
                                                removeSpecificationRow(productIndex, componentIndex, rowIndex)
                                              }
                                              type="button"
                                              variant="ghost"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        ))
                                      ) : (
                                        <p className="text-sm text-muted-foreground">
                                          No extra specification fields added.
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-6 text-center text-sm text-muted-foreground">
                                This product snapshot has no Product Components yet.
                              </div>
                            )}
                          </div>
                            </>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-10 text-center text-sm text-muted-foreground">
                        No products added yet. Choose a product above to create a tender-specific snapshot.
                      </div>
                    )}
                  </div>

                </>
              ) : null}

              <div className="flex flex-col gap-4 rounded-[1.2rem] border border-border bg-white p-4 md:flex-row md:items-center md:justify-between">
                <div className="text-sm">
                  <p className="font-medium text-slate-900">
                    Save the tender-specific product snapshot before roll calculations.
                  </p>
                  <p className="text-muted-foreground">
                    Saving this section also updates the tender status to `PRODUCT_CONFIGURATION`.
                  </p>
                  {message ? <p className="mt-2 text-emerald-600">{message}</p> : null}
                  {error ? <p className="mt-2 text-rose-600">{error}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => navigate(`/tenders/intake/${tenderId}`)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saveMode !== null}
                    onClick={() => void save("draft")}
                  >
                    <Save className="h-4 w-4" />
                    {saveMode === "draft" ? "Saving..." : "Save Draft"}
                  </Button>
                  <Button
                    type="button"
                    disabled={saveMode !== null}
                    onClick={() => void save("continue")}
                  >
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

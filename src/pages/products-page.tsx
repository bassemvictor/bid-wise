import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";

import type { Accessory, Material, Product, ProductComponent, ProductComponentAccessorySnapshot, ProductType } from "../../shared/types";
import { EmptyState } from "../components/master-data/empty-state";
import { MasterDataToolbar } from "../components/master-data/master-data-toolbar";
import { StatusBadge } from "../components/master-data/status-badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { api, isApiConfigured } from "../lib/api";
import { cn } from "../lib/utils";

type SpecificationFormRow = {
  key: string;
  value: string;
};

type ProductComponentForm = {
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

type ProductForm = {
  productId: string;
  tenantId: string;
  productName: string;
  productType: ProductType;
  manufacturingOverheadPerBag: string;
  components: ProductComponentForm[];
  active: boolean;
};

type ComponentDrawerState = {
  mode: "add" | "edit";
  index: number | null;
  value: ProductComponentForm;
};

const productTypes: ProductType[] = ["Filter Bag", "Other"];
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

const initialForm: ProductForm = {
  productId: "",
  tenantId: "alimex-demo",
  productName: "",
  productType: "Filter Bag",
  manufacturingOverheadPerBag: "",
  components: [],
  active: true,
};

const createComponentForm = (seed?: Partial<ProductComponentForm>): ProductComponentForm => ({
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

const isBagBody = (component: ProductComponentForm) =>
  component.componentName.trim().toLowerCase() === "bag" ||
  component.componentName.trim().toLowerCase() === "bag body" ||
  component.componentType.trim().toLowerCase() === "bag" ||
  component.componentType.trim().toLowerCase() === "bag body";

const specificationsToFormRows = (specifications: ProductComponent["specifications"]) =>
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

const toForm = (record: Product): ProductForm => ({
  productId: record.productId,
  tenantId: record.tenantId,
  productName: record.productName,
  productType: record.productType,
  manufacturingOverheadPerBag: record.manufacturingOverheadPerBag?.toString() ?? "",
  active: record.active,
  components: record.components.map((component) =>
    createComponentForm({
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
      accessoryTotalPricePerBagEgp: component.accessorySnapshot?.totalPricePerBagEgp?.toString() ?? "",
      diameter:
        component.specifications.diameter === null || component.specifications.diameter === undefined
          ? ""
          : typeof component.specifications.diameter === "boolean"
            ? ""
            : formatInputMetric(component.specifications.diameter),
      length:
        component.specifications.length === null || component.specifications.length === undefined
          ? ""
          : typeof component.specifications.length === "boolean"
            ? ""
            : formatInputMetric(component.specifications.length),
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
      specificationRows: specificationsToFormRows(component.specifications),
    }),
  ),
});

const buildComponentPayload = (component: ProductComponentForm): ProductComponent => {
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
  );

  if (isBagBody(component)) {
    specifications.diameter = component.diameter.trim() === "" ? null : Number(component.diameter);
    specifications.length = component.length.trim() === "" ? null : Number(component.length);
    specifications.seamAllowanceMm =
      component.seamAllowanceMm.trim() === "" ? null : Number(component.seamAllowanceMm);
    specifications.topBottomAllowanceMm =
      component.topBottomAllowanceMm.trim() === "" ? null : Number(component.topBottomAllowanceMm);
  }

  return {
    componentId: component.componentId || crypto.randomUUID(),
    componentName: component.componentName.trim(),
    componentType: component.componentType.trim(),
    material: component.material.trim(),
    specifications,
    accessorySnapshot:
      component.componentType === "Accessories"
        ? {
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
          } satisfies ProductComponentAccessorySnapshot
        : null,
  };
};

const formatCurrency = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "Not set"
    : `${value.toFixed(2)} EGP`;

const formatInputMetric = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return typeof value === "string" ? value : "";
  }

  return parsed.toFixed(2).replace(/\.?0+$/, "");
};

const formatDimension = (label: string, value: string) =>
  value.trim() ? `${label} ${formatInputMetric(value)} mm` : "";

const getKeyDimensions = (component: ProductComponentForm) => {
  const values = [formatDimension("Ø", component.diameter), formatDimension("L", component.length)].filter(Boolean);
  return values.length ? values.join(" • ") : "-";
};

const renderSpecificationsSummary = (component: Product) => {
  const parts = Object.entries(component.components?.[0]?.specifications ?? {});
  return parts.length;
};

const resolveMaterialLabel = (value: string, materials: Material[]) => {
  const matched =
    materials.find((material) => material.materialId === value) ??
    materials.find((material) => material.materialName === value);

  return matched?.materialName ?? value ?? "";
};

const createEmptyDrawerState = (): ComponentDrawerState => ({
  mode: "add",
  index: null,
  value: createComponentFromType("Bag"),
});

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
  onSave: (value: ProductComponentForm, mode: "add" | "edit", index: number | null) => void;
  state: ComponentDrawerState | null;
}) => {
  const [draft, setDraft] = useState<ProductComponentForm>(state?.value ?? createComponentFromType("Bag"));

  useEffect(() => {
    if (state) {
      setDraft(state.value);
    }
  }, [state]);

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

  const updateAccessoryPricingRow = (rowIndex: number, patch: Partial<SpecificationFormRow>) => {
    setDraft((current) => ({
      ...current,
      accessoryPricingItems: current.accessoryPricingItems.map((row, currentRowIndex) =>
        currentRowIndex === rowIndex ? { ...row, ...patch } : row,
      ),
    }));
  };

  const removeAccessoryPricingRow = (rowIndex: number) => {
    setDraft((current) => ({
      ...current,
      accessoryPricingItems: current.accessoryPricingItems.filter((_, currentRowIndex) => currentRowIndex !== rowIndex),
    }));
  };

  const addSpecificationRow = () => {
    setDraft((current) => ({
      ...current,
      specificationRows: [...current.specificationRows, { key: "", value: "" }],
    }));
  };

  const updateSpecificationRow = (rowIndex: number, patch: Partial<SpecificationFormRow>) => {
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
      specificationRows: current.specificationRows.filter((_, currentRowIndex) => currentRowIndex !== rowIndex),
    }));
  };

  const save = () => {
    if (!draft.componentName.trim()) {
      return;
    }

    onSave(draft, state.mode, state.index);
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
                  onChange={(event) => setDraft((current) => ({ ...current, componentName: event.target.value }))}
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
                          : current.material &&
                              materials.some(
                                (material) =>
                                  material.materialName === current.material &&
                                  material.category === getMaterialCategoryForComponentType(nextType),
                              )
                            ? current.material
                            : "",
                      accessoryId: nextType === "Accessories" ? current.accessoryId : "",
                      accessoryPricingItems: nextType === "Accessories" ? current.accessoryPricingItems : [],
                      accessoryTotalPricePerBagEgp: nextType === "Accessories" ? current.accessoryTotalPricePerBagEgp : "",
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
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Accessory
                  <Select
                    value={draft.accessoryId}
                    onChange={(event) => {
                      const nextAccessory = accessories.find((accessory) => accessory.accessoryId === event.target.value) ?? null;
                      setDraft((current) => ({
                        ...current,
                        accessoryId: event.target.value,
                        material: nextAccessory?.accessoryName ?? "",
                        componentName:
                          current.componentName.trim() === "" || current.componentName === "Accessories"
                            ? nextAccessory?.accessoryName ?? current.componentName
                            : current.componentName,
                        accessoryPricingItems:
                          nextAccessory?.pricingItems.map((item) => ({
                            key: item.key,
                            value: item.price?.toString() ?? "",
                          })) ?? [],
                        accessoryTotalPricePerBagEgp: nextAccessory?.totalPricePerBagEgp?.toString() ?? "",
                      }));
                    }}
                  >
                    <option value="">{getMaterialPlaceholderForComponentType(draft.componentType)}</option>
                    {accessories.map((accessory) => (
                      <option key={accessory.accessoryId} value={accessory.accessoryId}>
                        {accessory.accessoryName}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : (
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Material
                  <Select
                    value={draft.material}
                    onChange={(event) => setDraft((current) => ({ ...current, material: event.target.value }))}
                  >
                    <option value="">{getMaterialPlaceholderForComponentType(draft.componentType)}</option>
                    {availableMaterials.map((material) => (
                      <option key={material.materialId} value={material.materialName}>
                        {material.materialName}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
              {draft.componentType === "Accessories" ? (
                <>
                  <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
                    Total Price Per Bag (EGP)
                    <Input
                      inputMode="decimal"
                      value={draft.accessoryTotalPricePerBagEgp}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, accessoryTotalPricePerBagEgp: event.target.value }))
                      }
                    />
                  </label>
                  <div className="space-y-3 sm:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-700">Accessory Pricing Snapshot</p>
                      <Button onClick={addAccessoryPricingRow} type="button" variant="outline">
                        <Plus className="h-4 w-4" />
                        Add Row
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {draft.accessoryPricingItems.length ? (
                        draft.accessoryPricingItems.map((row, rowIndex) => (
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)_auto]" key={`${draft.componentId}-accessory-${rowIndex}`}>
                            <Input
                              placeholder="Type / Category"
                              value={row.key}
                              onChange={(event) => updateAccessoryPricingRow(rowIndex, { key: event.target.value })}
                            />
                            <Input
                              inputMode="decimal"
                              placeholder="Price"
                              value={row.value}
                              onChange={(event) => updateAccessoryPricingRow(rowIndex, { value: event.target.value })}
                            />
                            <Button onClick={() => removeAccessoryPricingRow(rowIndex)} type="button" variant="ghost">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No accessory pricing rows loaded yet.</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Diameter (mm)
                    <Input
                      inputMode="decimal"
                      value={draft.diameter}
                      onChange={(event) => setDraft((current) => ({ ...current, diameter: event.target.value }))}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Length (mm)
                    <Input
                      inputMode="decimal"
                      value={draft.length}
                      onChange={(event) => setDraft((current) => ({ ...current, length: event.target.value }))}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Seam Allowance
                    <Input
                      inputMode="decimal"
                      value={draft.seamAllowanceMm}
                      onChange={(event) => setDraft((current) => ({ ...current, seamAllowanceMm: event.target.value }))}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Top / Bottom Allowance
                    <Input
                      inputMode="decimal"
                      value={draft.topBottomAllowanceMm}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, topBottomAllowanceMm: event.target.value }))
                      }
                    />
                  </label>
                </>
              )}
            </div>

            <details className="rounded-[1.15rem] border border-border bg-slate-50/70" open={false}>
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900">
                Advanced Details
              </summary>
              <div className="border-t border-border px-4 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Add less common component fields as simple key-value pairs.
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
                          onChange={(event) => updateSpecificationRow(rowIndex, { key: event.target.value })}
                        />
                        <Input
                          placeholder="Value"
                          value={row.value}
                          onChange={(event) => updateSpecificationRow(rowIndex, { value: event.target.value })}
                        />
                        <Button onClick={() => removeSpecificationRow(rowIndex)} type="button" variant="ghost">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No advanced fields added yet.</p>
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

export const ProductsPage = () => {
  const [records, setRecords] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(initialForm);
  const [error, setError] = useState("");
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [drawerState, setDrawerState] = useState<ComponentDrawerState | null>(null);

  const load = async () => {
    if (!isApiConfigured) {
      return;
    }

    try {
      const [products, materialItems, accessoryItems] = await Promise.all([
        api.get<Product[]>("/products?tenantId=alimex-demo"),
        api.get<Material[]>("/materials?tenantId=alimex-demo"),
        api.get<Accessory[]>("/accessories?tenantId=alimex-demo"),
      ]);
      setRecords(products);
      setMaterials(materialItems.filter((item) => item.active));
      setAccessories(accessoryItems.filter((item) => item.active));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load products.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      records.filter((record) => {
        const componentNames = record.components.map((component) => component.componentName).join(" ");
        const matchesSearch = [record.productId, record.productName, record.productType, componentNames]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase());
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && record.active) ||
          (statusFilter === "archived" && !record.active);

        return matchesSearch && matchesStatus;
      }),
    [records, search, statusFilter],
  );

  const resetForm = (next?: ProductForm) => {
    setForm(next ?? initialForm);
    setDrawerState(null);
    setError("");
  };

  const openAddComponentDrawer = () => {
      setDrawerState({
      mode: "add",
      index: null,
      value: createComponentFromType("Bag"),
    });
  };

  const openEditComponentDrawer = (component: ProductComponentForm, index: number) => {
    setDrawerState({
      mode: "edit",
      index,
      value: createComponentForm(component),
    });
  };

  const saveComponent = (value: ProductComponentForm, mode: "add" | "edit", index: number | null) => {
    setForm((current) => ({
      ...current,
      components:
        mode === "edit" && index !== null
          ? current.components.map((component, componentIndex) =>
              componentIndex === index ? value : component,
            )
          : [...current.components, value],
    }));
    setDrawerState(null);
  };

  const removeComponent = (index: number) => {
    if (typeof window !== "undefined" && !window.confirm("Delete this component from the product?")) {
      return;
    }

    setForm((current) => ({
      ...current,
      components: current.components.filter((_, componentIndex) => componentIndex !== index),
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.productId.trim()) {
      setError("Product ID is required.");
      return;
    }

    if (!form.productName.trim()) {
      setError("Product Name is required.");
      return;
    }

    if (!form.productType) {
      setError("Product Type is required.");
      return;
    }

    if (form.components.some((component) => !component.componentName.trim())) {
      setError("Each product component must have a Component Name.");
      return;
    }

    const payload: Product = {
      entityType: "PRODUCT",
      tenantId: form.tenantId,
      productId: form.productId.trim(),
      productName: form.productName.trim(),
      productType: form.productType,
      manufacturingOverheadPerBag:
        form.manufacturingOverheadPerBag.trim() === "" ? null : Number(form.manufacturingOverheadPerBag),
      factoryOverheadPerBag: editing?.factoryOverheadPerBag ?? null,
      managementOverheadPerBag: editing?.managementOverheadPerBag ?? null,
      components: form.components.map(buildComponentPayload),
      active: form.active,
      createdAt: "",
      updatedAt: "",
    };

    try {
      if (editing) {
        await api.put<Product>(`/products/${payload.productId}`, payload);
      } else {
        await api.post<Product>("/products", payload);
      }

      setOpen(false);
      setDrawerState(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save product.");
    }
  };

  const archive = async (record: Product) => {
    try {
      await api.delete<Product>(`/products/${record.productId}?tenantId=alimex-demo`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to archive product.");
    }
  };

  return (
    <div className="space-y-6">
      <MasterDataToolbar
        addLabel="Add Product"
        onAdd={() => {
          setEditing(null);
          resetForm();
          setOpen(true);
        }}
        onSearchChange={setSearch}
        onStatusFilterChange={setStatusFilter}
        searchValue={search}
        statusFilter={statusFilter}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Products</CardTitle>
            <CardDescription>Manage reusable product records with nested Product Components.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState title="No products found" description="Create reusable products and attach their components." />
          ) : (
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Components</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((record) => {
                  const expanded = expandedProductId === record.productId;

                  return (
                    <Fragment key={record.productId}>
                      <TableRow
                        className="cursor-pointer hover:bg-slate-50 [&>td]:align-middle"
                        onClick={() =>
                          setExpandedProductId((current) => (current === record.productId ? null : record.productId))
                        }
                      >
                        <TableCell className="w-[320px]">
                          <div className="flex items-center gap-2">
                            {expanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div>
                              <p className="font-medium text-slate-900">{record.productName}</p>
                              <p className="text-xs text-muted-foreground">{record.productId}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium text-slate-800">{record.productType}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-slate-800">{record.components.length}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center">
                            <StatusBadge active={record.active} />
                          </div>
                        </TableCell>
                        <TableCell className="w-[180px]" onClick={(event) => event.stopPropagation()}>
                          <div className="flex justify-end gap-2 whitespace-nowrap">
                            <Button
                              onClick={() => {
                                setEditing(record);
                                resetForm(toForm(record));
                                setOpen(true);
                              }}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              Edit
                            </Button>
                            <Button onClick={() => void archive(record)} size="sm" type="button" variant="outline">
                              {record.active ? "Archive" : "Delete"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow>
                          <TableCell className="bg-slate-50" colSpan={5}>
                            <div className="space-y-4 rounded-2xl border border-border bg-white p-4">
                              <div className="grid gap-4 md:grid-cols-3">
                                <div className="rounded-2xl bg-slate-50 p-4">
                                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Product ID</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">{record.productId}</p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-4">
                                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Product Type</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">{record.productType}</p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-4">
                                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Components</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">{record.components.length}</p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-4">
                                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Manufacturing Cost / Bag</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(record.manufacturingOverheadPerBag)}</p>
                                </div>
                              </div>
                              <div className="overflow-x-auto rounded-2xl border border-border">
                                <table className="min-w-full text-sm">
                                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                    <tr>
                                      <th className="px-4 py-3">Component Name</th>
                                      <th className="px-4 py-3">Component Type</th>
                                      <th className="px-4 py-3">Material</th>
                                      <th className="px-4 py-3">Key Dimensions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {record.components.length ? (
                                      record.components.map((component) => {
                                        const componentForm = createComponentForm({
                                          componentId: component.componentId,
                                          componentName: component.componentName,
                                          componentType: component.componentType,
                                          material: component.material,
                                          diameter:
                                            component.specifications.diameter === null ||
                                            component.specifications.diameter === undefined
                                              ? ""
                                              : String(component.specifications.diameter),
                                          length:
                                            component.specifications.length === null ||
                                            component.specifications.length === undefined
                                              ? ""
                                              : String(component.specifications.length),
                                        });

                                        return (
                                          <tr className="border-t border-border" key={component.componentId}>
                                            <td className="px-4 py-3 font-medium text-slate-900">{component.componentName}</td>
                                            <td className="px-4 py-3">{component.componentType || "-"}</td>
                                            <td className="px-4 py-3">{component.material || "-"}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{getKeyDimensions(componentForm)}</td>
                                          </tr>
                                        );
                                      })
                                    ) : (
                                      <tr>
                                        <td className="px-4 py-6 text-center text-muted-foreground" colSpan={4}>
                                          No product components defined.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Dialog
        description="Create a product and define its reusable components."
        open={open}
        onClose={() => {
          setOpen(false);
          setDrawerState(null);
        }}
        size="lg"
        title={editing ? "Edit Product" : "Add Product"}
      >
        <div className="relative">
          <form className="space-y-6" onSubmit={submit}>
            <section className="space-y-4 border-b border-border pb-5">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Basic Information</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set the core product details and default overhead values.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Product ID
                  <Input
                    required
                    value={form.productId}
                    onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))}
                  />
                </label>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Product Name
                  <Input
                    required
                    value={form.productName}
                    onChange={(event) => setForm((current) => ({ ...current, productName: event.target.value }))}
                  />
                </label>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Product Type
                  <Select
                    value={form.productType}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, productType: event.target.value as ProductType }))
                    }
                  >
                    {productTypes.map((productType) => (
                      <option key={productType} value={productType}>
                        {productType}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Manufacturing Cost
                  <Input
                    inputMode="decimal"
                    value={form.manufacturingOverheadPerBag}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, manufacturingOverheadPerBag: event.target.value }))
                    }
                  />
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                  <input
                    checked={form.active}
                    onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                    type="checkbox"
                  />
                  Active
                </label>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Components</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add components that make up this product. Click a component to edit its details.
                  </p>
                </div>
                <Button onClick={openAddComponentDrawer} type="button">
                  <Plus className="h-4 w-4" />
                  Add Component
                </Button>
              </div>

              <div className="overflow-x-auto rounded-[1.25rem] border border-border">
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
                    {form.components.length ? (
                      form.components.map((component, index) => (
                        <tr className="border-t border-border" key={component.componentId}>
                          <td className="px-4 py-3 font-medium text-slate-900">{component.componentName || "-"}</td>
                          <td className="px-4 py-3">{component.componentType || "-"}</td>
                          <td className="px-4 py-3">{resolveMaterialLabel(component.material, materials) || "-"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{getKeyDimensions(component)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <Button
                                className="h-8 px-3"
                                onClick={() => openEditComponentDrawer(component, index)}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </Button>
                              <Button
                                className="h-8 px-3"
                                onClick={() => removeComponent(index)}
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
                        <td className="px-4 py-10 text-center text-muted-foreground" colSpan={5}>
                          No components added yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {error ? <p className="text-sm text-rose-600">{error}</p> : null}

            <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  setOpen(false);
                  setDrawerState(null);
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button className="w-full sm:w-auto" type="submit">{editing ? "Save Product" : "Save Product"}</Button>
            </div>
          </form>

          <ProductComponentDrawer
            accessories={accessories}
            materials={materials}
            onClose={() => setDrawerState(null)}
            onSave={saveComponent}
            state={drawerState}
          />
        </div>
      </Dialog>
    </div>
  );
};

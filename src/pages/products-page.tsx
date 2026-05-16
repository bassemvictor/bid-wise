import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";

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
import type { Material, Product, ProductComponent, ProductType } from "../../shared/types";

type SpecificationFormRow = {
  key: string;
  value: string;
};

type ProductComponentForm = {
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

type ProductForm = {
  productId: string;
  tenantId: string;
  productName: string;
  productType: ProductType;
  factoryOverheadPerBag: string;
  manufacturingOverheadPerBag: string;
  managementOverheadPerBag: string;
  components: ProductComponentForm[];
  active: boolean;
};

const productTypes: ProductType[] = ["Filter Bag", "Other"];
const componentTypeOptions = ["Bag Body", "Ring", "Thread", "Other"] as const;
type ComponentTypeOption = (typeof componentTypeOptions)[number];

const createComponentForm = (seed?: Partial<ProductComponentForm>): ProductComponentForm => ({
  componentId: seed?.componentId ?? crypto.randomUUID(),
  componentName: seed?.componentName ?? "",
  componentType: seed?.componentType ?? "",
  material: seed?.material ?? "",
  diameter: seed?.diameter ?? "",
  length: seed?.length ?? "",
  seamAllowanceMm: seed?.seamAllowanceMm ?? "",
  topBottomAllowanceMm: seed?.topBottomAllowanceMm ?? "",
  specificationRows: seed?.specificationRows ?? [],
});

const createComponentFromType = (componentType: ComponentTypeOption) => {
  if (componentType === "Bag Body") {
    return createComponentForm({
      componentName: "Bag Body",
      componentType,
    });
  }

  return createComponentForm({
    componentName: componentType === "Other" ? "" : componentType,
    componentType,
  });
};

const initialForm: ProductForm = {
  productId: "",
  tenantId: "alimex-demo",
  productName: "",
  productType: "Filter Bag",
  factoryOverheadPerBag: "",
  manufacturingOverheadPerBag: "",
  managementOverheadPerBag: "",
  components: [],
  active: true,
};

const isBagBody = (component: ProductComponentForm) =>
  component.componentName.trim().toLowerCase() === "bag body" ||
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
  factoryOverheadPerBag: record.factoryOverheadPerBag?.toString() ?? "",
  manufacturingOverheadPerBag: record.manufacturingOverheadPerBag?.toString() ?? "",
  managementOverheadPerBag: record.managementOverheadPerBag?.toString() ?? "",
  active: record.active,
  components: record.components.map((component) =>
    createComponentForm({
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
  };
};

export const ProductsPage = () => {
  const [records, setRecords] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(initialForm);
  const [error, setError] = useState("");
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [newComponentType, setNewComponentType] = useState<ComponentTypeOption>("Bag Body");

  const load = async () => {
    if (!isApiConfigured) {
      return;
    }

    try {
      const [products, materialItems] = await Promise.all([
        api.get<Product[]>("/products?tenantId=alimex-demo"),
        api.get<Material[]>("/materials?tenantId=alimex-demo"),
      ]);
      setRecords(products);
      setMaterials(materialItems.filter((item) => item.active));
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
    setNewComponentType("Bag Body");
    setError("");
  };

  const updateComponent = (index: number, patch: Partial<ProductComponentForm>) => {
    setForm((current) => ({
      ...current,
      components: current.components.map((component, componentIndex) =>
        componentIndex === index ? { ...component, ...patch } : component,
      ),
    }));
  };

  const addComponent = () => {
    setForm((current) => ({
      ...current,
      components: [...current.components, createComponentFromType(newComponentType)],
    }));
  };

  const removeComponent = (index: number) => {
    setForm((current) => ({
      ...current,
      components: current.components.filter((_, componentIndex) => componentIndex !== index),
    }));
  };

  const addSpecificationRow = (componentIndex: number) => {
    setForm((current) => ({
      ...current,
      components: current.components.map((component, index) =>
        index === componentIndex
          ? {
              ...component,
              specificationRows: [...component.specificationRows, { key: "", value: "" }],
            }
          : component,
      ),
    }));
  };

  const updateSpecificationRow = (componentIndex: number, rowIndex: number, patch: Partial<SpecificationFormRow>) => {
    setForm((current) => ({
      ...current,
      components: current.components.map((component, index) =>
        index === componentIndex
          ? {
              ...component,
              specificationRows: component.specificationRows.map((row, currentRowIndex) =>
                currentRowIndex === rowIndex ? { ...row, ...patch } : row,
              ),
            }
          : component,
      ),
    }));
  };

  const removeSpecificationRow = (componentIndex: number, rowIndex: number) => {
    setForm((current) => ({
      ...current,
      components: current.components.map((component, index) =>
        index === componentIndex
          ? {
              ...component,
              specificationRows: component.specificationRows.filter((_, currentRowIndex) => currentRowIndex !== rowIndex),
            }
          : component,
      ),
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
      factoryOverheadPerBag:
        form.factoryOverheadPerBag.trim() === "" ? null : Number(form.factoryOverheadPerBag),
      manufacturingOverheadPerBag:
        form.manufacturingOverheadPerBag.trim() === "" ? null : Number(form.manufacturingOverheadPerBag),
      managementOverheadPerBag:
        form.managementOverheadPerBag.trim() === "" ? null : Number(form.managementOverheadPerBag),
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
        searchValue={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Components</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((record) => {
                  const expanded = expandedProductId === record.productId;

                  return (
                    <Fragment key={record.productId}>
                      <TableRow className="cursor-pointer hover:bg-slate-50" onClick={() => setExpandedProductId((current) => current === record.productId ? null : record.productId)}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            <div>
                              <p className="font-medium text-slate-900">{record.productName}</p>
                              <p className="text-xs text-muted-foreground">{record.productId}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{record.productType}</TableCell>
                        <TableCell>{record.components.length}</TableCell>
                        <TableCell><StatusBadge active={record.active} /></TableCell>
                        <TableCell className="space-x-2" onClick={(event) => event.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditing(record);
                              resetForm(toForm(record));
                              setOpen(true);
                            }}
                            type="button"
                          >
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void archive(record)} type="button">
                            {record.active ? "Archive" : "Delete"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-slate-50">
                            <div className="space-y-4 rounded-2xl border border-border bg-white p-4">
                              <div className="grid gap-4 md:grid-cols-3">
                                <div className="rounded-2xl bg-slate-50 p-4">
                                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Product ID</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">{record.productId}</p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-4">
                                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Product Name</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">{record.productName}</p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-4">
                                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Product Type</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">{record.productType}</p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-4">
                                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Factory Overhead / Bag</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">
                                    {record.factoryOverheadPerBag !== null && record.factoryOverheadPerBag !== undefined
                                      ? `${record.factoryOverheadPerBag.toFixed(2)} EGP`
                                      : "Not set"}
                                  </p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-4">
                                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Manufacturing Overhead / Bag</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">
                                    {record.manufacturingOverheadPerBag !== null && record.manufacturingOverheadPerBag !== undefined
                                      ? `${record.manufacturingOverheadPerBag.toFixed(2)} EGP`
                                      : "Not set"}
                                  </p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-4">
                                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Management Overhead / Bag</p>
                                  <p className="mt-2 text-sm font-semibold text-slate-900">
                                    {record.managementOverheadPerBag !== null && record.managementOverheadPerBag !== undefined
                                      ? `${record.managementOverheadPerBag.toFixed(2)} EGP`
                                      : "Not set"}
                                  </p>
                                </div>
                              </div>
                              <div className="overflow-x-auto rounded-2xl border border-border">
                                <table className="min-w-full text-sm">
                                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                    <tr>
                                      <th className="px-4 py-3">Component Name</th>
                                      <th className="px-4 py-3">Component Type</th>
                                      <th className="px-4 py-3">Material</th>
                                      <th className="px-4 py-3">Specifications</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {record.components.length ? record.components.map((component) => (
                                      <tr key={component.componentId} className="border-t border-border">
                                        <td className="px-4 py-3 font-medium text-slate-900">{component.componentName}</td>
                                        <td className="px-4 py-3">{component.componentType || "-"}</td>
                                        <td className="px-4 py-3">{component.material || "-"}</td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                          {Object.keys(component.specifications).length
                                            ? Object.entries(component.specifications).map(([key, value]) => `${key}: ${value ?? "-"}`).join(" • ")
                                            : "No specifications"}
                                        </td>
                                      </tr>
                                    )) : (
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
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Product" : "Add Product"}
        description="Create a product summary and define one or more reusable Product Components."
      >
        <form className="space-y-6" onSubmit={submit}>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Product ID
              <Input required value={form.productId} onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))} />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Product Name
              <Input required value={form.productName} onChange={(event) => setForm((current) => ({ ...current, productName: event.target.value }))} />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Product Type
              <Select
                required
                value={form.productType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    productType: event.target.value as ProductType,
                  }))
                }
              >
                {productTypes.map((productType) => (
                  <option key={productType} value={productType}>
                    {productType}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
              <input checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" />
              Active
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Factory Overhead / Bag (EGP)
              <Input
                inputMode="decimal"
                value={form.factoryOverheadPerBag}
                onChange={(event) =>
                  setForm((current) => ({ ...current, factoryOverheadPerBag: event.target.value }))
                }
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Manufacturing Overhead / Bag (EGP)
              <Input
                inputMode="decimal"
                value={form.manufacturingOverheadPerBag}
                onChange={(event) =>
                  setForm((current) => ({ ...current, manufacturingOverheadPerBag: event.target.value }))
                }
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Management Overhead / Bag (EGP)
              <Input
                inputMode="decimal"
                value={form.managementOverheadPerBag}
                onChange={(event) =>
                  setForm((current) => ({ ...current, managementOverheadPerBag: event.target.value }))
                }
              />
            </label>
          </div>

          <div className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Product Components</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add one or more structured components that make up this product.
                </p>
              </div>
              <div className="flex gap-3">
                <div className="min-w-44">
                  <Select value={newComponentType} onChange={(event) => setNewComponentType(event.target.value as ComponentTypeOption)}>
                    {componentTypeOptions.map((componentType) => (
                      <option key={componentType} value={componentType}>
                        {componentType}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button onClick={addComponent} type="button">
                  <Plus className="h-4 w-4" />
                  Add Component
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {form.components.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-muted-foreground">
                  No product components yet. Choose a component type and add one.
                </div>
              ) : null}
              {form.components.map((component, index) => {
                const bagBody = isBagBody(component);
                const sectionTitle =
                  component.componentType === "Bag Body"
                    ? "Bag Body Details"
                    : component.componentType === "Ring"
                      ? "Ring Details"
                      : component.componentType === "Thread"
                        ? "Thread Details"
                        : "Component Details";
                const sectionDescription =
                  component.componentType === "Bag Body"
                    ? "Define bag dimensions and the primary bag body material."
                    : component.componentType === "Ring"
                      ? "Capture reusable ring material and ring-specific specs."
                      : component.componentType === "Thread"
                        ? "Capture reusable thread material and thread-specific specs."
                        : "Capture flexible information for this custom product component.";

                return (
                  <div key={component.componentId} className="rounded-2xl border border-border bg-white p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {component.componentName || `Component ${index + 1}`}
                        </p>
                        <p className="text-xs text-muted-foreground">{sectionDescription}</p>
                      </div>
                      <Button onClick={() => removeComponent(index)} type="button" variant="ghost">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Component Name
                        <Input value={component.componentName} onChange={(event) => updateComponent(index, { componentName: event.target.value })} />
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Component Type
                        <Select
                          value={component.componentType}
                          onChange={(event) => {
                            const nextType = event.target.value as ComponentTypeOption;
                            updateComponent(index, {
                              componentType: nextType,
                              componentName:
                                component.componentName === "" ||
                                component.componentName === component.componentType
                                  ? nextType === "Other" ? "" : nextType
                                  : component.componentName,
                            });
                          }}
                        >
                          {componentTypeOptions.map((componentType) => (
                            <option key={componentType} value={componentType}>
                              {componentType}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Material
                        <Select value={component.material} onChange={(event) => updateComponent(index, { material: event.target.value })}>
                          <option value="">Select material</option>
                          {materials.map((material) => (
                            <option key={material.materialId} value={material.materialName}>
                              {material.materialName}
                            </option>
                          ))}
                        </Select>
                      </label>
                    </div>

                    <div className="mt-4 rounded-2xl border border-border bg-slate-50 p-4">
                      <div className="mb-3">
                        <p className="text-sm font-semibold text-slate-900">{sectionTitle}</p>
                        <p className="text-xs text-muted-foreground">{sectionDescription}</p>
                      </div>
                      {bagBody ? (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <label className="space-y-2 text-sm font-medium text-slate-700">
                            Diameter (m)
                            <Input inputMode="decimal" value={component.diameter} onChange={(event) => updateComponent(index, { diameter: event.target.value })} />
                          </label>
                          <label className="space-y-2 text-sm font-medium text-slate-700">
                            Length (m)
                            <Input inputMode="decimal" value={component.length} onChange={(event) => updateComponent(index, { length: event.target.value })} />
                          </label>
                          <label className="space-y-2 text-sm font-medium text-slate-700">
                            Material
                            <Input value={component.material} disabled />
                          </label>
                          <label className="space-y-2 text-sm font-medium text-slate-700">
                            Seam Allowance (m)
                            <Input
                              inputMode="decimal"
                              value={component.seamAllowanceMm}
                              onChange={(event) => updateComponent(index, { seamAllowanceMm: event.target.value })}
                            />
                          </label>
                          <label className="space-y-2 text-sm font-medium text-slate-700">
                            Top / Bottom Allowance (m)
                            <Input
                              inputMode="decimal"
                              value={component.topBottomAllowanceMm}
                              onChange={(event) => updateComponent(index, { topBottomAllowanceMm: event.target.value })}
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="rounded-xl bg-white px-4 py-3 text-sm text-muted-foreground">
                          Use the fields below to describe this component.
                        </div>
                      )}
                    </div>

                    <div className="mt-4 rounded-2xl border border-border bg-slate-50 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Specifications</p>
                          <p className="text-xs text-muted-foreground">Add flexible key-value specification fields.</p>
                        </div>
                        <Button onClick={() => addSpecificationRow(index)} type="button" variant="outline">
                          <Plus className="h-4 w-4" />
                          Add Field
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {component.specificationRows.length ? component.specificationRows.map((row, rowIndex) => (
                          <div key={`${component.componentId}-${rowIndex}`} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                            <Input value={row.key} placeholder="Specification name" onChange={(event) => updateSpecificationRow(index, rowIndex, { key: event.target.value })} />
                            <Input value={row.value} placeholder="Specification value" onChange={(event) => updateSpecificationRow(index, rowIndex, { value: event.target.value })} />
                            <Button onClick={() => removeSpecificationRow(index, rowIndex)} type="button" variant="ghost">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )) : (
                          <p className="text-sm text-muted-foreground">No extra specification fields added.</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">{editing ? "Save Changes" : "Create Product"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

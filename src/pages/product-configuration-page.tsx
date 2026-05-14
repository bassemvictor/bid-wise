import {
  ArrowLeft,
  ArrowRight,
  Box,
  Package,
  PencilRuler,
  Rows3,
  Save,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { TenderWorkflowStepper } from "../components/tenders/tender-workflow-stepper";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { api, ApiError, isApiConfigured } from "../lib/api";
import { cn } from "../lib/utils";
import type { Material, ProductConfiguration, TenderRequest } from "../../shared/types";

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
> & {
  quantity: string;
  bagDiameterMm: string;
  bagLengthMm: string;
  seamAllowanceMm: string;
  topBottomAllowanceMm: string;
  wearStripHeightMm: string;
  bagsPerCarton: string;
};

type ConfigTab = "bag-specifications" | "accessories" | "materials" | "packaging";

const tabs: Array<{ id: ConfigTab; label: string }> = [
  { id: "bag-specifications", label: "Bag Specifications" },
  { id: "accessories", label: "Accessories" },
  { id: "materials", label: "Materials" },
  { id: "packaging", label: "Packaging" },
];

const initialForm = (tenderId: string): ProductConfigurationForm => ({
  tenantId: "alimex-demo",
  tenderId,
  productConfigId: "base",
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

const toForm = (config: ProductConfiguration): ProductConfigurationForm => ({
  tenantId: config.tenantId,
  tenderId: config.tenderId,
  productConfigId: config.productConfigId,
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

const requiredFields: Array<keyof ProductConfigurationForm> = [
  "productType",
  "quantity",
  "bagDiameterMm",
  "bagLengthMm",
  "topDesign",
  "bottomDesign",
  "seamType",
  "mainFabricMaterialId",
  "threadMaterialId",
  "packagingType",
];

const VisualDiagram = ({
  diameter,
  length,
  allowance,
}: {
  diameter: string;
  length: string;
  allowance: string;
}) => (
  <div className="rounded-[1.25rem] border border-dashed border-border bg-slate-50 p-5">
    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-800">
      <PencilRuler className="h-4 w-4 text-primary" />
      Filter Bag Diagram Placeholder
    </div>
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="flex items-center justify-center rounded-3xl bg-white p-4">
        <svg viewBox="0 0 180 260" className="h-56 w-full max-w-[180px]">
          <defs>
            <linearGradient id="bagBody" x1="0%" x2="100%">
              <stop offset="0%" stopColor="#dbeafe" />
              <stop offset="100%" stopColor="#93c5fd" />
            </linearGradient>
          </defs>
          <ellipse cx="90" cy="42" rx="50" ry="20" fill="#bfdbfe" stroke="#2563eb" strokeWidth="2" />
          <rect x="40" y="42" width="100" height="150" rx="18" fill="url(#bagBody)" stroke="#2563eb" strokeWidth="2" />
          <ellipse cx="90" cy="192" rx="50" ry="20" fill="#93c5fd" stroke="#2563eb" strokeWidth="2" />
          <line x1="25" y1="42" x2="25" y2="192" stroke="#0f172a" strokeDasharray="4 4" />
          <line x1="40" y1="20" x2="140" y2="20" stroke="#0f172a" strokeDasharray="4 4" />
          <line x1="150" y1="42" x2="150" y2="70" stroke="#0f172a" strokeDasharray="4 4" />
          <line x1="150" y1="164" x2="150" y2="192" stroke="#0f172a" strokeDasharray="4 4" />
          <text x="90" y="15" textAnchor="middle" fontSize="10" fill="#0f172a">Diameter</text>
          <text x="10" y="120" fontSize="10" fill="#0f172a" transform="rotate(-90 10 120)">Length</text>
          <text x="154" y="60" fontSize="9" fill="#0f172a">Top</text>
          <text x="154" y="72" fontSize="9" fill="#0f172a">Allowance</text>
          <text x="154" y="178" fontSize="9" fill="#0f172a">Bottom</text>
          <text x="154" y="190" fontSize="9" fill="#0f172a">Allowance</text>
          <text x="90" y="228" textAnchor="middle" fontSize="10" fill="#0f172a">Cutting Width</text>
        </svg>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: "Diameter", value: diameter || "Not set" },
          { label: "Length", value: length || "Not set" },
          { label: "Top Allowance", value: allowance || "Not set" },
          { label: "Bottom Allowance", value: allowance || "Not set" },
          { label: "Cutting Width", value: diameter ? `${diameter} + seam allowance` : "Derived later" },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-border bg-white p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const ProductConfigurationPage = () => {
  const navigate = useNavigate();
  const { tenderId = "" } = useParams();
  const [activeTab, setActiveTab] = useState<ConfigTab>("bag-specifications");
  const [form, setForm] = useState<ProductConfigurationForm>(() => initialForm(tenderId));
  const [materials, setMaterials] = useState<Material[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [saveMode, setSaveMode] = useState<"draft" | "continue" | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ProductConfigurationForm, string>>>({});

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
        const [loadedMaterials, config] = await Promise.all([
          api.get<Material[]>("/materials?tenantId=alimex-demo"),
          api.get<ProductConfiguration>(
            `/tenders/${tenderId}/product-configuration?tenantId=alimex-demo`,
          ),
        ]);

        if (isMounted) {
          setMaterials(loadedMaterials.filter((item) => item.active));
          setForm(toForm(config));
        }
      } catch (reason) {
        if (
          reason instanceof ApiError &&
          reason.status === 404
        ) {
          try {
            const [loadedMaterials, tender] = await Promise.all([
              api.get<Material[]>("/materials?tenantId=alimex-demo"),
              api.get<TenderRequest>(`/tenders/${tenderId}?tenantId=alimex-demo`),
            ]);

            if (isMounted) {
              setMaterials(loadedMaterials.filter((item) => item.active));
              setForm((current) => ({
                ...current,
                bagDiameterMm: tender.bagDiameterMm?.toString() ?? "",
                bagLengthMm: tender.bagLengthMm?.toString() ?? "",
                topDesign: tender.topDesign,
                bottomDesign: tender.bottomDesign,
                accessoriesMaterialId: tender.accessoriesMaterial,
              }));
            }
          } catch {
            if (isMounted) {
              setError("No product configuration exists yet. Start by saving a draft.");
            }
          }
        } else if (isMounted) {
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

  const updateField = <K extends keyof ProductConfigurationForm>(key: K, value: ProductConfigurationForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const renderError = (field: keyof ProductConfigurationForm) =>
    fieldErrors[field] ? <p className="text-xs text-rose-600">{fieldErrors[field]}</p> : null;

  const validate = () => {
    const nextErrors: Partial<Record<keyof ProductConfigurationForm, string>> = {};

    for (const field of requiredFields) {
      if (String(form[field] ?? "").trim().length === 0) {
        nextErrors[field] = "This field is required.";
      }
    }

    if (form.includeWearStrip && form.wearStripHeightMm.trim().length === 0) {
      nextErrors.wearStripHeightMm = "Provide the wear strip height.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const payload = useMemo<ProductConfiguration>(
    () => ({
      entityType: "PRODUCT_CONFIGURATION",
      tenantId: form.tenantId,
      tenderId,
      productConfigId: form.productConfigId || "base",
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
      mainFabricMaterialId: form.mainFabricMaterialId.trim(),
      accessoriesMaterialId: form.accessoriesMaterialId.trim(),
      threadMaterialId: form.threadMaterialId.trim(),
      packagingType: form.packagingType.trim(),
      bagsPerCarton: numberOrNull(form.bagsPerCarton),
      packagingNotes: form.packagingNotes?.trim() ?? "",
      createdAt: "",
      updatedAt: "",
    }),
    [form, tenderId],
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
      setError("Complete the required configuration fields before continuing.");
      setSaveMode(null);
      return;
    }

    try {
      const response = await api.put<ProductConfiguration>(
        `/tenders/${tenderId}/product-configuration`,
        payload,
      );

      setForm(toForm(response));
      setMessage(
        mode === "draft"
          ? "Product configuration draft saved."
          : "Product configuration saved. Continuing to material roll calculation.",
      );

      if (mode === "continue") {
        navigate(`/tenders/${tenderId}/material-roll-calculation`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save product configuration.");
    } finally {
      setSaveMode(null);
    }
  };

  const summaryItems = [
    { label: "Product Type", value: form.productType || "Filter Bag" },
    { label: "Quantity", value: form.quantity || "Not set" },
    { label: "Diameter", value: form.bagDiameterMm || "Not set" },
    { label: "Length", value: form.bagLengthMm || "Not set" },
    { label: "Top Design", value: form.topDesign || "Not set" },
    { label: "Bottom Design", value: form.bottomDesign || "Not set" },
    { label: "Seam Type", value: form.seamType || "Not set" },
    { label: "Main Material", value: form.mainFabricMaterialId || "Not set" },
    { label: "Accessories Material", value: form.accessoriesMaterialId || "Not set" },
    { label: "Thread Material", value: form.threadMaterialId || "Not set" },
    { label: "Packaging", value: form.packagingType || "Not set" },
  ];

  return (
    <div className="space-y-6">
      <TenderWorkflowStepper currentStep={2} tenderId={tenderId} />

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Product Configuration</CardTitle>
                <CardDescription>
                  Configure the filter bag product that will be priced for this tender.
                </CardDescription>
              </div>
              <Badge variant="default">PRODUCT_CONFIGURATION</Badge>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-slate-50 p-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={cn(
                      "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-white hover:text-slate-900",
                    )}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {isLoading ? (
                <div className="rounded-2xl bg-slate-50 p-6 text-sm text-muted-foreground">
                  Loading product configuration...
                </div>
              ) : null}

              {!isLoading && activeTab === "bag-specifications" ? (
                <div className="space-y-6">
                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Product Type
                      <Input value={form.productType} onChange={(event) => updateField("productType", event.target.value)} />
                      {renderError("productType")}
                    </label>
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Quantity
                      <Input value={form.quantity} inputMode="numeric" onChange={(event) => updateField("quantity", event.target.value)} />
                      {renderError("quantity")}
                    </label>
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Bag Diameter (mm)
                      <Input value={form.bagDiameterMm} inputMode="decimal" onChange={(event) => updateField("bagDiameterMm", event.target.value)} />
                      {renderError("bagDiameterMm")}
                    </label>
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Bag Length (mm)
                      <Input value={form.bagLengthMm} inputMode="decimal" onChange={(event) => updateField("bagLengthMm", event.target.value)} />
                      {renderError("bagLengthMm")}
                    </label>
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Seam Allowance (mm)
                      <Input value={form.seamAllowanceMm} inputMode="decimal" onChange={(event) => updateField("seamAllowanceMm", event.target.value)} />
                    </label>
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Top / Bottom Allowance (mm)
                      <Input value={form.topBottomAllowanceMm} inputMode="decimal" onChange={(event) => updateField("topBottomAllowanceMm", event.target.value)} />
                    </label>
                  </div>
                  <VisualDiagram
                    diameter={form.bagDiameterMm}
                    length={form.bagLengthMm}
                    allowance={form.topBottomAllowanceMm}
                  />
                </div>
              ) : null}

              {!isLoading && activeTab === "accessories" ? (
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Top Design
                    <Input value={form.topDesign} onChange={(event) => updateField("topDesign", event.target.value)} />
                    {renderError("topDesign")}
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Bottom Design
                    <Input value={form.bottomDesign} onChange={(event) => updateField("bottomDesign", event.target.value)} />
                    {renderError("bottomDesign")}
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Seam Type
                    <Input value={form.seamType} onChange={(event) => updateField("seamType", event.target.value)} />
                    {renderError("seamType")}
                  </label>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 text-sm font-medium text-slate-700">
                      <Checkbox
                        checked={form.includeWearStrip}
                        onChange={(event) => updateField("includeWearStrip", event.target.checked)}
                      />
                      Include wear strip
                    </label>
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Wear Strip Height (mm)
                      <Input
                        value={form.wearStripHeightMm}
                        inputMode="decimal"
                        disabled={!form.includeWearStrip}
                        onChange={(event) => updateField("wearStripHeightMm", event.target.value)}
                      />
                      {renderError("wearStripHeightMm")}
                    </label>
                  </div>
                </div>
              ) : null}

              {!isLoading && activeTab === "materials" ? (
                <div className="grid gap-5">
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Main Fabric Material ID
                    <Select
                      value={form.mainFabricMaterialId}
                      onChange={(event) => updateField("mainFabricMaterialId", event.target.value)}
                    >
                      <option value="">Select main fabric material</option>
                      {materials.map((material) => (
                        <option key={material.materialId} value={material.materialId}>
                          {material.materialName} ({material.materialId})
                        </option>
                      ))}
                    </Select>
                    {renderError("mainFabricMaterialId")}
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Accessories Material ID
                    <Select
                      value={form.accessoriesMaterialId}
                      onChange={(event) => updateField("accessoriesMaterialId", event.target.value)}
                    >
                      <option value="">Select accessories material</option>
                      {materials.map((material) => (
                        <option key={material.materialId} value={material.materialId}>
                          {material.materialName} ({material.materialId})
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Thread Material ID
                    <Select
                      value={form.threadMaterialId}
                      onChange={(event) => updateField("threadMaterialId", event.target.value)}
                    >
                      <option value="">Select thread material</option>
                      {materials.map((material) => (
                        <option key={material.materialId} value={material.materialId}>
                          {material.materialName} ({material.materialId})
                        </option>
                      ))}
                    </Select>
                    {renderError("threadMaterialId")}
                  </label>
                </div>
              ) : null}

              {!isLoading && activeTab === "packaging" ? (
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Packaging Type
                    <Select value={form.packagingType} onChange={(event) => updateField("packagingType", event.target.value)}>
                      <option value="">Select packaging type</option>
                      <option value="carton">Carton</option>
                      <option value="bundle">Bundle</option>
                      <option value="palletized carton">Palletized Carton</option>
                    </Select>
                    {renderError("packagingType")}
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Bags Per Carton
                    <Input value={form.bagsPerCarton} inputMode="numeric" onChange={(event) => updateField("bagsPerCarton", event.target.value)} />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                    Packaging Notes
                    <Input value={form.packagingNotes ?? ""} onChange={(event) => updateField("packagingNotes", event.target.value)} />
                  </label>
                </div>
              ) : null}

              <div className="flex flex-col gap-4 rounded-[1.2rem] border border-border bg-white p-4 md:flex-row md:items-center md:justify-between">
                <div className="text-sm">
                  <p className="font-medium text-slate-900">Save the base product configuration before roll calculations.</p>
                  <p className="text-muted-foreground">Saving this section also updates the tender status to `PRODUCT_CONFIGURATION`.</p>
                  {message ? <p className="mt-2 text-emerald-600">{message}</p> : null}
                  {error ? <p className="mt-2 text-rose-600">{error}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="ghost" onClick={() => navigate(`/tenders/intake/${tenderId}`)}>
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

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Configuration Summary</CardTitle>
                <CardDescription>Live view of the base product configuration that will be priced.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {summaryItems.map((item) => (
                <div key={item.label} className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="text-right text-sm font-medium text-slate-900">{item.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Configuration Areas</CardTitle>
                <CardDescription>Each tab contributes inputs used in downstream costing.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { icon: Rows3, label: "Bag Specifications" },
                { icon: Package, label: "Accessories" },
                { icon: Box, label: "Materials" },
                { icon: Save, label: "Packaging" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3">
                    <div className="rounded-xl bg-blue-50 p-2 text-blue-700">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-medium text-slate-900">{item.label}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
};

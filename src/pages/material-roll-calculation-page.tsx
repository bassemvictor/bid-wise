import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Info,
  Package2,
  Ruler,
  Save,
  Scissors,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { TenderWorkflowStepper } from "../components/tenders/tender-workflow-stepper";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { api, ApiError, isApiConfigured } from "../lib/api";
import type { Material, ProductConfiguration, RollCalculation } from "../../shared/types";

type RollCalculationForm = Omit<
  RollCalculation,
  | "entityType"
  | "createdAt"
  | "updatedAt"
  | "bagDiameterMm"
  | "bagLengthMm"
  | "seamAllowanceMm"
  | "topBottomAllowanceMm"
  | "bagWidthMm"
  | "bagCuttingAreaM2"
  | "rollWidthM"
  | "rollLengthM"
  | "rollAreaM2"
  | "wastePercent"
  | "usableRollAreaM2"
  | "theoreticalBagsPerRoll"
  | "actualBagsPerRoll"
  | "actualAreaPerBagM2"
  | "totalFabricRequiredM2"
> & {
  bagDiameterMm: string;
  bagLengthMm: string;
  seamAllowanceMm: string;
  topBottomAllowanceMm: string;
  bagWidthMm: string;
  bagCuttingAreaM2: string;
  rollWidthM: string;
  rollLengthM: string;
  rollAreaM2: string;
  wastePercent: string;
  usableRollAreaM2: string;
  theoreticalBagsPerRoll: string;
  actualBagsPerRoll: string;
  actualAreaPerBagM2: string;
  totalFabricRequiredM2: string;
};

const initialForm = (tenderId: string): RollCalculationForm => ({
  tenantId: "alimex-demo",
  tenderId,
  productConfigId: "base",
  bagDiameterMm: "",
  bagLengthMm: "",
  seamAllowanceMm: "",
  topBottomAllowanceMm: "",
  bagWidthMm: "",
  bagCuttingAreaM2: "",
  rollWidthM: "",
  rollLengthM: "",
  rollAreaM2: "",
  wastePercent: "",
  usableRollAreaM2: "",
  theoreticalBagsPerRoll: "",
  actualBagsPerRoll: "",
  actualAreaPerBagM2: "",
  totalFabricRequiredM2: "",
});

const numberOrNull = (value: string) => {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatMetric = (value: number | null, digits = 3) =>
  value === null || !Number.isFinite(value) ? "Not calculated" : value.toFixed(digits);

const toForm = (payload: RollCalculation): RollCalculationForm => ({
  tenantId: payload.tenantId,
  tenderId: payload.tenderId,
  productConfigId: payload.productConfigId,
  bagDiameterMm: payload.bagDiameterMm?.toString() ?? "",
  bagLengthMm: payload.bagLengthMm?.toString() ?? "",
  seamAllowanceMm: payload.seamAllowanceMm?.toString() ?? "",
  topBottomAllowanceMm: payload.topBottomAllowanceMm?.toString() ?? "",
  bagWidthMm: payload.bagWidthMm?.toString() ?? "",
  bagCuttingAreaM2: payload.bagCuttingAreaM2?.toString() ?? "",
  rollWidthM: payload.rollWidthM?.toString() ?? "",
  rollLengthM: payload.rollLengthM?.toString() ?? "",
  rollAreaM2: payload.rollAreaM2?.toString() ?? "",
  wastePercent: payload.wastePercent?.toString() ?? "",
  usableRollAreaM2: payload.usableRollAreaM2?.toString() ?? "",
  theoreticalBagsPerRoll: payload.theoreticalBagsPerRoll?.toString() ?? "",
  actualBagsPerRoll: payload.actualBagsPerRoll?.toString() ?? "",
  actualAreaPerBagM2: payload.actualAreaPerBagM2?.toString() ?? "",
  totalFabricRequiredM2: payload.totalFabricRequiredM2?.toString() ?? "",
});

const requiredFields: Array<keyof RollCalculationForm> = [
  "bagDiameterMm",
  "bagLengthMm",
  "seamAllowanceMm",
  "topBottomAllowanceMm",
  "rollWidthM",
  "rollLengthM",
  "wastePercent",
];

const RollLayoutPlaceholder = ({
  actualBagsPerRoll,
}: {
  actualBagsPerRoll: number | null;
}) => (
  <div className="rounded-[1.25rem] border border-dashed border-border bg-slate-50 p-5">
    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-800">
      <Scissors className="h-4 w-4 text-primary" />
      Roll Layout Placeholder
    </div>
    <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
      <div className="rounded-3xl bg-white p-4">
        <svg viewBox="0 0 360 180" className="h-44 w-full">
          <rect x="20" y="24" width="320" height="132" rx="18" fill="#dbeafe" stroke="#2563eb" strokeWidth="2" />
          {Array.from({ length: 8 }).map((_, index) => (
            <rect
              key={index}
              x={35 + index * 38}
              y={40}
              width="28"
              height="98"
              rx="10"
              fill={index % 2 === 0 ? "#93c5fd" : "#bfdbfe"}
              stroke="#1d4ed8"
              strokeWidth="1.5"
            />
          ))}
          <text x="180" y="18" textAnchor="middle" fontSize="12" fill="#0f172a">
            Roll Width
          </text>
          <text x="180" y="170" textAnchor="middle" fontSize="12" fill="#0f172a">
            Bags Nested Along Roll Length
          </text>
        </svg>
      </div>
      <div className="grid gap-3">
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Layout Estimate</p>
          <p className="mt-2 text-sm font-medium text-slate-900">
            {actualBagsPerRoll === null ? "Pending roll data" : `${actualBagsPerRoll} actual bags per roll`}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 text-sm text-muted-foreground">
          This placeholder represents how bag cuts are nested into the available roll area after waste is applied.
        </div>
      </div>
    </div>
  </div>
);

export const MaterialRollCalculationPage = () => {
  const navigate = useNavigate();
  const { tenderId = "" } = useParams();
  const [form, setForm] = useState<RollCalculationForm>(() => initialForm(tenderId));
  const [quantity, setQuantity] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [saveMode, setSaveMode] = useState<"draft" | "continue" | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof RollCalculationForm, string>>>({});

  const bagDiameter = numberOrNull(form.bagDiameterMm);
  const bagLength = numberOrNull(form.bagLengthMm);
  const seamAllowance = numberOrNull(form.seamAllowanceMm);
  const topBottomAllowance = numberOrNull(form.topBottomAllowanceMm);
  const rollWidthM = numberOrNull(form.rollWidthM);
  const rollLengthM = numberOrNull(form.rollLengthM);
  const wastePercent = numberOrNull(form.wastePercent);

  const calculations = useMemo(() => {
    const bagWidthMm =
      bagDiameter !== null && seamAllowance !== null ? Math.PI * bagDiameter + seamAllowance : null;
    const bagCuttingAreaM2 =
      bagWidthMm !== null && bagLength !== null && topBottomAllowance !== null
        ? (bagWidthMm * (bagLength + topBottomAllowance)) / 1_000_000
        : null;
    const rollAreaM2 =
      rollWidthM !== null && rollLengthM !== null ? rollWidthM * rollLengthM : null;
    const usableRollAreaM2 =
      rollAreaM2 !== null && wastePercent !== null
        ? rollAreaM2 * (1 - wastePercent / 100)
        : null;
    const theoreticalBagsPerRoll =
      usableRollAreaM2 !== null && bagCuttingAreaM2 && bagCuttingAreaM2 > 0
        ? usableRollAreaM2 / bagCuttingAreaM2
        : null;
    const actualBagsPerRoll =
      theoreticalBagsPerRoll !== null && Number.isFinite(theoreticalBagsPerRoll)
        ? Math.floor(theoreticalBagsPerRoll)
        : null;
    const actualAreaPerBagM2 =
      rollAreaM2 !== null && actualBagsPerRoll !== null && actualBagsPerRoll > 0
        ? rollAreaM2 / actualBagsPerRoll
        : null;
    const totalFabricRequiredM2 =
      actualAreaPerBagM2 !== null && quantity !== null ? actualAreaPerBagM2 * quantity : null;

    return {
      bagWidthMm,
      bagCuttingAreaM2,
      rollAreaM2,
      usableRollAreaM2,
      theoreticalBagsPerRoll,
      actualBagsPerRoll,
      actualAreaPerBagM2,
      totalFabricRequiredM2,
    };
  }, [
    bagDiameter,
    bagLength,
    seamAllowance,
    topBottomAllowance,
    rollWidthM,
    rollLengthM,
    wastePercent,
    quantity,
  ]);

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
        const [config, materials, rollCalc] = await Promise.all([
          api.get<ProductConfiguration>(`/tenders/${tenderId}/product-configuration?tenantId=alimex-demo`),
          api.get<Material[]>("/materials?tenantId=alimex-demo"),
          api
            .get<RollCalculation>(`/tenders/${tenderId}/roll-calculation?tenantId=alimex-demo`)
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

        setQuantity(config.quantity);

        const selectedMaterial = materials.find(
          (material) =>
            material.active &&
            material.materialId === config.mainFabricMaterialId &&
            material.category === "FabricMaterial",
        );

        if (rollCalc) {
          setForm(toForm(rollCalc));
          return;
        }

        setForm((current) => ({
          ...current,
          productConfigId: config.productConfigId,
          bagDiameterMm: config.bagDiameterMm?.toString() ?? "",
          bagLengthMm: config.bagLengthMm?.toString() ?? "",
          seamAllowanceMm: config.seamAllowanceMm?.toString() ?? "",
          topBottomAllowanceMm: config.topBottomAllowanceMm?.toString() ?? "",
          rollWidthM: selectedMaterial?.rollWidthM?.toString() ?? "",
          rollLengthM: selectedMaterial?.rollLengthM?.toString() ?? "",
        }));
      } catch (reason) {
        if (isMounted) {
          setError(reason instanceof Error ? reason.message : "Unable to load calculation inputs.");
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

  const updateField = <K extends keyof RollCalculationForm>(key: K, value: RollCalculationForm[K]) => {
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

  const renderError = (field: keyof RollCalculationForm) =>
    fieldErrors[field] ? <p className="text-xs text-rose-600">{fieldErrors[field]}</p> : null;

  const validate = () => {
    const nextErrors: Partial<Record<keyof RollCalculationForm, string>> = {};

    for (const field of requiredFields) {
      if (String(form[field] ?? "").trim().length === 0) {
        nextErrors[field] = "This field is required.";
      }
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const payload = useMemo<RollCalculation>(
    () => ({
      entityType: "ROLL_CALCULATION",
      tenantId: form.tenantId,
      tenderId,
      productConfigId: form.productConfigId || "base",
      bagDiameterMm: bagDiameter,
      bagLengthMm: bagLength,
      seamAllowanceMm: seamAllowance,
      topBottomAllowanceMm: topBottomAllowance,
      bagWidthMm: calculations.bagWidthMm,
      bagCuttingAreaM2: calculations.bagCuttingAreaM2,
      rollWidthM,
      rollLengthM,
      rollAreaM2: calculations.rollAreaM2,
      wastePercent,
      usableRollAreaM2: calculations.usableRollAreaM2,
      theoreticalBagsPerRoll: calculations.theoreticalBagsPerRoll,
      actualBagsPerRoll: calculations.actualBagsPerRoll,
      actualAreaPerBagM2: calculations.actualAreaPerBagM2,
      totalFabricRequiredM2: calculations.totalFabricRequiredM2,
      createdAt: "",
      updatedAt: "",
    }),
    [
      form.tenantId,
      form.productConfigId,
      tenderId,
      bagDiameter,
      bagLength,
      seamAllowance,
      topBottomAllowance,
      calculations,
      rollWidthM,
      rollLengthM,
      wastePercent,
    ],
  );

  const save = async (mode: "draft" | "continue") => {
    setMessage("");
    setError("");
    setSaveMode(mode);

    if (!isApiConfigured) {
      setError("Set VITE_API_BASE_URL before saving the roll calculation.");
      setSaveMode(null);
      return;
    }

    if (mode === "continue" && !validate()) {
      setError("Complete the required calculation inputs before continuing.");
      setSaveMode(null);
      return;
    }

    try {
      const response = await api.put<RollCalculation>(
        `/tenders/${tenderId}/roll-calculation`,
        payload,
      );

      setForm(toForm(response));
      setMessage(
        mode === "draft"
          ? "Material roll calculation saved."
          : "Material roll calculation saved. Continuing to material sourcing.",
      );

      if (mode === "continue") {
        navigate(`/tenders/${tenderId}/material-sourcing`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the roll calculation.");
    } finally {
      setSaveMode(null);
    }
  };

  const resultCards = [
    { label: "Bag Cutting Area", value: formatMetric(calculations.bagCuttingAreaM2), unit: "m²", icon: Scissors },
    { label: "Roll Area", value: formatMetric(calculations.rollAreaM2), unit: "m²", icon: Ruler },
    { label: "Usable Roll Area", value: formatMetric(calculations.usableRollAreaM2), unit: "m²", icon: Package2 },
    { label: "Actual Bags Per Roll", value: formatMetric(calculations.actualBagsPerRoll, 0), unit: "bags", icon: Calculator },
    { label: "Actual Area Per Bag", value: formatMetric(calculations.actualAreaPerBagM2), unit: "m²", icon: Calculator },
    { label: "Total Fabric Required", value: formatMetric(calculations.totalFabricRequiredM2), unit: "m²", icon: Package2 },
  ];

  return (
    <div className="space-y-6">
      <TenderWorkflowStepper currentStep={3} tenderId={tenderId} />

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Material & Roll Calculation</CardTitle>
                <CardDescription>
                  Calculate bag cutting area, roll utilization, bags per roll, and actual fabric area per bag.
                </CardDescription>
              </div>
              <Badge variant="default">MATERIAL_ROLL_CALCULATION</Badge>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="rounded-2xl bg-slate-50 p-6 text-sm text-muted-foreground">
                  Loading product configuration and roll calculation...
                </div>
              ) : null}

              {!isLoading ? (
                <>
                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Bag Area Calculation</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Dimensions are loaded from the saved product configuration and can be refined here.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <Scissors className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2">
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
                        {renderError("seamAllowanceMm")}
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Top / Bottom Allowance (mm)
                        <Input
                          value={form.topBottomAllowanceMm}
                          inputMode="decimal"
                          onChange={(event) => updateField("topBottomAllowanceMm", event.target.value)}
                        />
                        {renderError("topBottomAllowanceMm")}
                      </label>
                    </div>

                    <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                      <div className="flex items-start gap-3">
                        <Info className="mt-0.5 h-5 w-5 text-blue-700" />
                        <div className="text-sm text-blue-900">
                          <p className="font-semibold">Formula Explanation</p>
                          <p className="mt-2">
                            `bagWidthMm = π × diameter + seamAllowanceMm`
                          </p>
                          <p className="mt-1">
                            `bagCuttingAreaM2 = bagWidthMm × (bagLengthMm + topBottomAllowanceMm) / 1,000,000`
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Roll Details</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Capture the supply roll dimensions and process waste to determine usable output.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <Ruler className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="grid gap-5 md:grid-cols-3">
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Roll Width (m)
                        <Input value={form.rollWidthM} inputMode="decimal" onChange={(event) => updateField("rollWidthM", event.target.value)} />
                        {renderError("rollWidthM")}
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Roll Length (m)
                        <Input value={form.rollLengthM} inputMode="decimal" onChange={(event) => updateField("rollLengthM", event.target.value)} />
                        {renderError("rollLengthM")}
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Waste Percent
                        <Input value={form.wastePercent} inputMode="decimal" onChange={(event) => updateField("wastePercent", event.target.value)} />
                        {renderError("wastePercent")}
                      </label>
                    </div>
                  </section>

                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Results Summary</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Calculated metrics update live from the current inputs and saved product quantity.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <Calculator className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {resultCards.map((card) => {
                        const Icon = card.icon;

                        return (
                          <div key={card.label} className="rounded-2xl border border-border bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{card.label}</p>
                              <div className="rounded-xl bg-blue-50 p-2 text-blue-700">
                                <Icon className="h-4 w-4" />
                              </div>
                            </div>
                            <p className="mt-3 text-2xl font-semibold text-slate-900">{card.value}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{card.unit}</p>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <RollLayoutPlaceholder actualBagsPerRoll={calculations.actualBagsPerRoll} />
                </>
              ) : null}

              <div className="flex flex-col gap-4 rounded-[1.2rem] border border-border bg-white p-4 md:flex-row md:items-center md:justify-between">
                <div className="text-sm">
                  <p className="font-medium text-slate-900">Roll calculations convert bag geometry into usable fabric demand.</p>
                  <p className="text-muted-foreground">
                    Saving this section updates the tender status to `MATERIAL_ROLL_CALCULATION`.
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

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Calculation Snapshot</CardTitle>
                <CardDescription>Live summary of the dimensions and roll assumptions currently driving the results.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Product Config ID", value: form.productConfigId || "base" },
                { label: "Quantity", value: quantity?.toString() ?? "Not loaded" },
                { label: "Bag Width", value: formatMetric(calculations.bagWidthMm, 2) },
                { label: "Waste Percent", value: wastePercent !== null ? `${wastePercent.toFixed(2)}%` : "Not set" },
                { label: "Theoretical Bags / Roll", value: formatMetric(calculations.theoreticalBagsPerRoll, 2) },
              ].map((item) => (
                <div key={item.label} className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="text-right text-sm font-medium text-slate-900">{item.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
};

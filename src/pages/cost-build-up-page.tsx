import { ArrowLeft, ArrowRight, Calculator, CircleDollarSign, Package, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { TenderWorkflowStepper } from "../components/tenders/tender-workflow-stepper";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { api, ApiError, isApiConfigured } from "../lib/api";
import type {
  CostBuildUp,
  CostLine,
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
  | "costLines"
  | "totalMaterialCostPerBag"
  | "totalOperatingCostPerBag"
  | "totalAdditionalCostPerBag"
  | "totalCostPricePerBag"
  | "totalCostPriceForOrder"
> & {
  quantity: string;
  costLines: CostLineForm[];
  totalMaterialCostPerBag: string;
  totalOperatingCostPerBag: string;
  totalAdditionalCostPerBag: string;
  totalCostPricePerBag: string;
  totalCostPriceForOrder: string;
};

const chartColors = ["#2563eb", "#0f766e", "#f59e0b"];

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
    category: "Accessories",
    description: "Accessories added per bag.",
    calculationBasis: "Accessory consumption per bag",
    editable: true,
  },
  {
    code: "C",
    category: "Sewing Thread",
    description: "Thread usage for one bag.",
    calculationBasis: "Thread consumption per bag",
    editable: true,
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
    code: "E",
    category: "Direct Labour",
    description: "Production labour loaded per bag.",
    calculationBasis: "Labour minutes and rate per bag",
    editable: true,
  },
  {
    code: "F",
    category: "Factory Management",
    description: "Factory supervision and support cost allocation.",
    calculationBasis: "Factory management allocation",
    editable: true,
  },
  {
    code: "G",
    category: "Company Overhead",
    description: "Corporate overhead absorbed per bag.",
    calculationBasis: "Company overhead allocation",
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
    calculationBasis: "E + F + G + H",
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

const buildDefaultLines = (materialCostPerBagEgp: number | null) =>
  lineDefinitions.map((line) => ({
    ...line,
    costPerBag: line.code === "A" ? materialCostPerBagEgp : line.costPerBag ?? null,
  }));

const initialForm = (tenderId: string): CostBuildUpForm => ({
  tenantId: "alimex-demo",
  tenderId,
  productConfigId: "base",
  alternativeId: "base",
  quantity: "",
  currency: "EGP",
  costLines: buildDefaultLines(null).map((line) => ({
    ...line,
    costPerBag: line.costPerBag?.toString() ?? "",
  })),
  totalMaterialCostPerBag: "",
  totalOperatingCostPerBag: "",
  totalAdditionalCostPerBag: "",
  totalCostPricePerBag: "",
  totalCostPriceForOrder: "",
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

const mergeCostLines = (savedLines: CostLine[] | undefined, materialCostPerBagEgp: number | null): CostLineForm[] => {
  const defaults = buildDefaultLines(materialCostPerBagEgp);
  const savedByCode = new Map((savedLines ?? []).map((line) => [line.code, line]));

  return defaults.map((line) => {
    const saved = savedByCode.get(line.code);
    const costPerBag =
      line.code === "A"
        ? materialCostPerBagEgp
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

const toForm = (payload: CostBuildUp, materialCostPerBagEgp: number | null): CostBuildUpForm => ({
  tenantId: payload.tenantId,
  tenderId: payload.tenderId,
  productConfigId: payload.productConfigId,
  alternativeId: payload.alternativeId,
  quantity: payload.quantity?.toString() ?? "",
  currency: payload.currency,
  costLines: mergeCostLines(payload.costLines, materialCostPerBagEgp),
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
        const [loadedTender, loadedConfiguration, loadedRollCalculation, loadedMaterialSourcing, saved] =
          await Promise.all([
            api.get<TenderRequest>(`/tenders/${tenderId}?tenantId=alimex-demo`),
            api.get<ProductConfiguration>(`/tenders/${tenderId}/product-configuration?tenantId=alimex-demo`),
            api.get<RollCalculation>(`/tenders/${tenderId}/roll-calculation?tenantId=alimex-demo`),
            api.get<MaterialSourceSelection>(`/tenders/${tenderId}/material-sourcing?tenantId=alimex-demo`),
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

        const materialCostPerBag = loadedMaterialSourcing.materialCostPerBagEgp ?? null;
        if (saved) {
          setForm(toForm(saved, materialCostPerBag));
          return;
        }

        setForm({
          ...initialForm(tenderId),
          tenantId: loadedTender.tenantId,
          productConfigId: loadedConfiguration.productConfigId,
          quantity: loadedConfiguration.quantity?.toString() ?? "",
          costLines: mergeCostLines(undefined, materialCostPerBag),
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

  const calculatedLines = useMemo(() => {
    const editableByCode = new Map(
      form.costLines.map((line) => [line.code, { ...line, costPerBag: numberOrNull(line.costPerBag) }]),
    );

    const read = (code: string) => editableByCode.get(code)?.costPerBag ?? 0;
    const materialCostPerBag = read("A") + read("B") + read("C") + read("D");
    const operatingCostPerBag = read("E") + read("F") + read("G") + read("H");
    const additionalCostPerBag = read("I_RUSH") + read("J") + read("K");
    const totalCostPricePerBag = materialCostPerBag + operatingCostPerBag + additionalCostPerBag;
    const totalCostPriceForOrder =
      quantity !== null && Number.isFinite(quantity) ? totalCostPricePerBag * quantity : null;

    return form.costLines.map((line) => {
      let value = numberOrNull(line.costPerBag);

      if (line.code === "I_TOTAL") {
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
  }, [form.costLines, quantity]);

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

  const updateLineCost = (code: string, value: string) => {
    setForm((current) => ({
      ...current,
      costLines: current.costLines.map((line) =>
        line.code === code ? { ...line, costPerBag: value } : line,
      ),
    }));
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
    [form.tenantId, form.productConfigId, form.alternativeId, quantity, tenderId, productConfiguration, calculatedLines, totals],
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
      setForm(toForm(response, materialSourcing?.materialCostPerBagEgp ?? null));
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

  const summaryItems = [
    { label: "Tender Number", value: tender?.tenderNumber || "Not loaded" },
    { label: "Product", value: productConfiguration?.productType || "Not configured" },
    { label: "Material", value: tender?.requestedMaterial || materialSourcing?.materialId || "Not loaded" },
    {
      label: "Diameter",
      value:
        productConfiguration?.bagDiameterMm !== null && productConfiguration?.bagDiameterMm !== undefined
          ? `${productConfiguration.bagDiameterMm} mm`
          : "Not set",
    },
    {
      label: "Length",
      value:
        productConfiguration?.bagLengthMm !== null && productConfiguration?.bagLengthMm !== undefined
          ? `${productConfiguration.bagLengthMm} mm`
          : "Not set",
    },
    {
      label: "Quantity",
      value:
        productConfiguration?.quantity !== null && productConfiguration?.quantity !== undefined
          ? `${productConfiguration.quantity.toLocaleString()} bags`
          : "Not set",
    },
    { label: "Currency", value: form.currency },
    { label: "Costing Method", value: "Per Bag Standard Costing" },
  ];

  return (
    <div className="space-y-6">
      <TenderWorkflowStepper currentStep={5} tenderId={tenderId} />

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
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
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="rounded-2xl bg-slate-50 p-6 text-sm text-muted-foreground">
                  Loading tender, configuration, roll calculation, material sourcing, and saved cost build-up...
                </div>
              ) : null}

              {!isLoading ? (
                <>
                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Top Summary</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Costing context loaded from the previous workflow stages.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <Package className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {summaryItems.map((item) => (
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
                        <h3 className="text-base font-semibold text-slate-900">Cost Breakdown Per Bag</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Edit the supporting cost inputs and review the live percentage contribution of each line.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <Calculator className="h-5 w-5" />
                      </div>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cost Category</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Calculation Basis</TableHead>
                          <TableHead className="w-[160px]">Cost EGP</TableHead>
                          <TableHead>Percent of Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calculatedLines.map((line) => {
                          const isTotal = line.code.includes("TOTAL");
                          return (
                            <TableRow key={line.code} className={isTotal ? "bg-slate-100/80" : undefined}>
                              <TableCell className="font-medium text-slate-900">
                                <div>{line.category}</div>
                                <div className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                                  {line.code}
                                </div>
                              </TableCell>
                              <TableCell>{line.description}</TableCell>
                              <TableCell>{line.calculationBasis}</TableCell>
                              <TableCell>
                                {line.editable ? (
                                  <Input
                                    inputMode="decimal"
                                    value={form.costLines.find((item) => item.code === line.code)?.costPerBag ?? ""}
                                    onChange={(event) => updateLineCost(line.code, event.target.value)}
                                  />
                                ) : (
                                  <div className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-slate-700">
                                    {line.costPerBag === null ? "Calculated" : line.costPerBag.toFixed(2)}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>{line.percentOfTotal.toFixed(1)}%</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </section>

                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Cost Summary</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Review the rolled-up price per bag and the total cost for the full order quantity.
                        </p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <CircleDollarSign className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {[
                        {
                          label: "Total Material Cost / Bag",
                          value: formatMetric(totals.totalMaterialCostPerBag, 2, " EGP"),
                        },
                        {
                          label: "Total Operating Cost / Bag",
                          value: formatMetric(totals.totalOperatingCostPerBag, 2, " EGP"),
                        },
                        {
                          label: "Total Additional Cost / Bag",
                          value: formatMetric(totals.totalAdditionalCostPerBag, 2, " EGP"),
                        },
                        {
                          label: "Total Cost Price / Bag",
                          value: formatMetric(totals.totalCostPricePerBag, 2, " EGP"),
                        },
                        {
                          label: "Total Cost Price / Order",
                          value: formatMetric(totals.totalCostPriceForOrder, 2, " EGP"),
                        },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-border bg-white p-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                          <p className="mt-2 text-lg font-semibold text-slate-900">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4">
                      <h3 className="text-base font-semibold text-slate-900">Cost Distribution</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Visual share of material, operating, and additional cost within the total bag price.
                      </p>
                    </div>
                    <div className="grid gap-6 lg:grid-cols-[1fr_0.75fr]">
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
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cost Snapshot</CardTitle>
              <CardDescription>Live totals from the current cost build-up input set.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Material Sourcing / Bag", value: formatMetric(materialSourcing?.materialCostPerBagEgp ?? null, 2, " EGP") },
                { label: "Actual Area / Bag", value: formatMetric(rollCalculation?.actualAreaPerBagM2 ?? null, 4, " m²") },
                { label: "Quantity", value: quantity !== null ? `${quantity.toLocaleString()} bags` : "Not set" },
                { label: "Currency", value: form.currency },
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

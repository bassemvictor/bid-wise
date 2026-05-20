import {
  BriefcaseBusiness,
  CircleDollarSign,
  FileText,
  Truck,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { TenderWorkflowStepper } from "../components/tenders/tender-workflow-stepper";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { api, ApiError, isApiConfigured } from "../lib/api";
import type { Accessory, Customer, Material, TenderRequest, TenderRequestType } from "../../shared/types";

type TenderIntakeForm = Omit<
  TenderRequest,
  | "entityType"
  | "createdAt"
  | "updatedAt"
  | "bagDiameterMm"
  | "bagLengthMm"
  | "knownRequiredPrice"
  | "knownCompetitorPrice"
  | "customerCommissionPercent"
  | "exchangeRate"
  | "currencySafetyFactorPercent"
> & {
  bagDiameterMm: string;
  bagLengthMm: string;
  knownRequiredPrice: string;
  knownCompetitorPrice: string;
  customerCommissionPercent: string;
  exchangeRate: string;
  currencySafetyFactorPercent: string;
};

const initialState: TenderIntakeForm = {
  tenderId: "",
  tenantId: "alimex-demo",
  customerName: "",
  selectedProductIds: [],
  productSnapshots: [],
  tenderNumber: "",
  internalInquiryNumber: "",
  tenderDueDate: "",
  requestType: "inquiry",
  requestedMaterial: "",
  bagDiameterMm: "",
  bagLengthMm: "",
  topDesign: "",
  bottomDesign: "",
  accessoriesMaterial: "",
  requestedMaterialNotes: "",
  knownRequiredPrice: "",
  knownCompetitorPrice: "",
  customerCommissionPercent: "",
  exchangeRate: "",
  currencySafetyFactorPercent: "",
  priceNegotiationExpected: false,
  requestedDeliveryTime: "",
  deliveryPlace: "factory",
  assignedTo: "",
  archived: false,
  transportationRequired: false,
  installationRequired: false,
  notes: "",
  status: "DRAFT_INTAKE",
};

const requestTypeOptions: TenderRequestType[] = [
  "inquiry",
  "public tender",
  "budget offer",
  "limited tender",
  "direct order",
];

const requiredFields: Array<keyof TenderIntakeForm> = [
  "customerName",
  "tenderNumber",
  "internalInquiryNumber",
  "tenderDueDate",
  "requestType",
  "exchangeRate",
  "currencySafetyFactorPercent",
  "requestedDeliveryTime",
  "deliveryPlace",
];

const sectionCards = [
  {
    title: "Customer & Tender Information",
    description: "Capture the commercial entry point and reference identifiers for the opportunity.",
    icon: BriefcaseBusiness,
  },
  {
    title: "Currency and Rates",
    description: "Set the mandatory currency assumptions that feed downstream pricing.",
    icon: CircleDollarSign,
  },
  {
    title: "Commercial Information",
    description: "Document price signals and negotiation expectations before costing begins.",
    icon: CircleDollarSign,
  },
  {
    title: "Delivery Information",
    description: "Capture lead time, delivery location, and service requirements.",
    icon: Truck,
  },
  {
    title: "Notes",
    description: "Keep the tender context, assumptions, and clarifications together.",
    icon: FileText,
  },
] as const;

export const TenderIntakePage = () => {
  const navigate = useNavigate();
  const { tenderId } = useParams();
  const [form, setForm] = useState(initialState);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof TenderIntakeForm, string>>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saveMode, setSaveMode] = useState<"draft" | "next" | null>(null);

  useEffect(() => {
    if (!isApiConfigured) {
      return;
    }

    let isMounted = true;

    const loadMasterData = async () => {
      try {
        const [loadedCustomers, loadedMaterials, loadedAccessories] = await Promise.all([
          api.get<Customer[]>("/customers?tenantId=alimex-demo"),
          api.get<Material[]>("/materials?tenantId=alimex-demo"),
          api.get<Accessory[]>("/accessories?tenantId=alimex-demo"),
        ]);

        if (!isMounted) {
          return;
        }

        setCustomers(loadedCustomers.filter((item) => item.active));
        setMaterials(loadedMaterials.filter((item) => item.active));
        setAccessories(loadedAccessories.filter((item) => item.active));
      } catch (reason) {
        if (isMounted) {
          setError(reason instanceof Error ? reason.message : "Unable to load intake dropdown options.");
        }
      }
    };

    void loadMasterData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isApiConfigured || !tenderId) {
      return;
    }

    let isMounted = true;

    const load = async () => {
      try {
        const record = await api.get<TenderRequest>(`/tenders/${tenderId}?tenantId=alimex-demo`);

        if (!isMounted) {
          return;
        }

        setForm({
          tenderId: record.tenderId,
          tenantId: record.tenantId,
          customerName: record.customerName,
          selectedProductIds: record.selectedProductIds ?? [],
          productSnapshots: record.productSnapshots ?? [],
          tenderNumber: record.tenderNumber,
          internalInquiryNumber: record.internalInquiryNumber,
          tenderDueDate: record.tenderDueDate,
          requestType: record.requestType,
          requestedMaterial: record.requestedMaterial,
          bagDiameterMm: record.bagDiameterMm?.toString() ?? "",
          bagLengthMm: record.bagLengthMm?.toString() ?? "",
          topDesign: record.topDesign,
          bottomDesign: record.bottomDesign,
          accessoriesMaterial: record.accessoriesMaterial,
          requestedMaterialNotes: record.requestedMaterialNotes ?? "",
          knownRequiredPrice: record.knownRequiredPrice?.toString() ?? "",
          knownCompetitorPrice: record.knownCompetitorPrice?.toString() ?? "",
          customerCommissionPercent: record.customerCommissionPercent?.toString() ?? "",
          exchangeRate: record.exchangeRate?.toString() ?? "",
          currencySafetyFactorPercent: record.currencySafetyFactorPercent?.toString() ?? "",
          priceNegotiationExpected: record.priceNegotiationExpected,
          requestedDeliveryTime: record.requestedDeliveryTime,
          deliveryPlace: record.deliveryPlace,
          transportationRequired: record.transportationRequired,
          installationRequired: record.installationRequired,
          notes: record.notes ?? "",
          status: record.status,
          assignedTo: record.assignedTo ?? "",
          archived: record.archived ?? false,
        });
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 404) {
          setError("Tender not found.");
          return;
        }

        setError(reason instanceof Error ? reason.message : "Unable to load tender intake.");
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [tenderId]);

  const updateField = <K extends keyof TenderIntakeForm>(key: K, value: TenderIntakeForm[K]) => {
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

  const buildPayload = (status: TenderRequest["status"]): TenderRequest => ({
    entityType: "TENDER_REQUEST",
    tenantId: form.tenantId,
    tenderId: form.tenderId || crypto.randomUUID(),
    customerName: form.customerName.trim(),
    selectedProductIds: form.selectedProductIds,
    productSnapshots: form.productSnapshots.map((product) => ({
      ...product,
      components: product.components.map((component) => ({
        ...component,
        specifications: { ...component.specifications },
      })),
    })),
    tenderNumber: form.tenderNumber.trim(),
    internalInquiryNumber: form.internalInquiryNumber.trim(),
    tenderDueDate: form.tenderDueDate,
    requestType: form.requestType,
    requestedMaterial: form.requestedMaterial.trim(),
    bagDiameterMm: form.bagDiameterMm === "" ? null : Number(form.bagDiameterMm),
    bagLengthMm: form.bagLengthMm === "" ? null : Number(form.bagLengthMm),
    topDesign: form.topDesign.trim(),
    bottomDesign: form.bottomDesign.trim(),
    accessoriesMaterial: form.accessoriesMaterial.trim(),
    requestedMaterialNotes: form.requestedMaterialNotes?.trim() ?? "",
    knownRequiredPrice: form.knownRequiredPrice === "" ? null : Number(form.knownRequiredPrice),
    knownCompetitorPrice:
      form.knownCompetitorPrice === "" ? null : Number(form.knownCompetitorPrice),
    customerCommissionPercent:
      form.customerCommissionPercent === "" ? null : Number(form.customerCommissionPercent),
    exchangeRate: form.exchangeRate === "" ? null : Number(form.exchangeRate),
    currencySafetyFactorPercent:
      form.currencySafetyFactorPercent === "" ? null : Number(form.currencySafetyFactorPercent),
    priceNegotiationExpected: form.priceNegotiationExpected,
    requestedDeliveryTime: form.requestedDeliveryTime.trim(),
    deliveryPlace: form.deliveryPlace,
    assignedTo: form.assignedTo?.trim() ?? "",
    archived: form.archived ?? false,
    transportationRequired: form.transportationRequired,
    installationRequired: form.installationRequired,
    notes: form.notes?.trim() ?? "",
    status,
    createdAt: "",
    updatedAt: "",
  });

  const validateRequiredFields = () => {
    const nextErrors: Partial<Record<keyof TenderIntakeForm, string>> = {};

    for (const field of requiredFields) {
      if (String(form[field] ?? "").trim().length === 0) {
        nextErrors[field] = "This field is required.";
      }
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const persistTender = async (mode: "draft" | "next") => {
    setMessage("");
    setError("");
    setSaveMode(mode);

    if (!isApiConfigured) {
      setError("Set VITE_API_BASE_URL before submitting a tender intake.");
      setSaveMode(null);
      return;
    }

    if (mode === "next" && !validateRequiredFields()) {
      setError("Complete the required intake fields before moving to product configuration.");
      setSaveMode(null);
      return;
    }

    const targetStatus: TenderRequest["status"] =
      mode === "next" ? "PRODUCT_CONFIGURATION" : "DRAFT_INTAKE";

    try {
      const payload = buildPayload(targetStatus);
      const response = form.tenderId
        ? await api.put<TenderRequest>(`/tenders/${payload.tenderId}`, payload)
        : await api.post<TenderRequest>("/tenders", payload);

      setForm((current) => ({ ...current, tenderId: response.tenderId, status: response.status }));
      setMessage(
        mode === "draft" ? "Draft saved successfully." : "Tender intake saved and moved to product configuration.",
      );

      if (mode === "next") {
        navigate(`/tenders/${response.tenderId}/product-configuration`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to save tender intake.");
    } finally {
      setSaveMode(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await persistTender("next");
  };

  const renderFieldMessage = (field: keyof TenderIntakeForm) =>
    fieldErrors[field] ? <p className="text-xs text-rose-600">{fieldErrors[field]}</p> : null;

  return (
    <div className="space-y-6">
      <TenderWorkflowStepper currentStep={1} tenderId={form.tenderId || undefined} />

      <div>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Tender Intake</CardTitle>
            </div>
            <Badge variant="default">{form.status}</Badge>
          </CardHeader>
          <CardContent>
            <form className="grid gap-6" onSubmit={handleSubmit}>
              <div className="grid gap-6">
                <div className="grid gap-6">
                  <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{sectionCards[0].title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{sectionCards[0].description}</p>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                        <BriefcaseBusiness className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2">
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Customer Name *
                        <Select
                          value={form.customerName}
                          onChange={(event) => updateField("customerName", event.target.value)}
                        >
                          <option value="">Select a customer</option>
                          {customers.map((customer) => (
                            <option key={customer.customerId} value={customer.customerName}>
                              {customer.customerName}
                            </option>
                          ))}
                        </Select>
                        {renderFieldMessage("customerName")}
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Tender Number *
                        <Input
                          value={form.tenderNumber}
                          onChange={(event) => updateField("tenderNumber", event.target.value)}
                        />
                        {renderFieldMessage("tenderNumber")}
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Internal Inquiry Number *
                        <Input
                          value={form.internalInquiryNumber}
                          onChange={(event) => updateField("internalInquiryNumber", event.target.value)}
                        />
                        {renderFieldMessage("internalInquiryNumber")}
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700">
                        Tender Due Date *
                        <Input
                          type="date"
                          value={form.tenderDueDate}
                          onChange={(event) => updateField("tenderDueDate", event.target.value)}
                        />
                        {renderFieldMessage("tenderDueDate")}
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                        Request Type *
                        <Select
                          value={form.requestType}
                          onChange={(event) => updateField("requestType", event.target.value as TenderRequestType)}
                        >
                          {requestTypeOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Select>
                        {renderFieldMessage("requestType")}
                      </label>
                    </div>
                  </section>
                </div>

                <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{sectionCards[1].title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{sectionCards[1].description}</p>
                    </div>
                    <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                      <CircleDollarSign className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Exchange Rate *
                      <Input
                        inputMode="decimal"
                        value={form.exchangeRate}
                        onChange={(event) => updateField("exchangeRate", event.target.value)}
                      />
                      {renderFieldMessage("exchangeRate")}
                    </label>
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                        Currency Safety Factor % *
                        <Input
                          inputMode="decimal"
                          value={form.currencySafetyFactorPercent}
                          onChange={(event) =>
                            updateField("currencySafetyFactorPercent", event.target.value)
                          }
                        />
                        {renderFieldMessage("currencySafetyFactorPercent")}
                    </label>
                  </div>
                </section>

                <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{sectionCards[2].title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{sectionCards[2].description}</p>
                    </div>
                    <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                      <CircleDollarSign className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Known Required Price
                      <Input
                        inputMode="decimal"
                        value={form.knownRequiredPrice}
                        onChange={(event) => updateField("knownRequiredPrice", event.target.value)}
                      />
                    </label>
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Known Competitor Price
                      <Input
                        inputMode="decimal"
                        value={form.knownCompetitorPrice}
                        onChange={(event) => updateField("knownCompetitorPrice", event.target.value)}
                      />
                    </label>
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Customer Commission %
                      <Input
                        inputMode="decimal"
                        value={form.customerCommissionPercent}
                        onChange={(event) => updateField("customerCommissionPercent", event.target.value)}
                      />
                    </label>
                    <label className="flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 text-sm font-medium text-slate-700">
                      <Checkbox
                        checked={form.priceNegotiationExpected}
                        onChange={(event) =>
                          updateField("priceNegotiationExpected", event.target.checked)
                        }
                      />
                      Price negotiation expected
                    </label>
                  </div>
                </section>

                <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{sectionCards[4].title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{sectionCards[4].description}</p>
                    </div>
                    <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                      <Truck className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Requested Delivery Time *
                      <Input
                        type="date"
                        value={form.requestedDeliveryTime}
                        onChange={(event) => updateField("requestedDeliveryTime", event.target.value)}
                      />
                      {renderFieldMessage("requestedDeliveryTime")}
                    </label>
                    <label className="space-y-2 text-sm font-medium text-slate-700">
                      Delivery Place *
                      <Select
                        value={form.deliveryPlace}
                        onChange={(event) =>
                          updateField("deliveryPlace", event.target.value as TenderRequest["deliveryPlace"])
                        }
                      >
                        <option value="factory">factory</option>
                        <option value="customer facility">customer facility</option>
                      </Select>
                      {renderFieldMessage("deliveryPlace")}
                    </label>
                    <label className="flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 text-sm font-medium text-slate-700">
                      <Checkbox
                        checked={form.transportationRequired}
                        onChange={(event) => updateField("transportationRequired", event.target.checked)}
                      />
                      Transportation required
                    </label>
                    <label className="flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 text-sm font-medium text-slate-700">
                      <Checkbox
                        checked={form.installationRequired}
                        onChange={(event) => updateField("installationRequired", event.target.checked)}
                      />
                      Installation required
                    </label>
                  </div>
                </section>

                <section className="rounded-[1.25rem] border border-border bg-slate-50/80 p-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{sectionCards[3].title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{sectionCards[3].description}</p>
                    </div>
                    <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                      <FileText className="h-5 w-5" />
                    </div>
                  </div>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Notes
                    <Textarea value={form.notes ?? ""} onChange={(event) => updateField("notes", event.target.value)} />
                  </label>
                </section>
              </div>

              <div className="flex flex-col gap-4 rounded-[1.2rem] border border-border bg-white p-4 md:flex-row md:items-center md:justify-between">
                <div className="text-sm">
                  {message ? <p className="mt-2 text-emerald-600">{message}</p> : null}
                  {error ? <p className="mt-2 text-rose-600">{error}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    disabled={saveMode !== null}
                    onClick={() => void persistTender("draft")}
                    type="button"
                    variant="outline"
                  >
                    {saveMode === "draft" ? "Saving Draft..." : "Save Draft"}
                  </Button>
                  <Button disabled={saveMode !== null} type="submit">
                    {saveMode === "next" ? "Saving..." : "Save & Next"}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

    </div>
  );
};

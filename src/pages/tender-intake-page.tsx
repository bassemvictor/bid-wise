import { useState, type FormEvent } from "react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { api, isApiConfigured } from "../lib/api";
import type { TenderRequest } from "../../shared/types";

type TenderIntakeForm = Omit<TenderRequest, "entityType">;

const initialState: TenderIntakeForm = {
  tenderId: "",
  tenantId: "alimex-demo",
  title: "",
  customerName: "",
  status: "draft",
  dueDate: "",
  currency: "USD",
  owner: "",
  notes: "",
  createdAt: "",
  updatedAt: "",
};

export const TenderIntakePage = () => {
  const [form, setForm] = useState(initialState);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const updateField = <K extends keyof TenderIntakeForm>(key: K, value: TenderIntakeForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!isApiConfigured) {
      setError("Set VITE_API_BASE_URL before submitting a tender intake.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        ...form,
        tenderId: form.tenderId || crypto.randomUUID(),
        entityType: "TenderRequest" as const,
      };

      await api.post<TenderRequest>("/tenders", payload);
      setMessage("Tender intake saved.");
      setForm(initialState);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to save tender intake.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Create Tender Request</CardTitle>
            <CardDescription>Capture tender metadata without embedding sample records in the UI.</CardDescription>
          </div>
          <Badge>Tender Intake</Badge>
        </CardHeader>
        <CardContent>
          <form className="grid gap-5" onSubmit={handleSubmit}>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Tenant ID
                <Input value={form.tenantId} onChange={(event) => updateField("tenantId", event.target.value)} />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Tender ID
                <Input
                  placeholder="Optional. Auto-generated if empty."
                  value={form.tenderId}
                  onChange={(event) => updateField("tenderId", event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Tender Title
                <Input value={form.title} onChange={(event) => updateField("title", event.target.value)} required />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Customer Name
                <Input
                  value={form.customerName}
                  onChange={(event) => updateField("customerName", event.target.value)}
                  required
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Due Date
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => updateField("dueDate", event.target.value)}
                  required
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Currency
                <Input value={form.currency} onChange={(event) => updateField("currency", event.target.value)} required />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                Owner
                <Input value={form.owner} onChange={(event) => updateField("owner", event.target.value)} required />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                Notes
                <Textarea value={form.notes ?? ""} onChange={(event) => updateField("notes", event.target.value)} />
              </label>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="text-sm">
                {message ? <p className="text-emerald-600">{message}</p> : null}
                {error ? <p className="text-rose-600">{error}</p> : null}
              </div>
              <Button disabled={isSaving} type="submit">
                {isSaving ? "Saving..." : "Create Tender"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Workflow Snapshot</CardTitle>
              <CardDescription>Core tender stages already mapped into routed workspaces.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              "Product Configuration",
              "Material Roll Calculation",
              "Material Sourcing",
              "Cost Build-Up",
              "Alternatives",
              "Pricing Approval",
            ].map((item) => (
              <div key={item} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                {item}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>API Notes</CardTitle>
              <CardDescription>Frontend requests post to the Lambda API client layer in `src/lib/api.ts`.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>`POST /tenders` stores the base tender request.</p>
            <p>All business sample records stay out of the UI bundle.</p>
            <p>Development seeding is isolated to backend-only endpoints.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

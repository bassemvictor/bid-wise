import { useEffect, useMemo, useState, type FormEvent } from "react";

import { EmptyState } from "../components/master-data/empty-state";
import { MasterDataToolbar } from "../components/master-data/master-data-toolbar";
import { StatusBadge } from "../components/master-data/status-badge";
import { Dialog } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { api, isApiConfigured } from "../lib/api";
import type { Accessory } from "../../shared/types";

type AccessoryForm = Omit<Accessory, "entityType" | "createdAt" | "updatedAt" | "defaultCost"> & {
  defaultCost: string;
};

const initialForm: AccessoryForm = {
  accessoryId: "",
  tenantId: "alimex-demo",
  accessoryName: "",
  material: "",
  unit: "",
  defaultCost: "",
  active: true,
};

const toForm = (record: Accessory): AccessoryForm => ({
  accessoryId: record.accessoryId,
  tenantId: record.tenantId,
  accessoryName: record.accessoryName,
  material: record.material,
  unit: record.unit,
  defaultCost: record.defaultCost?.toString() ?? "",
  active: record.active,
});

export const AccessoriesPage = () => {
  const [records, setRecords] = useState<Accessory[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Accessory | null>(null);
  const [form, setForm] = useState<AccessoryForm>(initialForm);
  const [error, setError] = useState("");

  const load = async () => {
    if (!isApiConfigured) {
      return;
    }
    try {
      setRecords(await api.get<Accessory[]>("/accessories?tenantId=alimex-demo"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load accessories.");
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => records.filter((record) => {
    const matchesSearch = [record.accessoryId, record.accessoryName, record.material, record.unit]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" && record.active) || (statusFilter === "archived" && !record.active);
    return matchesSearch && matchesStatus;
  }), [records, search, statusFilter]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: Accessory = {
      entityType: "ACCESSORY",
      tenantId: form.tenantId,
      accessoryId: form.accessoryId || crypto.randomUUID(),
      accessoryName: form.accessoryName.trim(),
      material: form.material.trim(),
      unit: form.unit.trim(),
      defaultCost: form.defaultCost.trim() === "" ? null : Number(form.defaultCost),
      active: form.active,
      createdAt: "",
      updatedAt: "",
    };

    try {
      if (editing) {
        await api.put<Accessory>(`/accessories/${payload.accessoryId}`, payload);
      } else {
        await api.post<Accessory>("/accessories", payload);
      }
      setOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save accessory.");
    }
  };

  const archive = async (record: Accessory) => {
    try {
      await api.delete<Accessory>(`/accessories/${record.accessoryId}?tenantId=alimex-demo`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to archive accessory.");
    }
  };

  return (
    <div className="space-y-6">
      <MasterDataToolbar addLabel="Add Accessory" onAdd={() => { setEditing(null); setForm(initialForm); setOpen(true); }} searchValue={search} onSearchChange={setSearch} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Accessories</CardTitle>
            <CardDescription>Manage reusable accessory definitions and default costs.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState title="No accessories found" description="Create accessory master data to reuse in product configurations." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Accessory</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Default Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((record) => (
                  <TableRow key={record.accessoryId}>
                    <TableCell><p className="font-medium text-slate-900">{record.accessoryName}</p><p className="text-xs text-muted-foreground">{record.accessoryId}</p></TableCell>
                    <TableCell>{record.material}</TableCell>
                    <TableCell>{record.unit}</TableCell>
                    <TableCell>{record.defaultCost ?? "-"}</TableCell>
                    <TableCell><StatusBadge active={record.active} /></TableCell>
                    <TableCell className="space-x-2">
                      <Button size="sm" variant="ghost" type="button" onClick={() => { setEditing(record); setForm(toForm(record)); setOpen(true); }}>Edit</Button>
                      <Button size="sm" variant="outline" type="button" onClick={() => void archive(record)}>{record.active ? "Archive" : "Delete"}</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        </CardContent>
      </Card>
      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? "Edit Accessory" : "Add Accessory"} description="Manage reusable accessory master data.">
        <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <label className="space-y-2 text-sm font-medium text-slate-700">Accessory ID<Input value={form.accessoryId} onChange={(event) => setForm((c) => ({ ...c, accessoryId: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Accessory Name<Input required value={form.accessoryName} onChange={(event) => setForm((c) => ({ ...c, accessoryName: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Material<Input value={form.material} onChange={(event) => setForm((c) => ({ ...c, material: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Unit<Input value={form.unit} onChange={(event) => setForm((c) => ({ ...c, unit: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Default Cost<Input value={form.defaultCost} inputMode="decimal" onChange={(event) => setForm((c) => ({ ...c, defaultCost: event.target.value }))} /></label>
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"><input checked={form.active} onChange={(event) => setForm((c) => ({ ...c, active: event.target.checked }))} type="checkbox" />Active</label>
          <div className="md:col-span-2 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">{editing ? "Save Changes" : "Create Accessory"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

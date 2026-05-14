import { useEffect, useMemo, useState, type FormEvent } from "react";

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
import type { ImportPreset, Material, Supplier } from "../../shared/types";

type ImportPresetForm = Omit<
  ImportPreset,
  "entityType" | "createdAt" | "updatedAt" | "leadTimeDays" | "unitCostUsdPerM2"
> & {
  leadTimeDays: string;
  unitCostUsdPerM2: string;
};

const initialForm: ImportPresetForm = {
  importPresetId: "",
  tenantId: "alimex-demo",
  supplierId: "",
  materialId: "",
  leadTimeDays: "",
  unitCostUsdPerM2: "",
  active: true,
};

const toForm = (record: ImportPreset): ImportPresetForm => ({
  importPresetId: record.importPresetId,
  tenantId: record.tenantId,
  supplierId: record.supplierId,
  materialId: record.materialId,
  leadTimeDays: record.leadTimeDays?.toString() ?? "",
  unitCostUsdPerM2: record.unitCostUsdPerM2?.toString() ?? "",
  active: record.active,
});

export const ImportPresetsPage = () => {
  const [records, setRecords] = useState<ImportPreset[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ImportPreset | null>(null);
  const [form, setForm] = useState<ImportPresetForm>(initialForm);
  const [error, setError] = useState("");

  const load = async () => {
    if (!isApiConfigured) {
      return;
    }

    try {
      const [presetItems, materialItems, supplierItems] = await Promise.all([
        api.get<ImportPreset[]>("/import-presets?tenantId=alimex-demo"),
        api.get<Material[]>("/materials?tenantId=alimex-demo"),
        api.get<Supplier[]>("/suppliers?tenantId=alimex-demo"),
      ]);
      setRecords(presetItems);
      setMaterials(materialItems.filter((item) => item.active));
      setSuppliers(supplierItems.filter((item) => item.active));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load import presets.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const supplierMap = useMemo(
    () => Object.fromEntries(suppliers.map((supplier) => [supplier.supplierId, supplier.supplierName])),
    [suppliers],
  );

  const materialMap = useMemo(
    () => Object.fromEntries(materials.map((material) => [material.materialId, material.materialName])),
    [materials],
  );

  const filtered = useMemo(
    () =>
      records.filter((record) => {
        const supplierName = supplierMap[record.supplierId] ?? "";
        const materialName = materialMap[record.materialId] ?? "";
        const matchesSearch = [
          record.importPresetId,
          supplierName,
          materialName,
          record.leadTimeDays?.toString() ?? "",
          record.unitCostUsdPerM2?.toString() ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase());
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && record.active) ||
          (statusFilter === "archived" && !record.active);

        return matchesSearch && matchesStatus;
      }),
    [materialMap, records, search, statusFilter, supplierMap],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const payload: ImportPreset = {
      entityType: "IMPORT_PRESET",
      tenantId: form.tenantId,
      importPresetId: form.importPresetId || crypto.randomUUID(),
      supplierId: form.supplierId,
      materialId: form.materialId,
      leadTimeDays: form.leadTimeDays.trim() === "" ? null : Number(form.leadTimeDays),
      unitCostUsdPerM2: form.unitCostUsdPerM2.trim() === "" ? null : Number(form.unitCostUsdPerM2),
      active: form.active,
      createdAt: "",
      updatedAt: "",
    };

    try {
      if (editing) {
        await api.put<ImportPreset>(`/import-presets/${payload.importPresetId}`, payload);
      } else {
        await api.post<ImportPreset>("/import-presets", payload);
      }

      setOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save import preset.");
    }
  };

  const archive = async (record: ImportPreset) => {
    try {
      await api.delete<ImportPreset>(`/import-presets/${record.importPresetId}?tenantId=alimex-demo`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to archive import preset.");
    }
  };

  return (
    <div className="space-y-6">
      <MasterDataToolbar
        addLabel="Add Import Preset"
        onAdd={() => {
          setEditing(null);
          setForm(initialForm);
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
            <CardTitle>Import Presets</CardTitle>
            <CardDescription>Define supplier-material import defaults that can be loaded into material sourcing.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState
              title="No import presets found"
              description="Add an import preset to preload supplier cost and lead-time defaults during sourcing."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Preset</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Lead Time</TableHead>
                  <TableHead>Unit Cost USD/m²</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((record) => (
                  <TableRow key={record.importPresetId}>
                    <TableCell>
                      <p className="font-medium text-slate-900">{record.importPresetId}</p>
                      <p className="text-xs text-muted-foreground">Import sourcing preset</p>
                    </TableCell>
                    <TableCell>{supplierMap[record.supplierId] ?? record.supplierId ?? "-"}</TableCell>
                    <TableCell>{materialMap[record.materialId] ?? record.materialId ?? "-"}</TableCell>
                    <TableCell>{record.leadTimeDays !== null ? `${record.leadTimeDays} days` : "-"}</TableCell>
                    <TableCell>{record.unitCostUsdPerM2 !== null ? record.unitCostUsdPerM2.toFixed(3) : "-"}</TableCell>
                    <TableCell><StatusBadge active={record.active} /></TableCell>
                    <TableCell className="space-x-2">
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setEditing(record);
                          setForm(toForm(record));
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button size="sm" type="button" variant="outline" onClick={() => void archive(record)}>
                        {record.active ? "Archive" : "Delete"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        </CardContent>
      </Card>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Import Preset" : "Add Import Preset"}
        description="Choose the material and supplier, then store the default lead time and unit cost."
      >
        <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Preset ID
            <Input value={form.importPresetId} onChange={(event) => setForm((current) => ({ ...current, importPresetId: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Supplier
            <Select required value={form.supplierId} onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value }))}>
              <option value="">Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.supplierId} value={supplier.supplierId}>
                  {supplier.supplierName}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Material
            <Select required value={form.materialId} onChange={(event) => setForm((current) => ({ ...current, materialId: event.target.value }))}>
              <option value="">Select material</option>
              {materials.map((material) => (
                <option key={material.materialId} value={material.materialId}>
                  {material.materialName}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Lead Time (days)
            <Input inputMode="decimal" value={form.leadTimeDays} onChange={(event) => setForm((current) => ({ ...current, leadTimeDays: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Unit Cost USD / m²
            <Input inputMode="decimal" value={form.unitCostUsdPerM2} onChange={(event) => setForm((current) => ({ ...current, unitCostUsdPerM2: event.target.value }))} />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
            <input checked={form.active} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />
            Active
          </label>
          <div className="flex justify-end gap-3 md:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">{editing ? "Save Changes" : "Create Import Preset"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

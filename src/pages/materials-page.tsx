import { useEffect, useMemo, useState, type FormEvent } from "react";

import { EmptyState } from "../components/master-data/empty-state";
import { MasterDataToolbar } from "../components/master-data/master-data-toolbar";
import { StatusBadge } from "../components/master-data/status-badge";
import { Dialog } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { api, isApiConfigured } from "../lib/api";
import type { Material, MaterialCategory } from "../../shared/types";

type MaterialForm = Omit<Material, "entityType" | "createdAt" | "updatedAt" | "defaultWastePercent" | "rollWidthM" | "rollLengthM"> & {
  defaultWastePercent: string;
  rollWidthM: string;
  rollLengthM: string;
};

const materialCategories: MaterialCategory[] = ["FabricMaterial", "accessoriesMaterial", "threadMaterial"];

const initialForm: MaterialForm = {
  materialId: "",
  tenantId: "alimex-demo",
  materialName: "",
  category: "FabricMaterial",
  temperatureLimit: "",
  chemicalResistance: "",
  defaultWastePercent: "",
  rollWidthM: "",
  rollLengthM: "",
  active: true,
};

const toForm = (material: Material): MaterialForm => ({
  materialId: material.materialId,
  tenantId: material.tenantId,
  materialName: material.materialName,
  category: material.category,
  temperatureLimit: material.temperatureLimit,
  chemicalResistance: material.chemicalResistance,
  defaultWastePercent: material.defaultWastePercent?.toString() ?? "",
  rollWidthM: material.rollWidthM?.toString() ?? "",
  rollLengthM: material.rollLengthM?.toString() ?? "",
  active: material.active,
});

export const MaterialsPage = () => {
  const [records, setRecords] = useState<Material[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState<MaterialForm>(initialForm);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    if (!isApiConfigured) {
      return;
    }

    try {
      const response = await api.get<Material[]>("/materials?tenantId=alimex-demo");
      setRecords(response);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load materials.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    return records.filter((record) => {
      const matchesSearch =
        [record.materialId, record.materialName, record.category]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && record.active) ||
        (statusFilter === "archived" && !record.active);

      return matchesSearch && matchesStatus;
    });
  }, [records, search, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(initialForm);
    setMessage("");
    setError("");
    setOpen(true);
  };

  const openEdit = (record: Material) => {
    setEditing(record);
    setForm(toForm(record));
    setMessage("");
    setError("");
    setOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const payload: Material = {
      entityType: "MATERIAL",
      tenantId: form.tenantId,
      materialId: form.materialId || crypto.randomUUID(),
      materialName: form.materialName.trim(),
      category: form.category,
      temperatureLimit: form.temperatureLimit.trim(),
      chemicalResistance: form.chemicalResistance.trim(),
      defaultWastePercent:
        form.defaultWastePercent.trim() === "" ? null : Number(form.defaultWastePercent),
      rollWidthM: form.category === "FabricMaterial" && form.rollWidthM.trim() !== "" ? Number(form.rollWidthM) : null,
      rollLengthM: form.category === "FabricMaterial" && form.rollLengthM.trim() !== "" ? Number(form.rollLengthM) : null,
      active: form.active,
      createdAt: "",
      updatedAt: "",
    };

    try {
      if (editing) {
        await api.put<Material>(`/materials/${payload.materialId}`, payload);
      } else {
        await api.post<Material>("/materials", payload);
      }

      setMessage(editing ? "Material updated." : "Material created.");
      setOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save material.");
    }
  };

  const archive = async (record: Material) => {
    setError("");
    try {
      await api.delete<Material>(`/materials/${record.materialId}?tenantId=alimex-demo`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to archive material.");
    }
  };

  return (
    <div className="space-y-6">
      <MasterDataToolbar
        addLabel="Add Material"
        onAdd={openCreate}
        searchValue={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Materials</CardTitle>
            <CardDescription>Manage reusable fabric and media definitions used in tender pricing.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState
              title="No materials found"
              description="Add a material to start building reusable pricing inputs."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Roll</TableHead>
                  <TableHead>Waste %</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((record) => (
                  <TableRow key={record.materialId}>
                    <TableCell>
                      <p className="font-medium text-slate-900">{record.materialName}</p>
                      <p className="text-xs text-muted-foreground">{record.materialId}</p>
                    </TableCell>
                    <TableCell>{record.category}</TableCell>
                    <TableCell>
                      {record.category === "FabricMaterial"
                        ? `${record.rollWidthM ?? "-"} m x ${record.rollLengthM ?? "-"} m`
                        : "-"}
                    </TableCell>
                    <TableCell>{record.defaultWastePercent ?? "-"}</TableCell>
                    <TableCell><StatusBadge active={record.active} /></TableCell>
                    <TableCell className="space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(record)} type="button">Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => void archive(record)} type="button">
                        {record.active ? "Archive" : "Delete"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
          {message ? <p className="mt-4 text-sm text-emerald-600">{message}</p> : null}
        </CardContent>
      </Card>

      <Dialog
        description="Create or update reusable material master data."
        onClose={() => setOpen(false)}
        open={open}
        title={editing ? "Edit Material" : "Add Material"}
      >
        <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Material ID
            <Input value={form.materialId} onChange={(event) => setForm((current) => ({ ...current, materialId: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Material Name
            <Input value={form.materialName} onChange={(event) => setForm((current) => ({ ...current, materialName: event.target.value }))} required />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Category
            <Select
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  category: event.target.value as MaterialCategory,
                  rollWidthM: event.target.value === "FabricMaterial" ? current.rollWidthM : "",
                  rollLengthM: event.target.value === "FabricMaterial" ? current.rollLengthM : "",
                }))
              }
            >
              {materialCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Temperature Limit
            <Input value={form.temperatureLimit} onChange={(event) => setForm((current) => ({ ...current, temperatureLimit: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Chemical Resistance
            <Input value={form.chemicalResistance} onChange={(event) => setForm((current) => ({ ...current, chemicalResistance: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Default Waste %
            <Input value={form.defaultWastePercent} inputMode="decimal" onChange={(event) => setForm((current) => ({ ...current, defaultWastePercent: event.target.value }))} />
          </label>
          {form.category === "FabricMaterial" ? (
            <>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Roll Width (m)
                <Input value={form.rollWidthM} inputMode="decimal" onChange={(event) => setForm((current) => ({ ...current, rollWidthM: event.target.value }))} />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Roll Length (m)
                <Input value={form.rollLengthM} inputMode="decimal" onChange={(event) => setForm((current) => ({ ...current, rollLengthM: event.target.value }))} />
              </label>
            </>
          ) : null}
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
            <input checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" />
            Active
          </label>
          <div className="md:col-span-2 flex justify-end gap-3">
            <Button onClick={() => setOpen(false)} type="button" variant="outline">Cancel</Button>
            <Button type="submit">{editing ? "Save Changes" : "Create Material"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

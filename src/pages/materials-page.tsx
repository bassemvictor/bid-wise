import { Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import * as XLSX from "xlsx";

import { EmptyState } from "../components/master-data/empty-state";
import { MasterDataToolbar } from "../components/master-data/master-data-toolbar";
import { StatusBadge } from "../components/master-data/status-badge";
import { Dialog } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { api, isApiConfigured } from "../lib/api";
import type { Material, MaterialCategory } from "../../shared/types";

type MaterialForm = Omit<Material, "entityType" | "createdAt" | "updatedAt" | "defaultWastePercent" | "rollWidthM" | "rollLengthM"> & {
  defaultWastePercent: string;
  rollWidthM: string;
  rollLengthM: string;
};

type MaterialImportRow = Record<string, unknown>;

const materialCategories: MaterialCategory[] = ["Fabric Material", "Threading Material", "Ring Material"];

const materialCategoryLabels: Record<MaterialCategory, string> = {
  "Fabric Material": "Fabric Material",
  "Threading Material": "Threading Material",
  "Ring Material": "Ring Material",
};

const initialForm: MaterialForm = {
  materialId: "",
  tenantId: "alimex-demo",
  materialName: "",
  category: "Fabric Material",
  description: "",
  baseMaterial: "",
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
  description: material.description,
  baseMaterial: material.baseMaterial,
  defaultWastePercent: material.defaultWastePercent?.toString() ?? "",
  rollWidthM: material.rollWidthM?.toString() ?? "",
  rollLengthM: material.rollLengthM?.toString() ?? "",
  active: material.active,
});

const normalizeImportCell = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());

export const MaterialsPage = () => {
  const [records, setRecords] = useState<Material[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState<MaterialForm>(initialForm);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

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
        [record.materialId, record.materialName, record.category, record.baseMaterial, record.description]
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
      description: form.description.trim(),
      baseMaterial: form.baseMaterial.trim(),
      defaultWastePercent:
        form.defaultWastePercent.trim() === "" ? null : Number(form.defaultWastePercent),
      rollWidthM: form.category === "Fabric Material" && form.rollWidthM.trim() !== "" ? Number(form.rollWidthM) : null,
      rollLengthM: form.category === "Fabric Material" && form.rollLengthM.trim() !== "" ? Number(form.rollLengthM) : null,
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

  const triggerImportPicker = () => {
    setError("");
    setMessage("");
    importInputRef.current?.click();
  };

  const importMaterials = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!isApiConfigured) {
      setError("Set VITE_API_BASE_URL before importing materials.");
      return;
    }

    setError("");
    setMessage("");
    setIsImporting(true);

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const targetSheetName =
        workbook.SheetNames.find((name) => name.toLowerCase().includes("sheet1 (2)")) ??
        workbook.SheetNames[0];

      if (!targetSheetName) {
        throw new Error("The Excel file does not contain any sheets.");
      }

      const worksheet = workbook.Sheets[targetSheetName];
      const rows = XLSX.utils.sheet_to_json<MaterialImportRow>(worksheet, {
        defval: "",
        raw: false,
      });

      const existingById = new Map(records.map((record) => [record.materialId.trim().toLowerCase(), record]));
      const existingByName = new Map(records.map((record) => [record.materialName.trim().toLowerCase(), record]));

      const materialsToUpsert = rows
        .map((row) => {
          const importedName =
            normalizeImportCell(row["Matrial Name"]) ||
            normalizeImportCell(row["Material Name"]) ||
            normalizeImportCell(row.Name);
          const importedCode =
            normalizeImportCell(row["Our code"]) ||
            normalizeImportCell(row.Code);
          const materialId = importedCode || importedName;

          if (!materialId && !importedName) {
            return null;
          }

          const matchedExisting =
            (materialId && existingById.get(materialId.toLowerCase())) ||
            (importedName && existingByName.get(importedName.toLowerCase())) ||
            null;

          return {
            payload: {
              entityType: "MATERIAL" as const,
              tenantId: "alimex-demo",
              materialId: materialId || matchedExisting?.materialId || crypto.randomUUID(),
              materialName: importedName || materialId || matchedExisting?.materialName || "Unnamed Material",
              category: ((normalizeImportCell(row.Category) || matchedExisting?.category || "Fabric Material") as MaterialCategory),
              description:
                normalizeImportCell(row["Description "]) ||
                normalizeImportCell(row.Description) ||
                matchedExisting?.description ||
                "",
              baseMaterial:
                normalizeImportCell(row["Base Material"]) ||
                matchedExisting?.baseMaterial ||
                "",
              defaultWastePercent: matchedExisting?.defaultWastePercent ?? null,
              rollWidthM: matchedExisting?.rollWidthM ?? null,
              rollLengthM: matchedExisting?.rollLengthM ?? null,
              active: matchedExisting?.active ?? true,
              createdAt: "",
              updatedAt: "",
            } satisfies Material,
            isUpdate: Boolean(matchedExisting),
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (!materialsToUpsert.length) {
        throw new Error("No material rows were found in the Excel file.");
      }

      let createdCount = 0;
      let updatedCount = 0;

      for (const material of materialsToUpsert) {
        if (material.isUpdate) {
          await api.put<Material>(`/materials/${material.payload.materialId}`, material.payload);
          updatedCount += 1;
        } else {
          await api.post<Material>("/materials", material.payload);
          createdCount += 1;
        }
      }

      await load();
      setMessage(`Imported ${materialsToUpsert.length} materials from ${file.name}. Created ${createdCount}, updated ${updatedCount}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to import materials from Excel.");
    } finally {
      setIsImporting(false);
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
        actions={
          <>
            <input
              ref={importInputRef}
              accept=".xlsx,.xls"
              className="hidden"
              type="file"
              onChange={(event) => void importMaterials(event)}
            />
            <Button disabled={isImporting} type="button" variant="outline" onClick={triggerImportPicker}>
              <Upload className="h-4 w-4" />
              {isImporting ? "Importing..." : "Import Materials"}
            </Button>
          </>
        }
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
                  <TableHead>Base Material</TableHead>
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
                    <TableCell>{materialCategoryLabels[record.category]}</TableCell>
                    <TableCell>{record.baseMaterial || "-"}</TableCell>
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
                  rollWidthM: event.target.value === "Fabric Material" ? current.rollWidthM : "",
                  rollLengthM: event.target.value === "Fabric Material" ? current.rollLengthM : "",
                }))
              }
            >
              {materialCategories.map((category) => (
                <option key={category} value={category}>
                  {materialCategoryLabels[category]}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Base Material
            <Input value={form.baseMaterial} onChange={(event) => setForm((current) => ({ ...current, baseMaterial: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
            Description
            <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700 md:col-span-2">
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

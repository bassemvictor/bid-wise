import { Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import * as XLSX from "xlsx";

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

type ImportPresetSheetRow = Array<string | number | boolean | null | undefined>;

const toMillimeterInputValue = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }

  const millimeters = parsed * 1000;
  return Number.isInteger(millimeters) ? String(millimeters) : millimeters.toFixed(2).replace(/\.?0+$/, "");
};

const numberOrNullMillimeterInput = (value: string) => {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / 1000 : null;
};

const normalizeImportCell = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());

const parseImportMoney = (value: string) => {
  const normalized = value.replace(/US\$/gi, "").replace(/\$/g, "").replace(/,/g, "").trim();
  if (!normalized || normalized === "-") {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseImportNumber = (value: string) => {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized || normalized === "-") {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDimensionsToMeters = (value: string) => {
  const normalized = value.trim();
  if (!normalized || normalized === "-") {
    return {
      rollWidthM: null,
      rollLengthM: null,
    };
  }

  const [widthMmRaw, lengthMmRaw] = normalized.split(/x|×/i).map((entry) => entry.trim());
  const widthMm = Number(widthMmRaw);
  const lengthMm = Number(lengthMmRaw);

  return {
    rollWidthM: Number.isFinite(widthMm) ? widthMm / 1000 : null,
    rollLengthM: Number.isFinite(lengthMm) ? lengthMm / 1000 : null,
  };
};

const toPresetSlugPart = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

type ImportPresetForm = Omit<
  ImportPreset,
  | "entityType"
  | "createdAt"
  | "updatedAt"
  | "rollWidthM"
  | "rollLengthM"
  | "leadTimeDays"
  | "unitCostUsdPerM2"
  | "freightCostPerM2Egp"
  | "clearanceCostPerM2Egp"
  | "customsPercent"
  | "customsEstimate"
> & {
  rollWidthM: string;
  rollLengthM: string;
  leadTimeDays: string;
  unitCostUsdPerM2: string;
  freightCostPerM2Egp: string;
  clearanceCostPerM2Egp: string;
  customsPercent: string;
  customsEstimate: string;
};

const initialForm: ImportPresetForm = {
  importPresetId: "",
  tenantId: "alimex-demo",
  supplierId: "",
  materialId: "",
  rollWidthM: "",
  rollLengthM: "",
  leadTimeDays: "",
  unitCostUsdPerM2: "",
  freightCostPerM2Egp: "",
  clearanceCostPerM2Egp: "",
  customsPercent: "",
  customsEstimate: "",
  active: true,
};

const toForm = (record: ImportPreset): ImportPresetForm => ({
  importPresetId: record.importPresetId,
  tenantId: record.tenantId,
  supplierId: record.supplierId,
  materialId: record.materialId,
  rollWidthM: toMillimeterInputValue(record.rollWidthM),
  rollLengthM: toMillimeterInputValue(record.rollLengthM),
  leadTimeDays: record.leadTimeDays?.toString() ?? "",
  unitCostUsdPerM2: record.unitCostUsdPerM2?.toString() ?? "",
  freightCostPerM2Egp: record.freightCostPerM2Egp?.toString() ?? "",
  clearanceCostPerM2Egp: record.clearanceCostPerM2Egp?.toString() ?? "",
  customsPercent: record.customsPercent?.toString() ?? "",
  customsEstimate: record.customsEstimate?.toString() ?? "",
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
  const [message, setMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

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
          record.rollWidthM?.toString() ?? "",
          record.rollLengthM?.toString() ?? "",
          record.leadTimeDays?.toString() ?? "",
          record.unitCostUsdPerM2?.toString() ?? "",
          record.freightCostPerM2Egp?.toString() ?? "",
          record.clearanceCostPerM2Egp?.toString() ?? "",
          record.customsPercent?.toString() ?? "",
          record.customsEstimate?.toString() ?? "",
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
    setMessage("");

    const payload: ImportPreset = {
      entityType: "IMPORT_PRESET",
      tenantId: form.tenantId,
      importPresetId: form.importPresetId || crypto.randomUUID(),
      supplierId: form.supplierId,
      materialId: form.materialId,
      rollWidthM: numberOrNullMillimeterInput(form.rollWidthM),
      rollLengthM: numberOrNullMillimeterInput(form.rollLengthM),
      leadTimeDays: form.leadTimeDays.trim() === "" ? null : Number(form.leadTimeDays),
      unitCostUsdPerM2: form.unitCostUsdPerM2.trim() === "" ? null : Number(form.unitCostUsdPerM2),
      freightCostPerM2Egp: form.freightCostPerM2Egp.trim() === "" ? null : Number(form.freightCostPerM2Egp),
      clearanceCostPerM2Egp: form.clearanceCostPerM2Egp.trim() === "" ? null : Number(form.clearanceCostPerM2Egp),
      customsPercent: form.customsPercent.trim() === "" ? null : Number(form.customsPercent),
      customsEstimate: form.customsPercent.trim() === "" ? null : Number(form.customsPercent),
      active: form.active,
      createdAt: "",
      updatedAt: "",
    };

    try {
      if (editing) {
        await api.put<ImportPreset>(`/import-presets/${encodeURIComponent(payload.importPresetId)}`, payload);
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
      await api.delete<ImportPreset>(`/import-presets/${encodeURIComponent(record.importPresetId)}?tenantId=alimex-demo`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to archive import preset.");
    }
  };

  const triggerImportPicker = () => {
    setError("");
    setMessage("");
    importInputRef.current?.click();
  };

  const importPresetsFromWorkbook = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!isApiConfigured) {
      setError("Set VITE_API_BASE_URL before importing presets.");
      return;
    }

    setError("");
    setMessage("");
    setIsImporting(true);

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        throw new Error("The Excel file does not contain any sheets.");
      }

      const rows = XLSX.utils.sheet_to_json<ImportPresetSheetRow>(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
        raw: false,
      });

      if (rows.length < 3) {
        throw new Error("The import preset sheet needs at least two header rows and one data row.");
      }

      const supplierHeaderRow = rows[0] ?? [];
      const fieldHeaderRow = rows[1] ?? [];
      const dataRows = rows.slice(2);
      const maxColumnCount = Math.max(...rows.map((row) => row.length));

      const supplierById = new Map(suppliers.map((supplier) => [supplier.supplierId.trim().toLowerCase(), supplier]));
      const supplierByName = new Map(suppliers.map((supplier) => [supplier.supplierName.trim().toLowerCase(), supplier]));
      const materialById = new Map(materials.map((material) => [material.materialId.trim().toLowerCase(), material]));
      const materialByName = new Map(materials.map((material) => [material.materialName.trim().toLowerCase(), material]));
      const existingByPair = new Map(
        records.map((record) => [`${record.supplierId.trim().toLowerCase()}::${record.materialId.trim().toLowerCase()}`, record]),
      );

      const supplierGroups: Array<{
        supplierId: string;
        columns: Partial<Record<"price" | "customs" | "freight" | "clearance" | "dimensions", number>>;
      }> = [];

      let inheritedSupplierHeader = "";

      for (let columnIndex = 1; columnIndex < maxColumnCount; columnIndex += 1) {
        const headerValue = normalizeImportCell(supplierHeaderRow[columnIndex]);
        if (headerValue) {
          inheritedSupplierHeader = headerValue;
        }

        const supplierHeader = headerValue || inheritedSupplierHeader;
        if (!supplierHeader) {
          continue;
        }

        const matchedSupplier =
          supplierById.get(supplierHeader.toLowerCase()) ||
          supplierByName.get(supplierHeader.toLowerCase()) ||
          null;
        const supplierId = matchedSupplier?.supplierId || supplierHeader;
        const fieldLabel = normalizeImportCell(fieldHeaderRow[columnIndex]).toLowerCase();

        if (!fieldLabel) {
          continue;
        }

        const groupKey = supplierId.toLowerCase();
        let group = supplierGroups.find((entry) => entry.supplierId.toLowerCase() === groupKey);
        if (!group) {
          group = { supplierId, columns: {} };
          supplierGroups.push(group);
        }

        if (fieldLabel.includes("price")) {
          group.columns.price = columnIndex;
        } else if (fieldLabel.includes("custom")) {
          group.columns.customs = columnIndex;
        } else if (fieldLabel.includes("freight")) {
          group.columns.freight = columnIndex;
        } else if (fieldLabel.includes("clearance")) {
          group.columns.clearance = columnIndex;
        } else if (fieldLabel.includes("dimension")) {
          group.columns.dimensions = columnIndex;
        }
      }

      const presetsToUpsert: Array<{ payload: ImportPreset; isUpdate: boolean }> = [];

      for (const row of dataRows) {
        const materialCode = normalizeImportCell(row[0]);
        if (!materialCode) {
          continue;
        }

        const matchedMaterial =
          materialById.get(materialCode.toLowerCase()) ||
          materialByName.get(materialCode.toLowerCase()) ||
          null;
        const materialId = matchedMaterial?.materialId || materialCode;
        const materialCategory = matchedMaterial?.category ?? "Fabric Material";

        for (const group of supplierGroups) {
          const priceValue = group.columns.price !== undefined ? normalizeImportCell(row[group.columns.price]) : "";
          const unitCostUsdPerM2 = parseImportMoney(priceValue);

          if (unitCostUsdPerM2 === null) {
            continue;
          }

          const customsPercentValue =
            group.columns.customs !== undefined ? normalizeImportCell(row[group.columns.customs]) : "";
          const freightValue =
            group.columns.freight !== undefined ? normalizeImportCell(row[group.columns.freight]) : "";
          const clearanceValue =
            group.columns.clearance !== undefined ? normalizeImportCell(row[group.columns.clearance]) : "";
          const dimensionsValue =
            group.columns.dimensions !== undefined ? normalizeImportCell(row[group.columns.dimensions]) : "";

          const customsPercent = parseImportNumber(customsPercentValue);
          const freightCostPerM2Egp = parseImportNumber(freightValue);
          const clearanceCostPerM2Egp = parseImportNumber(clearanceValue);
          const { rollWidthM, rollLengthM } = parseDimensionsToMeters(dimensionsValue);
          const existing =
            existingByPair.get(`${group.supplierId.trim().toLowerCase()}::${materialId.trim().toLowerCase()}`) ?? null;
          const importPresetId =
            existing?.importPresetId ||
            `${toPresetSlugPart(group.supplierId)}-${toPresetSlugPart(materialId)}`;

          presetsToUpsert.push({
            payload: {
              entityType: "IMPORT_PRESET",
              tenantId: "alimex-demo",
              importPresetId,
              supplierId: group.supplierId,
              materialId,
              rollWidthM,
              rollLengthM,
              leadTimeDays: existing?.leadTimeDays ?? null,
              unitCostUsdPerM2,
              freightCostPerM2Egp,
              clearanceCostPerM2Egp,
              customsPercent,
              customsEstimate: customsPercent,
              active: existing?.active ?? true,
              createdAt: "",
              updatedAt: "",
            },
            isUpdate: Boolean(existing),
          });
        }
      }

      if (!presetsToUpsert.length) {
        throw new Error("No import preset rows were found in the Excel file.");
      }

      let createdCount = 0;
      let updatedCount = 0;

      for (const preset of presetsToUpsert) {
        if (preset.isUpdate) {
          await api.put<ImportPreset>(`/import-presets/${preset.payload.importPresetId}`, preset.payload);
          updatedCount += 1;
        } else {
          await api.post<ImportPreset>("/import-presets", preset.payload);
          createdCount += 1;
        }
      }

      await load();
      setMessage(`Imported ${presetsToUpsert.length} presets from ${file.name}. Created ${createdCount}, updated ${updatedCount}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to import presets from Excel.");
    } finally {
      setIsImporting(false);
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
        actions={
          <>
            <input
              ref={importInputRef}
              accept=".xlsx,.xls"
              className="hidden"
              type="file"
              onChange={(event) => void importPresetsFromWorkbook(event)}
            />
            <Button disabled={isImporting} type="button" variant="outline" onClick={triggerImportPicker}>
              <Upload className="h-4 w-4" />
              {isImporting ? "Importing..." : "Import Presets"}
            </Button>
          </>
        }
      />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Import</CardTitle>
            <CardDescription>
              Define import material presets by supplier, material, dimensions when needed, lead time, cost, freight, clearance, and customes percentage for fabric items.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState
              title="No import presets found"
              description="Add an import preset to preload supplier cost and lead-time defaults during sourcing."
            />
          ) : (
            <Table className="min-w-[1320px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Import Preset</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Roll Width (mm)</TableHead>
                  <TableHead className="text-right">Roll Length (mm)</TableHead>
                  <TableHead className="text-right">Lead Time</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Freight / m²</TableHead>
                  <TableHead className="text-right">Clearance / m²</TableHead>
                  <TableHead className="text-right">Customes %</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((record) => (
                  <TableRow key={record.importPresetId} className="[&>td]:align-middle">
                    <TableCell className="w-[280px]">
                      <p className="break-all font-medium leading-6 text-slate-900">{record.importPresetId}</p>
                      <p className="text-xs text-muted-foreground">Import material preset</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium text-slate-800">{supplierMap[record.supplierId] ?? record.supplierId ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium text-slate-800">{materialMap[record.materialId] ?? record.materialId ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-slate-800">{toMillimeterInputValue(record.rollWidthM) || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-slate-800">{toMillimeterInputValue(record.rollLengthM) || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{record.leadTimeDays !== null ? `${record.leadTimeDays} days` : "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {record.unitCostUsdPerM2 !== null
                        ? `${record.unitCostUsdPerM2.toFixed(3)} USD/m²`
                        : "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {record.customsEstimate !== null
                        ? (record.freightCostPerM2Egp ?? 0).toFixed(2)
                        : "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {record.customsEstimate !== null
                        ? (record.clearanceCostPerM2Egp ?? 0).toFixed(2)
                        : "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {record.customsPercent !== null
                        ? `${record.customsPercent.toFixed(2)}%`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <StatusBadge active={record.active} />
                      </div>
                    </TableCell>
                    <TableCell className="w-[180px]">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
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
                      </div>
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
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Import Preset" : "Add Import Preset"}
        description="Select the supplier and material, then capture roll dimensions and import cost inputs."
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
            <Select
              required
              value={form.materialId}
              onChange={(event) =>
                setForm((current) => {
                  const nextMaterialId = event.target.value;
                  return {
                    ...current,
                    materialId: nextMaterialId,
                  };
                })
              }
            >
              <option value="">Select material</option>
              {materials.map((material) => (
                <option key={material.materialId} value={material.materialId}>
                  {material.materialName}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Roll Width (mm)
            <Input inputMode="decimal" value={form.rollWidthM} onChange={(event) => setForm((current) => ({ ...current, rollWidthM: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Roll Length (mm)
            <Input inputMode="decimal" value={form.rollLengthM} onChange={(event) => setForm((current) => ({ ...current, rollLengthM: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Lead Time (days)
            <Input inputMode="decimal" value={form.leadTimeDays} onChange={(event) => setForm((current) => ({ ...current, leadTimeDays: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Unit Cost USD / m²
            <Input inputMode="decimal" value={form.unitCostUsdPerM2} onChange={(event) => setForm((current) => ({ ...current, unitCostUsdPerM2: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Freight / m²
            <Input inputMode="decimal" value={form.freightCostPerM2Egp} onChange={(event) => setForm((current) => ({ ...current, freightCostPerM2Egp: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Clearance / m²
            <Input inputMode="decimal" value={form.clearanceCostPerM2Egp} onChange={(event) => setForm((current) => ({ ...current, clearanceCostPerM2Egp: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Customes %
            <Input inputMode="decimal" value={form.customsPercent} onChange={(event) => setForm((current) => ({ ...current, customsPercent: event.target.value }))} />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
            <input checked={form.active} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />
            Active
          </label>
          <div className="flex flex-col-reverse gap-3 md:col-span-2 sm:flex-row sm:justify-end">
            <Button className="w-full sm:w-auto" type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="w-full sm:w-auto" type="submit">{editing ? "Save Changes" : "Create Import Preset"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

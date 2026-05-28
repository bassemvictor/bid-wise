import { Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import * as XLSX from "xlsx";

import { EmptyState } from "../components/master-data/empty-state";
import { MasterDataToolbar } from "../components/master-data/master-data-toolbar";
import { StatusBadge } from "../components/master-data/status-badge";
import { Dialog } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { api, isApiConfigured } from "../lib/api";
import { cn } from "../lib/utils";
import type { Accessory, AccessoryPriceItem } from "../../shared/types";

type AccessoryPriceItemForm = {
  key: string;
  price: string;
};

type AccessoryImportSheetRow = Array<string | number | boolean | null | undefined>;

type AccessoryForm = Omit<
  Accessory,
  "entityType" | "createdAt" | "updatedAt" | "pricingItems" | "totalPricePerBagEgp"
> & {
  pricingItems: AccessoryPriceItemForm[];
};

const initialForm: AccessoryForm = {
  accessoryId: "",
  tenantId: "alimex-demo",
  accessoryName: "",
  pricingItems: [],
  active: true,
};

const emptyPricingItem = (): AccessoryPriceItemForm => ({ key: "", price: "" });

const isValidPriceValue = (value: string) => value.trim() === "" || Number.isFinite(Number(value));
const normalizeImportCell = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());

const toForm = (record: Accessory): AccessoryForm => ({
  accessoryId: record.accessoryId,
  tenantId: record.tenantId,
  accessoryName: record.accessoryName,
  pricingItems: record.pricingItems.length
    ? record.pricingItems.map((item) => ({
        key: item.key,
        price: item.price?.toString() ?? "",
      }))
    : [],
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
  const [message, setMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

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

  const openCreate = () => {
    setEditing(null);
    setForm(initialForm);
    setError("");
    setMessage("");
    setOpen(true);
  };

  const openEdit = (record: Accessory) => {
    setEditing(record);
    setForm(toForm(record));
    setError("");
    setMessage("");
    setOpen(true);
  };

  const invalidPriceIndexes = useMemo(
    () =>
      form.pricingItems.reduce<number[]>((indexes, item, index) => {
        if (!isValidPriceValue(item.price)) {
          indexes.push(index);
        }
        return indexes;
      }, []),
    [form.pricingItems],
  );

  const totalPricePerBag = useMemo(() => {
    const pricingItemsTotal = form.pricingItems.reduce((sum, item) => {
      const parsed = item.price.trim() === "" ? 0 : Number(item.price);
      return Number.isFinite(parsed) ? sum + parsed : sum;
    }, 0);

    return pricingItemsTotal;
  }, [form.pricingItems]);

  const filtered = useMemo(() => records.filter((record) => {
    const matchesSearch = [
      record.accessoryId,
      record.accessoryName,
      record.totalPricePerBagEgp?.toString() ?? "",
      ...record.pricingItems.flatMap((item) => [item.key, item.price?.toString() ?? ""]),
    ]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" && record.active) || (statusFilter === "archived" && !record.active);
    return matchesSearch && matchesStatus;
  }), [records, search, statusFilter]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (invalidPriceIndexes.length > 0) {
      setError("Enter numeric values only in accessory price fields before saving.");
      return;
    }

    setError("");
    setMessage("");
    const payload: Accessory = {
      entityType: "ACCESSORY",
      tenantId: form.tenantId,
      accessoryId: form.accessoryId || crypto.randomUUID(),
      accessoryName: form.accessoryName.trim(),
      pricingItems: form.pricingItems
        .filter((item) => item.key.trim() || item.price.trim())
        .map<AccessoryPriceItem>((item) => ({
          key: item.key.trim(),
          price: item.price.trim() === "" ? null : Number(item.price),
        })),
      totalPricePerBagEgp: Number.isFinite(totalPricePerBag) ? totalPricePerBag : null,
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

  const triggerImportPicker = () => {
    setError("");
    setMessage("");
    importInputRef.current?.click();
  };

  const importAccessories = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!isApiConfigured) {
      setError("Set VITE_API_BASE_URL before importing accessories.");
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

      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<AccessoryImportSheetRow>(worksheet, {
        header: 1,
        defval: "",
        raw: false,
      });

      if (rows.length < 3) {
        throw new Error("The accessory sheet needs at least two header rows and one pricing row.");
      }

      const topHeaderRow = rows[0] ?? [];
      const secondHeaderRow = rows[1] ?? [];
      const pricingRows = rows.slice(2);
      const existingById = new Map(records.map((record) => [record.accessoryId.trim().toLowerCase(), record]));
      const existingByName = new Map(records.map((record) => [record.accessoryName.trim().toLowerCase(), record]));
      const maxColumnCount = Math.max(...rows.map((row) => row.length));
      let inheritedHeader = "";

      const accessoriesToUpsert: Array<{ payload: Accessory; isUpdate: boolean }> = [];

      for (let columnIndex = 1; columnIndex < maxColumnCount; columnIndex += 1) {
        const topHeaderValue = normalizeImportCell(topHeaderRow[columnIndex]);
        if (topHeaderValue) {
          inheritedHeader = topHeaderValue;
        }

        const accessoryCode = normalizeImportCell(secondHeaderRow[columnIndex]);
        const accessoryGroup = topHeaderValue || inheritedHeader;

        if (!accessoryCode && !accessoryGroup) {
          continue;
        }

        const accessoryName = [accessoryGroup, accessoryCode].filter(Boolean).join(" - ") || accessoryCode || accessoryGroup;
        const matchedExisting =
          (accessoryCode && existingById.get(accessoryCode.toLowerCase())) ||
          (accessoryName && existingByName.get(accessoryName.toLowerCase())) ||
          null;

        const pricingItems = pricingRows
          .map<AccessoryPriceItem | null>((row) => {
            const key = normalizeImportCell(row[0]);
            const rawPrice = normalizeImportCell(row[columnIndex]);

            if (!key || rawPrice === "") {
              return null;
            }

            const numericPrice = Number(rawPrice.replace(/,/g, ""));
            if (!Number.isFinite(numericPrice)) {
              throw new Error(`Invalid price "${rawPrice}" for ${accessoryName} → ${key}.`);
            }

            return {
              key,
              price: numericPrice,
            } satisfies AccessoryPriceItem;
          })
          .filter((item): item is AccessoryPriceItem => item !== null);

        const totalPricePerBagEgp = pricingItems.reduce((sum, item) => sum + (item.price ?? 0), 0);

        accessoriesToUpsert.push({
          payload: {
            entityType: "ACCESSORY",
            tenantId: "alimex-demo",
            accessoryId: accessoryCode || matchedExisting?.accessoryId || accessoryName || crypto.randomUUID(),
            accessoryName: accessoryName || matchedExisting?.accessoryName || accessoryCode || "Unnamed Accessory",
            pricingItems,
            totalPricePerBagEgp,
            active: matchedExisting?.active ?? true,
            createdAt: "",
            updatedAt: "",
          },
          isUpdate: Boolean(matchedExisting),
        });
      }

      if (!accessoriesToUpsert.length) {
        throw new Error("No accessory columns were found in the Excel file.");
      }

      let createdCount = 0;
      let updatedCount = 0;

      for (const accessory of accessoriesToUpsert) {
        if (accessory.isUpdate) {
          await api.put<Accessory>(`/accessories/${accessory.payload.accessoryId}`, accessory.payload);
          updatedCount += 1;
        } else {
          await api.post<Accessory>("/accessories", accessory.payload);
          createdCount += 1;
        }
      }

      await load();
      setMessage(
        `Imported ${accessoriesToUpsert.length} accessories from ${file.name}. Created ${createdCount}, updated ${updatedCount}.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to import accessories from Excel.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <MasterDataToolbar
        addLabel="Add Accessory"
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
              onChange={(event) => void importAccessories(event)}
            />
            <Button disabled={isImporting} type="button" variant="outline" onClick={triggerImportPicker}>
              <Upload className="h-4 w-4" />
              {isImporting ? "Importing..." : "Import Accessories"}
            </Button>
          </>
        }
      />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Accessories</CardTitle>
            <CardDescription>Manage reusable accessory definitions and per-bag pricing details.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState title="No accessories found" description="Create accessory master data to reuse in product configurations." />
          ) : (
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Accessory</TableHead>
                  <TableHead>Type / Category</TableHead>
                  <TableHead className="text-right">Total Price Per Bag (EGP)</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((record) => (
                  <TableRow key={record.accessoryId} className="[&>td]:align-middle">
                    <TableCell className="w-[280px]"><p className="font-medium text-slate-900">{record.accessoryName}</p><p className="text-xs text-muted-foreground">{record.accessoryId}</p></TableCell>
                    <TableCell>{record.pricingItems.map((item) => item.key).filter(Boolean).join(", ") || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{record.totalPricePerBagEgp !== null ? `${record.totalPricePerBagEgp.toFixed(2)} EGP` : "-"}</TableCell>
                    <TableCell className="text-center"><div className="flex justify-center"><StatusBadge active={record.active} /></div></TableCell>
                    <TableCell className="w-[180px]">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        <Button size="sm" variant="ghost" type="button" onClick={() => openEdit(record)}>Edit</Button>
                        <Button size="sm" variant="outline" type="button" onClick={() => void archive(record)}>{record.active ? "Archive" : "Delete"}</Button>
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
      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? "Edit Accessory" : "Add Accessory"} description="Manage reusable accessory master data.">
        <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <label className="space-y-2 text-sm font-medium text-slate-700">Accessory ID<Input value={form.accessoryId} onChange={(event) => setForm((c) => ({ ...c, accessoryId: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Accessory Name<Input required value={form.accessoryName} onChange={(event) => setForm((c) => ({ ...c, accessoryName: event.target.value }))} /></label>
          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-700">Pricing Items</p>
              <Button type="button" variant="outline" onClick={() => setForm((c) => ({ ...c, pricingItems: [...c.pricingItems, emptyPricingItem()] }))}>
                <Plus className="h-4 w-4" />
                Add Item
              </Button>
            </div>
            <div className="space-y-3">
              {form.pricingItems.map((item, index) => (
                <div key={index} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Type / Category
                    <Input
                      value={item.key}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          pricingItems: current.pricingItems.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, key: event.target.value } : entry,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    Price (EGP)
                    <Input
                      className={cn(
                        invalidPriceIndexes.includes(index) &&
                          "border-rose-200 bg-rose-50/20 text-slate-900 focus-visible:border-rose-500 focus-visible:ring-rose-200",
                      )}
                      min="0"
                      inputMode="decimal"
                      value={item.price}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          pricingItems: current.pricingItems.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, price: event.target.value } : entry,
                          ),
                        }))
                      }
                    />
                    {invalidPriceIndexes.includes(index) ? (
                      <p className="text-xs text-rose-600">Enter a valid number.</p>
                    ) : null}
                  </label>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          pricingItems:
                            current.pricingItems.filter((_, entryIndex) => entryIndex !== index),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <label className="space-y-2 text-sm font-medium text-slate-700">Total Price per Bag (EGP)<Input value={totalPricePerBag.toFixed(2)} disabled /></label>
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"><input checked={form.active} onChange={(event) => setForm((c) => ({ ...c, active: event.target.checked }))} type="checkbox" />Active</label>
          <div className="md:col-span-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button className="w-full sm:w-auto" type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="w-full sm:w-auto" type="submit">{editing ? "Save Changes" : "Create Accessory"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

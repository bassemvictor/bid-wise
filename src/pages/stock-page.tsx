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
import type { Material, StockItem, StockReservationStatus, Supplier } from "../../shared/types";

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

type StockForm = Omit<
  StockItem,
  | "entityType"
  | "createdAt"
  | "updatedAt"
  | "unitCount"
  | "rollWidthM"
  | "rollLengthM"
  | "unitCostUsdPerM2"
  | "landedCostEgp"
  | "reservationStatus"
> & {
  unitCount: string;
  rollWidthM: string;
  rollLengthM: string;
  unitCostUsdPerM2: string;
  landedCostEgp: string;
  reservationStatus: "" | StockReservationStatus;
};

const reservationStatusLabels: Record<StockReservationStatus, string> = {
  reserved: "Reserved",
  unavailable: "Unavailable",
};

const initialForm: StockForm = {
  stockId: "",
  tenantId: "alimex-demo",
  supplierId: "",
  materialId: "",
  unitCount: "",
  rollWidthM: "",
  rollLengthM: "",
  unitCostUsdPerM2: "",
  landedCostEgp: "",
  reservationStatus: "",
  reservedForTenderId: null,
  reservedForTenderNumber: null,
  reservedAt: null,
  active: true,
};

const toForm = (record: StockItem): StockForm => ({
  stockId: record.stockId,
  tenantId: record.tenantId,
  supplierId: record.supplierId,
  materialId: record.materialId,
  unitCount: record.unitCount?.toString() ?? "",
  rollWidthM: toMillimeterInputValue(record.rollWidthM),
  rollLengthM: toMillimeterInputValue(record.rollLengthM),
  unitCostUsdPerM2: record.unitCostUsdPerM2?.toString() ?? "",
  landedCostEgp: record.landedCostEgp?.toString() ?? "",
  reservationStatus: record.reservationStatus ?? "",
  reservedForTenderId: record.reservedForTenderId ?? null,
  reservedForTenderNumber: record.reservedForTenderNumber ?? null,
  reservedAt: record.reservedAt ?? null,
  active: record.active,
});

const formatReservationStatus = (record: StockItem) => {
  if (!record.reservationStatus) {
    return {
      label: "Available",
      detail: "Not reserved",
      tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
    };
  }

  const tenderReference = record.reservedForTenderNumber || record.reservedForTenderId;

  return {
    label: reservationStatusLabels[record.reservationStatus],
    detail: tenderReference ? `Tender ${tenderReference}` : "No tender linked",
    tone:
      record.reservationStatus === "unavailable"
        ? "text-rose-700 bg-rose-50 border-rose-200"
        : "text-amber-700 bg-amber-50 border-amber-200",
  };
};

export const StockPage = () => {
  const [records, setRecords] = useState<StockItem[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [form, setForm] = useState<StockForm>(initialForm);
  const [error, setError] = useState("");

  const load = async () => {
    if (!isApiConfigured) {
      return;
    }

    try {
      const [stockItems, materialItems, supplierItems] = await Promise.all([
        api.get<StockItem[]>("/stock?tenantId=alimex-demo"),
        api.get<Material[]>("/materials?tenantId=alimex-demo"),
        api.get<Supplier[]>("/suppliers?tenantId=alimex-demo"),
      ]);
      setRecords(stockItems);
      setMaterials(materialItems.filter((item) => item.active));
      setSuppliers(supplierItems.filter((item) => item.active));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load stock.");
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
          record.stockId,
          supplierName,
          materialName,
          record.reservationStatus ?? "",
          record.reservedForTenderNumber ?? "",
          record.reservedForTenderId ?? "",
          record.unitCount?.toString() ?? "",
          record.rollWidthM?.toString() ?? "",
          record.rollLengthM?.toString() ?? "",
          record.unitCostUsdPerM2?.toString() ?? "",
          record.landedCostEgp?.toString() ?? "",
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

    const payload: StockItem = {
      entityType: "STOCK_ITEM",
      tenantId: form.tenantId,
      stockId: form.stockId || crypto.randomUUID(),
      supplierId: form.supplierId,
      materialId: form.materialId,
      unitCount: form.unitCount.trim() === "" ? null : Number(form.unitCount),
      rollWidthM: numberOrNullMillimeterInput(form.rollWidthM),
      rollLengthM: numberOrNullMillimeterInput(form.rollLengthM),
      unitCostUsdPerM2:
        form.unitCostUsdPerM2.trim() === "" ? null : Number(form.unitCostUsdPerM2),
      landedCostEgp: form.landedCostEgp.trim() === "" ? null : Number(form.landedCostEgp),
      reservationStatus: form.reservationStatus || null,
      reservedForTenderId: form.reservationStatus ? form.reservedForTenderId ?? null : null,
      reservedForTenderNumber: form.reservationStatus ? form.reservedForTenderNumber ?? null : null,
      reservedAt: form.reservationStatus ? form.reservedAt ?? null : null,
      active: form.active,
      createdAt: "",
      updatedAt: "",
    };

    try {
      if (editing) {
        await api.put<StockItem>(`/stock/${payload.stockId}`, payload);
      } else {
        await api.post<StockItem>("/stock", payload);
      }

      setOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save stock item.");
    }
  };

  const archive = async (record: StockItem) => {
    try {
      await api.delete<StockItem>(`/stock/${record.stockId}?tenantId=alimex-demo`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to archive stock item.");
    }
  };

  return (
    <div className="space-y-6">
      <MasterDataToolbar
        addLabel="Add Stock Item"
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
            <CardTitle>In Stock</CardTitle>
            <CardDescription>
              Track reusable in-stock material records by supplier, material, dimensions when needed, and cost.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState
              title="No stock items found"
              description="Add a stock record to represent currently available supplier material."
            />
          ) : (
            <Table className="min-w-[1120px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Stock Item</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Roll Width (mm)</TableHead>
                  <TableHead className="text-right">Roll Length (mm)</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Landing Cost EGP / m²</TableHead>
                  <TableHead>Reservation</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((record) => (
                  <TableRow key={record.stockId} className="[&>td]:align-middle">
                    <TableCell className="w-[280px]">
                      <p className="break-all font-medium leading-6 text-slate-900">{record.stockId}</p>
                      <p className="text-xs text-muted-foreground">In-stock material record</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium text-slate-800">
                      {supplierMap[record.supplierId] ?? record.supplierId ?? "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium text-slate-800">
                      {materialMap[record.materialId] ?? record.materialId ?? "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-slate-800">
                      {toMillimeterInputValue(record.rollWidthM) || "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-slate-800">
                      {toMillimeterInputValue(record.rollLengthM) || "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {record.unitCostUsdPerM2 !== null
                        ? `${record.unitCostUsdPerM2.toFixed(3)} USD/m²`
                        : "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {record.landedCostEgp !== null ? `${record.landedCostEgp.toFixed(2)} EGP` : "-"}
                    </TableCell>
                    <TableCell className="w-[190px]">
                      {(() => {
                        const reservation = formatReservationStatus(record);
                        return (
                          <div className={`inline-flex w-full max-w-[170px] flex-col rounded-2xl border px-3 py-2 leading-tight ${reservation.tone}`}>
                            <span className="text-sm font-semibold">{reservation.label}</span>
                            <span className="mt-1 truncate text-xs opacity-90">{reservation.detail}</span>
                          </div>
                        );
                      })()}
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
        </CardContent>
      </Card>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit In Stock Item" : "Add In Stock Item"}
        description="Select the supplier and material, then capture roll dimensions and stock cost inputs."
      >
        <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Stock ID
            <Input value={form.stockId} onChange={(event) => setForm((current) => ({ ...current, stockId: event.target.value }))} />
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
            <Input required inputMode="decimal" value={form.rollWidthM} onChange={(event) => setForm((current) => ({ ...current, rollWidthM: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Roll Length (mm)
            <Input required inputMode="decimal" value={form.rollLengthM} onChange={(event) => setForm((current) => ({ ...current, rollLengthM: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Unit Cost USD / m²
            <Input
              inputMode="decimal"
              value={form.unitCostUsdPerM2}
              onChange={(event) =>
                setForm((current) => ({ ...current, unitCostUsdPerM2: event.target.value }))
              }
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Landing Cost EGP / m²
            <Input
              inputMode="decimal"
              value={form.landedCostEgp}
              onChange={(event) =>
                setForm((current) => ({ ...current, landedCostEgp: event.target.value }))
              }
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Reservation
            <Select
              value={form.reservationStatus}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  reservationStatus: event.target.value as StockForm["reservationStatus"],
                }))
              }
            >
              <option value="">Available</option>
              <option value="reserved">Reserved</option>
              <option value="unavailable">Unavailable</option>
            </Select>
            {editing?.reservedForTenderNumber || editing?.reservedForTenderId ? (
              <p className="text-xs text-muted-foreground">
                Linked tender: {editing.reservedForTenderNumber || editing.reservedForTenderId}
              </p>
            ) : null}
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
            <input checked={form.active} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />
            Active
          </label>
          <div className="flex flex-col-reverse gap-3 md:col-span-2 sm:flex-row sm:justify-end">
            <Button className="w-full sm:w-auto" type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="w-full sm:w-auto" type="submit">{editing ? "Save Changes" : "Create Stock Item"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

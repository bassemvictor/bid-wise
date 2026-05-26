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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { api, isApiConfigured } from "../lib/api";
import type { Supplier } from "../../shared/types";

type SupplierForm = Omit<Supplier, "entityType" | "createdAt" | "updatedAt">;

const initialSupplierForm: SupplierForm = {
  supplierId: "",
  tenantId: "alimex-demo",
  supplierName: "",
  country: "",
  contactName: "",
  email: "",
  phone: "",
  preferred: false,
  active: true,
};

const toSupplierForm = (record: Supplier): SupplierForm => ({ ...record });

type SupplierImportRow = Record<string, unknown>;

const normalizeImportCell = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());

const parseBooleanLike = (value: unknown) => {
  const normalized = normalizeImportCell(value).toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "1";
};

export const SuppliersPage = () => {
  const [records, setRecords] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(initialSupplierForm);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const loadSuppliers = async () => {
    if (!isApiConfigured) {
      return;
    }

    try {
      setRecords(await api.get<Supplier[]>("/suppliers?tenantId=alimex-demo"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load suppliers.");
    }
  };

  useEffect(() => { void loadSuppliers(); }, []);

  const filtered = useMemo(() => records.filter((record) => {
    const matchesSearch = [record.supplierId, record.supplierName, record.country, record.contactName]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" && record.active) || (statusFilter === "archived" && !record.active);
    return matchesSearch && matchesStatus;
  }), [records, search, statusFilter]);

  const submitSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    const payload: Supplier = {
      entityType: "SUPPLIER",
      ...supplierForm,
      supplierId: supplierForm.supplierId || crypto.randomUUID(),
      supplierName: supplierForm.supplierName.trim(),
      country: supplierForm.country.trim(),
      contactName: supplierForm.contactName.trim(),
      email: supplierForm.email.trim(),
      phone: supplierForm.phone.trim(),
      createdAt: "",
      updatedAt: "",
    };

    try {
      if (editing) {
        await api.put<Supplier>(`/suppliers/${encodeURIComponent(payload.supplierId)}`, payload);
      } else {
        await api.post<Supplier>("/suppliers", payload);
      }
      setSupplierDialogOpen(false);
      await loadSuppliers();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save supplier.");
    }
  };

  const archiveSupplier = async (record: Supplier) => {
    setError("");
    setMessage("");
    try {
      await api.delete<Supplier>(`/suppliers/${encodeURIComponent(record.supplierId)}?tenantId=alimex-demo`);
      await loadSuppliers();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to archive supplier.");
    }
  };

  const triggerImportPicker = () => {
    setError("");
    setMessage("");
    importInputRef.current?.click();
  };

  const importSuppliers = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!isApiConfigured) {
      setError("Set VITE_API_BASE_URL before importing suppliers.");
      return;
    }

    setError("");
    setMessage("");
    setIsImporting(true);

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error("The Excel file does not contain any sheets.");
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<SupplierImportRow>(worksheet, {
        defval: "",
        raw: false,
      });

      const existingById = new Map(records.map((record) => [record.supplierId.trim().toLowerCase(), record]));
      const existingByName = new Map(records.map((record) => [record.supplierName.trim().toLowerCase(), record]));

      const suppliersToUpsert = rows
        .map((row) => {
          const supplierId = normalizeImportCell(row.Code);
          const supplierName = normalizeImportCell(row.Name);

          if (!supplierId && !supplierName) {
            return null;
          }

          const matchedExisting =
            (supplierId && existingById.get(supplierId.toLowerCase())) ||
            (supplierName && existingByName.get(supplierName.toLowerCase())) ||
            null;

          return {
            row,
            payload: {
              entityType: "SUPPLIER" as const,
              tenantId: "alimex-demo",
              supplierId: supplierId || matchedExisting?.supplierId || crypto.randomUUID(),
              supplierName: supplierName || matchedExisting?.supplierName || "Unnamed Supplier",
              country: normalizeImportCell(row.Country) || matchedExisting?.country || "",
              contactName: normalizeImportCell(row["Contact Name"]) || matchedExisting?.contactName || "",
              email: normalizeImportCell(row.Email) || matchedExisting?.email || "",
              phone: normalizeImportCell(row.Phone) || matchedExisting?.phone || "",
              preferred:
                row.Preferred !== undefined
                  ? parseBooleanLike(row.Preferred)
                  : matchedExisting?.preferred ?? false,
              active:
                row.Active !== undefined
                  ? parseBooleanLike(row.Active)
                  : matchedExisting?.active ?? true,
              createdAt: "",
              updatedAt: "",
            } satisfies Supplier,
            isUpdate: Boolean(matchedExisting),
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (!suppliersToUpsert.length) {
        throw new Error("No supplier rows were found in the Excel file.");
      }

      let createdCount = 0;
      let updatedCount = 0;

      for (const supplier of suppliersToUpsert) {
        if (supplier.isUpdate) {
          await api.put<Supplier>(`/suppliers/${encodeURIComponent(supplier.payload.supplierId)}`, supplier.payload);
          updatedCount += 1;
        } else {
          await api.post<Supplier>("/suppliers", supplier.payload);
          createdCount += 1;
        }
      }

      await loadSuppliers();
      setMessage(`Imported ${suppliersToUpsert.length} suppliers from ${file.name}. Created ${createdCount}, updated ${updatedCount}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to import suppliers from Excel.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <MasterDataToolbar
        addLabel="Add Supplier"
        onAdd={() => {
          setEditing(null);
          setSupplierForm(initialSupplierForm);
          setSupplierDialogOpen(true);
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
              onChange={(event) => void importSuppliers(event)}
            />
            <Button disabled={isImporting} type="button" variant="outline" onClick={triggerImportPicker}>
              <Upload className="h-4 w-4" />
              {isImporting ? "Importing..." : "Import Suppliers"}
            </Button>
          </>
        }
      />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Suppliers</CardTitle>
            <CardDescription>Manage supplier master data for sourcing and procurement.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState title="No suppliers found" description="Create a supplier record to start managing your supplier master data." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((record) => (
                  <TableRow key={record.supplierId}>
                    <TableCell><p className="font-medium text-slate-900">{record.supplierName}</p><p className="text-xs text-muted-foreground">{record.supplierId}</p></TableCell>
                    <TableCell>{record.country}</TableCell>
                    <TableCell><p>{record.contactName}</p><p className="text-xs text-muted-foreground">{record.email}</p></TableCell>
                    <TableCell><StatusBadge active={record.active} preferred={record.preferred} /></TableCell>
                    <TableCell className="space-x-2">
                      <Button size="sm" variant="ghost" type="button" onClick={() => { setEditing(record); setSupplierForm(toSupplierForm(record)); setSupplierDialogOpen(true); }}>Edit</Button>
                      <Button size="sm" variant="outline" type="button" onClick={() => void archiveSupplier(record)}>{record.active ? "Archive" : "Delete"}</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {message ? <p className="mt-4 text-sm text-emerald-600">{message}</p> : null}
          {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Dialog open={supplierDialogOpen} onClose={() => setSupplierDialogOpen(false)} title={editing ? "Edit Supplier" : "Add Supplier"} description="Manage supplier master data.">
        <form className="grid gap-5 md:grid-cols-2" onSubmit={submitSupplier}>
          <label className="space-y-2 text-sm font-medium text-slate-700">Supplier ID<Input value={supplierForm.supplierId} onChange={(event) => setSupplierForm((c) => ({ ...c, supplierId: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Supplier Name<Input required value={supplierForm.supplierName} onChange={(event) => setSupplierForm((c) => ({ ...c, supplierName: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Country<Input value={supplierForm.country} onChange={(event) => setSupplierForm((c) => ({ ...c, country: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Contact Name<Input value={supplierForm.contactName} onChange={(event) => setSupplierForm((c) => ({ ...c, contactName: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Email<Input type="email" value={supplierForm.email} onChange={(event) => setSupplierForm((c) => ({ ...c, email: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Phone<Input value={supplierForm.phone} onChange={(event) => setSupplierForm((c) => ({ ...c, phone: event.target.value }))} /></label>
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"><input checked={supplierForm.preferred} onChange={(event) => setSupplierForm((c) => ({ ...c, preferred: event.target.checked }))} type="checkbox" />Preferred</label>
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"><input checked={supplierForm.active} onChange={(event) => setSupplierForm((c) => ({ ...c, active: event.target.checked }))} type="checkbox" />Active</label>
          <div className="md:col-span-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button className="w-full sm:w-auto" type="button" variant="outline" onClick={() => setSupplierDialogOpen(false)}>Cancel</Button><Button className="w-full sm:w-auto" type="submit">{editing ? "Save Changes" : "Create Supplier"}</Button></div>
        </form>
      </Dialog>
    </div>
  );
};

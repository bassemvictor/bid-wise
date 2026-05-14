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
import type { Product } from "../../shared/types";

type ProductForm = Omit<
  Product,
  "entityType" | "createdAt" | "updatedAt" | "defaultSeamAllowanceMm" | "defaultTopBottomAllowanceMm"
> & {
  defaultSeamAllowanceMm: string;
  defaultTopBottomAllowanceMm: string;
};

const initialForm: ProductForm = {
  productId: "",
  tenantId: "alimex-demo",
  productName: "",
  productType: "",
  defaultTopDesign: "",
  defaultBottomDesign: "",
  defaultSeamAllowanceMm: "",
  defaultTopBottomAllowanceMm: "",
  active: true,
};

const toForm = (record: Product): ProductForm => ({
  productId: record.productId,
  tenantId: record.tenantId,
  productName: record.productName,
  productType: record.productType,
  defaultTopDesign: record.defaultTopDesign,
  defaultBottomDesign: record.defaultBottomDesign,
  defaultSeamAllowanceMm: record.defaultSeamAllowanceMm?.toString() ?? "",
  defaultTopBottomAllowanceMm: record.defaultTopBottomAllowanceMm?.toString() ?? "",
  active: record.active,
});

export const ProductsPage = () => {
  const [records, setRecords] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(initialForm);
  const [error, setError] = useState("");

  const load = async () => {
    if (!isApiConfigured) {
      return;
    }

    try {
      setRecords(await api.get<Product[]>("/products?tenantId=alimex-demo"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load products.");
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => records.filter((record) => {
    const matchesSearch = [record.productId, record.productName, record.productType]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && record.active) ||
      (statusFilter === "archived" && !record.active);

    return matchesSearch && matchesStatus;
  }), [records, search, statusFilter]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: Product = {
      entityType: "PRODUCT",
      tenantId: form.tenantId,
      productId: form.productId || crypto.randomUUID(),
      productName: form.productName.trim(),
      productType: form.productType.trim(),
      defaultTopDesign: form.defaultTopDesign.trim(),
      defaultBottomDesign: form.defaultBottomDesign.trim(),
      defaultSeamAllowanceMm:
        form.defaultSeamAllowanceMm.trim() === "" ? null : Number(form.defaultSeamAllowanceMm),
      defaultTopBottomAllowanceMm:
        form.defaultTopBottomAllowanceMm.trim() === "" ? null : Number(form.defaultTopBottomAllowanceMm),
      active: form.active,
      createdAt: "",
      updatedAt: "",
    };

    try {
      if (editing) {
        await api.put<Product>(`/products/${payload.productId}`, payload);
      } else {
        await api.post<Product>("/products", payload);
      }
      setOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save product.");
    }
  };

  const archive = async (record: Product) => {
    try {
      await api.delete<Product>(`/products/${record.productId}?tenantId=alimex-demo`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to archive product.");
    }
  };

  return (
    <div className="space-y-6">
      <MasterDataToolbar
        addLabel="Add Product"
        onAdd={() => { setEditing(null); setForm(initialForm); setOpen(true); }}
        searchValue={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Products</CardTitle>
            <CardDescription>Manage reusable product templates and default bag construction settings.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState title="No products found" description="Create reusable products for tender configuration." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Default Top</TableHead>
                  <TableHead>Default Bottom</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((record) => (
                  <TableRow key={record.productId}>
                    <TableCell><p className="font-medium text-slate-900">{record.productName}</p><p className="text-xs text-muted-foreground">{record.productId}</p></TableCell>
                    <TableCell>{record.productType}</TableCell>
                    <TableCell>{record.defaultTopDesign || "-"}</TableCell>
                    <TableCell>{record.defaultBottomDesign || "-"}</TableCell>
                    <TableCell><StatusBadge active={record.active} /></TableCell>
                    <TableCell className="space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(record); setForm(toForm(record)); setOpen(true); }} type="button">Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => void archive(record)} type="button">{record.active ? "Archive" : "Delete"}</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        </CardContent>
      </Card>
      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? "Edit Product" : "Add Product"} description="Manage reusable product defaults.">
        <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <label className="space-y-2 text-sm font-medium text-slate-700">Product ID<Input value={form.productId} onChange={(event) => setForm((c) => ({ ...c, productId: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Product Name<Input required value={form.productName} onChange={(event) => setForm((c) => ({ ...c, productName: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Product Type<Input required value={form.productType} onChange={(event) => setForm((c) => ({ ...c, productType: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Default Top Design<Input value={form.defaultTopDesign} onChange={(event) => setForm((c) => ({ ...c, defaultTopDesign: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Default Bottom Design<Input value={form.defaultBottomDesign} onChange={(event) => setForm((c) => ({ ...c, defaultBottomDesign: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Default Seam Allowance (mm)<Input value={form.defaultSeamAllowanceMm} inputMode="decimal" onChange={(event) => setForm((c) => ({ ...c, defaultSeamAllowanceMm: event.target.value }))} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">Default Top/Bottom Allowance (mm)<Input value={form.defaultTopBottomAllowanceMm} inputMode="decimal" onChange={(event) => setForm((c) => ({ ...c, defaultTopBottomAllowanceMm: event.target.value }))} /></label>
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"><input checked={form.active} onChange={(event) => setForm((c) => ({ ...c, active: event.target.checked }))} type="checkbox" />Active</label>
          <div className="md:col-span-2 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">{editing ? "Save Changes" : "Create Product"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

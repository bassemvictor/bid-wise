import { useEffect, useMemo, useState, type FormEvent } from "react";

import { EmptyState } from "../components/master-data/empty-state";
import { MasterDataToolbar } from "../components/master-data/master-data-toolbar";
import { StatusBadge } from "../components/master-data/status-badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { api, isApiConfigured } from "../lib/api";
import type { Customer } from "../../shared/types";

type CustomerForm = Omit<Customer, "entityType" | "createdAt" | "updatedAt">;

const initialForm: CustomerForm = {
  customerId: "",
  tenantId: "alimex-demo",
  customerName: "",
  country: "",
  contactName: "",
  email: "",
  phone: "",
  active: true,
};

const toForm = (record: Customer): CustomerForm => ({ ...record });

export const CustomersPage = () => {
  const [records, setRecords] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(initialForm);
  const [error, setError] = useState("");

  const load = async () => {
    if (!isApiConfigured) {
      return;
    }

    try {
      setRecords(await api.get<Customer[]>("/customers?tenantId=alimex-demo"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load customers.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      records.filter((record) => {
        const matchesSearch = [record.customerId, record.customerName, record.country, record.contactName]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase());
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && record.active) ||
          (statusFilter === "archived" && !record.active);

        return matchesSearch && matchesStatus;
      }),
    [records, search, statusFilter],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: Customer = {
      entityType: "CUSTOMER",
      tenantId: form.tenantId,
      customerId: form.customerId || crypto.randomUUID(),
      customerName: form.customerName.trim(),
      country: form.country.trim(),
      contactName: form.contactName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      active: form.active,
      createdAt: "",
      updatedAt: "",
    };

    try {
      if (editing) {
        await api.put<Customer>(`/customers/${payload.customerId}`, payload);
      } else {
        await api.post<Customer>("/customers", payload);
      }
      setOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save customer.");
    }
  };

  const archive = async (record: Customer) => {
    try {
      await api.delete<Customer>(`/customers/${record.customerId}?tenantId=alimex-demo`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to archive customer.");
    }
  };

  return (
    <div className="space-y-6">
      <MasterDataToolbar
        addLabel="Add Customer"
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
            <CardTitle>Customers</CardTitle>
            <CardDescription>Manage reusable customer records used during tender intake.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState
              title="No customers found"
              description="Add a customer record to reuse it during tender intake."
            />
          ) : (
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((record) => (
                  <TableRow key={record.customerId} className="[&>td]:align-middle">
                    <TableCell className="w-[280px]">
                      <p className="font-medium text-slate-900">{record.customerName}</p>
                      <p className="text-xs text-muted-foreground">{record.customerId}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium text-slate-800">{record.country || "-"}</TableCell>
                    <TableCell>
                      <p>{record.contactName || "-"}</p>
                      <p className="text-xs text-muted-foreground">{record.email || "-"}</p>
                    </TableCell>
                    <TableCell className="text-center"><div className="flex justify-center"><StatusBadge active={record.active} /></div></TableCell>
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
        title={editing ? "Edit Customer" : "Add Customer"}
        description="Manage reusable customer master data."
      >
        <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Customer ID
            <Input value={form.customerId} onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Customer Name
            <Input required value={form.customerName} onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Country
            <Input value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Contact Name
            <Input value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Email
            <Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Phone
            <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
            <input checked={form.active} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />
            Active
          </label>
          <div className="flex flex-col-reverse gap-3 md:col-span-2 sm:flex-row sm:justify-end">
            <Button className="w-full sm:w-auto" type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="w-full sm:w-auto" type="submit">{editing ? "Save Changes" : "Create Customer"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

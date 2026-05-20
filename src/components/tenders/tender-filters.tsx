import { useState, type ChangeEvent } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import type { TenderRequestType, TenderStatus } from "../../../shared/types";

export type TenderFilterState = {
  search: string;
  status: string;
  requestType: string;
  customerName: string;
  assignedTo: string;
  deliveryPlace: string;
  dueDateFrom: string;
  dueDateTo: string;
};

type TenderFiltersProps = {
  customers: string[];
  filters: TenderFilterState;
  onChange: (next: TenderFilterState) => void;
};

const statuses: TenderStatus[] = [
  "DRAFT_INTAKE",
  "TECHNICAL_REVIEW",
  "READY_FOR_PRICING",
  "PRODUCT_CONFIGURATION",
  "MATERIAL_SOURCING",
  "COST_BUILDUP",
  "ALTERNATIVES",
  "PENDING_APPROVAL",
  "APPROVED",
  "OFFER_SUBMITTED",
  "NEGOTIATION",
  "WON",
  "LOST",
  "CANCELLED",
];

const requestTypes: TenderRequestType[] = [
  "inquiry",
  "public tender",
  "budget offer",
  "limited tender",
  "direct order",
];

const requestTypeLabelMap: Record<TenderRequestType, string> = {
  inquiry: "Inquiry",
  "public tender": "Public Tender",
  "budget offer": "Budget Offer",
  "limited tender": "Limited Tender",
  "direct order": "Direct Order",
};

export const TenderFilters = ({ customers, filters, onChange }: TenderFiltersProps) => {
  const [open, setOpen] = useState(false);
  const setField = (field: keyof TenderFilterState) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...filters, [field]: event.target.value });
  const activeFilterCount = [
    filters.status,
    filters.requestType,
    filters.customerName,
    filters.assignedTo,
    filters.deliveryPlace,
    filters.dueDateFrom,
    filters.dueDateTo,
  ].filter(Boolean).length;
  const clearFilters = () =>
    onChange({
      ...filters,
      status: "",
      requestType: "",
      customerName: "",
      assignedTo: "",
      deliveryPlace: "",
      dueDateFrom: "",
      dueDateTo: "",
    });

  return (
    <>
      <div className="rounded-[1.25rem] border border-border bg-white p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search customer, tender number, or inquiry number"
              value={filters.search}
              onChange={setField("search")}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setOpen(true)} type="button" variant="outline">
              <SlidersHorizontal className="h-4 w-4" />
              {activeFilterCount > 0 ? `${activeFilterCount} selected filters` : "Filters"}
            </Button>
            {activeFilterCount > 0 ? (
              <Button onClick={clearFilters} type="button" variant="ghost">
                Remove all filters
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/30">
          <button aria-label="Close filters overlay" className="absolute inset-0" onClick={() => setOpen(false)} type="button" />
          <aside className="relative z-10 flex h-full w-full flex-col border-l border-border bg-white shadow-2xl sm:max-w-[560px]">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Filters</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeFilterCount > 0 ? `${activeFilterCount} filters selected` : "No filters selected"}
                </p>
              </div>
              <button
                className="rounded-xl border border-border bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="space-y-4">
                <Select value={filters.status} onChange={setField("status")}>
                  <option value="">All statuses</option>
                  {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </Select>
                <Select value={filters.requestType} onChange={setField("requestType")}>
                  <option value="">All request types</option>
                  {requestTypes.map((type) => <option key={type} value={type}>{requestTypeLabelMap[type]}</option>)}
                </Select>
                <Select value={filters.customerName} onChange={setField("customerName")}>
                  <option value="">All customers</option>
                  {customers.map((customer) => <option key={customer} value={customer}>{customer}</option>)}
                </Select>
                <Input type="date" value={filters.dueDateFrom} onChange={setField("dueDateFrom")} />
                <Input type="date" value={filters.dueDateTo} onChange={setField("dueDateTo")} />
              </div>
            </div>

            <div className="border-t border-border px-5 py-4">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button onClick={clearFilters} type="button" variant="ghost">
                  Remove all filters
                </Button>
                <Button onClick={() => setOpen(false)} type="button" variant="outline">
                  Done
                </Button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
};

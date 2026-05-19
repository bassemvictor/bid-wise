import type { ChangeEvent } from "react";
import { Search } from "lucide-react";

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

export const TenderFilters = ({ customers, filters, onChange }: TenderFiltersProps) => {
  const setField = (field: keyof TenderFilterState) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...filters, [field]: event.target.value });

  return (
    <div className="rounded-[1.25rem] border border-border bg-white p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="relative xl:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search customer, tender number, or inquiry number" value={filters.search} onChange={setField("search")} />
        </div>
        <Select value={filters.status} onChange={setField("status")}>
          <option value="">All statuses</option>
          {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </Select>
        <Select value={filters.requestType} onChange={setField("requestType")}>
          <option value="">All request types</option>
          {requestTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </Select>
        <Select value={filters.customerName} onChange={setField("customerName")}>
          <option value="">All customers</option>
          {customers.map((customer) => <option key={customer} value={customer}>{customer}</option>)}
        </Select>
        <Input type="date" value={filters.dueDateFrom} onChange={setField("dueDateFrom")} />
        <Input type="date" value={filters.dueDateTo} onChange={setField("dueDateTo")} />
      </div>
    </div>
  );
};

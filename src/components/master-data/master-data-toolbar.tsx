import { Search } from "lucide-react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select } from "../ui/select";

type MasterDataToolbarProps = {
  addLabel: string;
  onAdd: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
};

export const MasterDataToolbar = ({
  addLabel,
  onAdd,
  searchValue,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
}: MasterDataToolbarProps) => (
  <div className="flex flex-col gap-4 rounded-[1.25rem] border border-border bg-white p-4 md:flex-row md:items-center md:justify-between">
    <div className="grid gap-3 md:grid-cols-[1fr_180px] md:items-center">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search records"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <Select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
        <option value="all">All statuses</option>
        <option value="active">Active only</option>
        <option value="archived">Archived only</option>
      </Select>
    </div>
    <Button onClick={onAdd} type="button">
      {addLabel}
    </Button>
  </div>
);

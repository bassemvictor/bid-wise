import { AlertCircle, ArrowDown, ArrowUp } from "lucide-react";
import type { MouseEvent } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { TenderRowActions } from "./tender-row-actions";
import { TenderStatusBadge } from "./tender-status-badge";
import { TenderTypeBadge } from "./tender-type-badge";
import type { TenderSummary } from "../../../shared/types";

type SortField =
  | "tenderNumber"
  | "internalInquiryNumber"
  | "customerName"
  | "requestType"
  | "tenderDueDate"
  | "requestedDeliveryTime"
  | "status"
  | "assignedTo"
  | "updatedAt";

type TenderTableProps = {
  onArchive: (record: TenderSummary) => void;
  onContinue: (record: TenderSummary) => void;
  onDelete: (record: TenderSummary) => void;
  onDuplicate: (record: TenderSummary) => void;
  onOpen: (record: TenderSummary) => void;
  onSort: (field: SortField) => void;
  records: TenderSummary[];
  sortBy: SortField;
  sortDirection: "asc" | "desc";
};

const finalStatuses = ["APPROVED", "OFFER_SUBMITTED", "WON", "LOST", "CANCELLED"];

export const TenderTable = ({
  onArchive,
  onContinue,
  onDelete,
  onDuplicate,
  onOpen,
  onSort,
  records,
  sortBy,
  sortDirection,
}: TenderTableProps) => {
  const renderSort = (field: SortField) =>
    sortBy === field ? (
      sortDirection === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
    ) : null;

  const handleActionClick = (event: MouseEvent<HTMLTableCellElement>) => {
    event.stopPropagation();
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {[
            ["Tender Number", "tenderNumber"],
            ["Internal Inquiry Number", "internalInquiryNumber"],
            ["Customer", "customerName"],
            ["Request Type", "requestType"],
            ["Due Date", "tenderDueDate"],
            ["Delivery Time", "requestedDeliveryTime"],
            ["Status", "status"],
            ["Assigned To", "assignedTo"],
            ["Last Updated", "updatedAt"],
          ].map(([label, field]) => (
            <TableHead key={field}>
              <button className="inline-flex items-center gap-1" onClick={() => onSort(field as SortField)} type="button">
                {label}
                {renderSort(field as SortField)}
              </button>
            </TableHead>
          ))}
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record) => {
          const isOverdue =
            Boolean(record.tenderDueDate) &&
            record.tenderDueDate < new Date().toISOString().slice(0, 10) &&
            !finalStatuses.includes(record.status);

          return (
            <TableRow className="cursor-pointer hover:bg-slate-50" key={record.tenderId} onClick={() => onOpen(record)}>
              <TableCell><p className="font-medium text-slate-900">{record.tenderNumber}</p></TableCell>
              <TableCell>{record.internalInquiryNumber}</TableCell>
              <TableCell>{record.customerName}</TableCell>
              <TableCell><TenderTypeBadge type={record.requestType} /></TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span>{record.tenderDueDate || "-"}</span>
                  {isOverdue ? <AlertCircle className="h-4 w-4 text-rose-600" /> : null}
                </div>
              </TableCell>
              <TableCell>{record.requestedDeliveryTime || "-"}</TableCell>
              <TableCell><TenderStatusBadge status={record.status} /></TableCell>
              <TableCell>{record.assignedTo || "-"}</TableCell>
              <TableCell>{record.updatedAt.slice(0, 10)}</TableCell>
              <TableCell onClick={handleActionClick}>
                <TenderRowActions
                  onArchive={onArchive}
                  onContinue={onContinue}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                  record={record}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

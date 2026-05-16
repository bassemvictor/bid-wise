import { Download, Plus, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { EmptyState } from "../components/master-data/empty-state";
import { TenderFilters, type TenderFilterState } from "../components/tenders/tender-filters";
import { LoadingSkeleton } from "../components/tenders/loading-skeleton";
import { TenderSummaryCards } from "../components/tenders/tender-summary-cards";
import { TenderTable } from "../components/tenders/tender-table";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { api, isApiConfigured } from "../lib/api";
import type { TenderListResponse, TenderStatus, TenderSummary } from "../../shared/types";

type SortField =
  | "tenderNumber"
  | "internalInquiryNumber"
  | "customerName"
  | "requestType"
  | "requestedMaterial"
  | "tenderDueDate"
  | "requestedDeliveryTime"
  | "status"
  | "assignedTo"
  | "updatedAt";

const initialFilters: TenderFilterState = {
  search: "",
  status: "",
  requestType: "",
  customerName: "",
  assignedTo: "",
  deliveryPlace: "",
  dueDateFrom: "",
  dueDateTo: "",
};

const downloadFile = (contents: BlobPart, type: string, filename: string) => {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const continuePath = (record: TenderSummary) => {
  const status = record.status as TenderStatus;

  switch (status) {
    case "DRAFT_INTAKE":
      return `/tenders/intake/${record.tenderId}`;
    case "TECHNICAL_REVIEW":
      return `/tenders/${record.tenderId}/technical-review`;
    case "READY_FOR_PRICING":
      return `/tenders/${record.tenderId}/product-configuration`;
    case "PRODUCT_CONFIGURATION":
      return `/tenders/${record.tenderId}/material-sourcing`;
    case "MATERIAL_ROLL_CALCULATION":
      return `/tenders/${record.tenderId}/material-sourcing`;
    case "MATERIAL_SOURCING":
      return `/tenders/${record.tenderId}/cost-build-up`;
    case "COST_BUILDUP":
      return `/tenders/${record.tenderId}/alternatives`;
    case "ALTERNATIVES":
    case "PENDING_APPROVAL":
      return `/tenders/${record.tenderId}/pricing-approval`;
    case "APPROVED":
    case "OFFER_SUBMITTED":
      return `/tenders/${record.tenderId}`;
    default:
      return `/tenders/${record.tenderId}`;
  }
};

export const AllTendersPage = () => {
  const navigate = useNavigate();
  const [response, setResponse] = useState<TenderListResponse | null>(null);
  const [filters, setFilters] = useState<TenderFilterState>(initialFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("updatedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [tokenHistory, setTokenHistory] = useState<string[]>([]);

  const load = async (token?: string | null, resetHistory = false) => {
    if (!isApiConfigured) {
      setError("Set VITE_API_BASE_URL before loading tenders.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        tenantId: "alimex-demo",
        limit: "12",
        sortBy,
        sortDirection,
      });

      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      if (filters.requestType) params.set("requestType", filters.requestType);
      if (filters.customerName) params.set("customerName", filters.customerName);
      if (filters.assignedTo) params.set("assignedTo", filters.assignedTo);
      if (filters.deliveryPlace) params.set("deliveryPlace", filters.deliveryPlace);
      if (filters.dueDateFrom) params.set("dueDateFrom", filters.dueDateFrom);
      if (filters.dueDateTo) params.set("dueDateTo", filters.dueDateTo);
      if (token) params.set("nextToken", token);

      const result = await api.get<TenderListResponse>(`/tenders?${params.toString()}`);
      setResponse(result);
      setCurrentToken(token ?? null);
      setNextToken(result.nextToken);
      if (resetHistory) {
        setTokenHistory([]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load tenders.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load(null, true);
  }, [filters, sortBy, sortDirection]);

  const customerOptions = useMemo(
    () => Array.from(new Set((response?.items ?? []).map((item) => item.customerName).filter(Boolean))),
    [response],
  );

  const exportCurrent = () => {
    if (!response?.items.length) {
      return;
    }

    const header = [
      "Tender Number",
      "Internal Inquiry Number",
      "Customer",
      "Request Type",
      "Product / Material",
      "Due Date",
      "Delivery Time",
      "Status",
      "Assigned To",
      "Last Updated",
    ];
    const rows = response.items.map((item) => [
      item.tenderNumber,
      item.internalInquiryNumber,
      item.customerName,
      item.requestType,
      item.requestedMaterial,
      item.tenderDueDate,
      item.requestedDeliveryTime,
      item.status,
      item.assignedTo ?? "",
      item.updatedAt,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, "\"\"")}"`).join(","))
      .join("\n");
    downloadFile(csv, "text/csv;charset=utf-8;", "alimex-tenders.csv");
  };

  const exportExcel = () => {
    if (!response?.items.length) {
      return;
    }

    const columns = [
      "Tender Number",
      "Internal Inquiry Number",
      "Customer",
      "Request Type",
      "Product / Material",
      "Due Date",
      "Delivery Time",
      "Status",
      "Assigned To",
      "Last Updated",
    ];

    const rows = response.items
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.tenderNumber)}</td>
            <td>${escapeHtml(item.internalInquiryNumber)}</td>
            <td>${escapeHtml(item.customerName)}</td>
            <td>${escapeHtml(item.requestType)}</td>
            <td>${escapeHtml(item.requestedMaterial)}</td>
            <td>${escapeHtml(item.tenderDueDate)}</td>
            <td>${escapeHtml(item.requestedDeliveryTime)}</td>
            <td>${escapeHtml(item.status)}</td>
            <td>${escapeHtml(item.assignedTo ?? "")}</td>
            <td>${escapeHtml(item.updatedAt)}</td>
          </tr>
        `,
      )
      .join("");

    const document = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:x="urn:schemas-microsoft-com:office:excel"
            xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8" />
          <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8" />
        </head>
        <body>
          <table>
            <thead>
              <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `;

    downloadFile(document, "application/vnd.ms-excel;charset=utf-8;", "alimex-tenders.xls");
  };

  const onSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(field);
    setSortDirection("asc");
  };

  const openTender = (record: TenderSummary) => navigate(`/tenders/${record.tenderId}`);

  const refresh = () => void load(null, true);
  const nextPage = () => {
    if (!nextToken) return;
    setTokenHistory((current) => [...current, currentToken ?? ""]);
    void load(nextToken, false);
  };
  const prevPage = () => {
    const history = [...tokenHistory];
    const previousToken = history.pop() ?? "";
    setTokenHistory(history);
    void load(previousToken || null, false);
  };

  const archiveTender = async (record: TenderSummary) => {
    await api.post(`/tenders/${record.tenderId}/archive?tenantId=alimex-demo`);
    await load(null, true);
  };

  const duplicateTender = async (record: TenderSummary) => {
    const duplicated = await api.post<TenderSummary>(`/tenders/${record.tenderId}/duplicate?tenantId=alimex-demo`);
    navigate(`/tenders/intake/${duplicated.tenderId}`);
  };

  const deleteTender = async (record: TenderSummary) => {
    await api.delete(`/tenders/${record.tenderId}?tenantId=alimex-demo`);
    await load(null, true);
  };

  const continueWorkflow = (record: TenderSummary) => navigate(continuePath(record));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Manage all tender requests, inquiries, budget offers, and direct orders.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => navigate("/tenders/intake")} type="button">
            <Plus className="h-4 w-4" />
            New Tender
          </Button>
          <Button onClick={exportCurrent} type="button" variant="outline">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={exportExcel} type="button" variant="outline">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Button onClick={refresh} type="button" variant="outline">
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? <LoadingSkeleton /> : null}

      {!isLoading && response ? (
        <>
          <TenderSummaryCards summary={response.summary} />
          <TenderFilters
            customers={customerOptions}
            filters={filters}
            onChange={setFilters}
          />
          {error ? (
            <div className="rounded-[1.25rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Tender Register</CardTitle>
                <CardDescription>Search, sort, and continue any tender workflow from one place.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {response.items.length === 0 ? (
                <EmptyState
                  title="No tenders found"
                  description="Create a new tender to start building your pricing workflow."
                />
              ) : (
                <>
                  <TenderTable
                    onArchive={(record) => void archiveTender(record)}
                    onContinue={continueWorkflow}
                    onDelete={(record) => void deleteTender(record)}
                    onDuplicate={(record) => void duplicateTender(record)}
                    onOpen={openTender}
                    onSort={onSort}
                    records={response.items}
                    sortBy={sortBy}
                    sortDirection={sortDirection}
                  />
                  <div className="mt-5 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Showing {response.items.length} tender{response.items.length === 1 ? "" : "s"}
                    </p>
                    <div className="flex gap-3">
                      <Button disabled={tokenHistory.length === 0} onClick={prevPage} type="button" variant="outline">
                        Previous
                      </Button>
                      <Button disabled={!response.nextToken} onClick={nextPage} type="button" variant="outline">
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
};

import { Badge } from "../ui/badge";
import type { TenderStatus } from "../../../shared/types";

const variantMap: Record<TenderStatus, "default" | "success" | "warning" | "neutral"> = {
  DRAFT_INTAKE: "neutral",
  MISSING_INFORMATION: "warning",
  TECHNICAL_REVIEW: "warning",
  READY_FOR_PRICING: "default",
  PRODUCT_CONFIGURATION: "default",
  MATERIAL_ROLL_CALCULATION: "default",
  MATERIAL_SOURCING: "default",
  COST_BUILDUP: "default",
  ALTERNATIVES: "default",
  PRICING_IN_PROGRESS: "warning",
  SOURCING_REVIEW: "warning",
  PRICE_READY: "default",
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
  OFFER_SUBMITTED: "success",
  NEGOTIATION: "warning",
  WON: "success",
  LOST: "neutral",
  CANCELLED: "neutral",
};

export const TenderStatusBadge = ({ status }: { status: TenderStatus }) => (
  <Badge variant={variantMap[status] ?? "neutral"}>{status}</Badge>
);

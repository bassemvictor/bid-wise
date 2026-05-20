import { Badge } from "../ui/badge";
import type { TenderRequestType } from "../../../shared/types";

const tenderTypeLabelMap: Record<TenderRequestType, string> = {
  inquiry: "Inquiry",
  "public tender": "Public Tender",
  "budget offer": "Budget Offer",
  "limited tender": "Limited Tender",
  "direct order": "Direct Order",
};

export const TenderTypeBadge = ({ type }: { type: TenderRequestType }) => (
  <Badge variant="neutral">{tenderTypeLabelMap[type]}</Badge>
);

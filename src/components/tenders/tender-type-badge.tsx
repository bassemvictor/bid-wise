import { Badge } from "../ui/badge";
import type { TenderRequestType } from "../../../shared/types";

export const TenderTypeBadge = ({ type }: { type: TenderRequestType }) => (
  <Badge variant="neutral">{type}</Badge>
);

import { Badge } from "../ui/badge";

type StatusBadgeProps = {
  active: boolean;
  preferred?: boolean;
};

export const StatusBadge = ({ active, preferred }: StatusBadgeProps) => (
  <div className="flex flex-wrap gap-2">
    <Badge variant={active ? "success" : "neutral"}>{active ? "Active" : "Archived"}</Badge>
    {preferred ? <Badge variant="default">Preferred</Badge> : null}
  </div>
);

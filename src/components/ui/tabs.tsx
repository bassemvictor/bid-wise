import { NavLink } from "react-router-dom";

import { cn } from "../../lib/utils";

type TabItem = {
  label: string;
  href: string;
};

type TabsProps = {
  items: TabItem[];
};

export const RouteTabs = ({ items }: TabsProps) => (
  <div className="overflow-x-auto">
    <div className="inline-flex min-w-full gap-2 rounded-2xl border border-border bg-white p-2">
      {items.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          className={({ isActive }) =>
            cn(
              "rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors",
              isActive && "bg-primary text-primary-foreground",
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  </div>
);

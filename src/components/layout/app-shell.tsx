import { Bell, Cat, ChevronRight, LogOut, Menu, Search, Shield } from "lucide-react";
import { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { Button } from "../ui/button";
import { canManageAccess, formatGroupLabel, useAuth } from "../../lib/auth";
import { getBreadcrumbs, getPageTitle } from "../../lib/route-metadata";
import { cn } from "../../lib/utils";

const navigation = [
  {
    label: "Tenders",
    items: [{ label: "All Tenders", href: "/tenders" }],
  },
  {
    label: "Master Data",
    items: [
      { label: "Customers", href: "/customers" },
      { label: "Suppliers", href: "/suppliers" },
      {
        label: "Materials",
        href: "/materials",
        children: [
          { label: "In Stock", href: "/stock" },
          { label: "Import", href: "/import-presets" },
        ],
      },
      { label: "Accessories", href: "/accessories" },
      { label: "Products", href: "/products" },
    ],
  },
  {
    label: "Pricing",
    items: [
      { label: "Price Scenarios", href: "/price-scenarios" },
      { label: "Price Comparisons", href: "/price-scenarios/SCN-1001" },
    ],
  },
  {
    label: "Development",
    items: [{ label: "Seed Master Data", href: "/development" }],
  },
];

export const AppShell = () => {
  const { pathname } = useLocation();
  const { user, signOutUser } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const breadcrumbs = useMemo(() => getBreadcrumbs(pathname), [pathname]);
  const title = useMemo(() => getPageTitle(pathname), [pathname]);
  const primaryGroup = user?.groups[0] ? formatGroupLabel(user.groups[0]) : "Authenticated User";
  const initials = useMemo(() => {
    const source = user?.name || user?.email || "AU";
    return source
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [user?.email, user?.name]);
  const visibleNavigation = useMemo(() => {
    if (!canManageAccess(user?.groups ?? [])) {
      return navigation;
    }

    return [
      ...navigation,
      {
        label: "Administration",
        items: [{ label: "Access Management", href: "/access-management" }],
      },
    ];
  }, [user?.groups]);

  return (
    <div className="min-h-screen bg-transparent">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-[85vw] max-w-72 bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform sm:px-5 sm:py-6 lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-full flex-col">
            <div className="mb-6 flex items-center justify-between sm:mb-8">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-blue-200/80">Alimex</p>
                <div className="mt-2 flex items-center gap-2">
                  <Cat className="h-6 w-6" />
                  <h1 className="text-2xl font-semibold">BidWise</h1>
                </div>
              </div>
              <button
                className="rounded-lg p-2 text-blue-100 lg:hidden"
                onClick={() => setSidebarOpen(false)}
                type="button"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-7">
              {visibleNavigation.map((section) => (
                <div key={section.label}>
                  <p className="mb-3 text-xs uppercase tracking-[0.18em] text-blue-200/60">
                    {section.label}
                  </p>
                  <div className="space-y-1.5">
                    {section.items.map((item) => (
                      <div className="space-y-1.5" key={item.label}>
                        <NavLink
                          to={item.href}
                          className={({ isActive }) =>
                            cn(
                              "flex items-center rounded-xl px-3 py-2.5 text-sm text-blue-100/80 transition-colors hover:bg-white/8 hover:text-white",
                              isActive && "bg-primary text-white shadow-lg shadow-blue-950/20",
                            )
                          }
                          onClick={() => setSidebarOpen(false)}
                        >
                          {item.label}
                        </NavLink>
                        {item.children?.length ? (
                          <div className="ml-4 space-y-1 border-l border-white/10 pl-3">
                            {item.children.map((child) => (
                              <NavLink
                                key={child.label}
                                to={child.href}
                                className={({ isActive }) =>
                                  cn(
                                    "flex items-center rounded-lg px-3 py-2 text-sm text-blue-100/70 transition-colors hover:bg-white/8 hover:text-white",
                                    isActive && "bg-white/10 text-white",
                                  )
                                }
                                onClick={() => setSidebarOpen(false)}
                              >
                                {child.label}
                              </NavLink>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              <p className="text-sm font-medium text-white">Alimex Group</p>
              <p className="mt-2 text-sm text-blue-100/70">
                Copyright © 2026 Alimex Group - All Rights Reserved.
              </p>
            </div>
          </div>
        </aside>

        {sidebarOpen ? (
          <button
            aria-label="Close sidebar overlay"
            className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            type="button"
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col lg:pl-72">
          <header className="sticky top-0 z-20 border-b border-border/90 bg-white/90 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
              <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-5">
                <button
                  className="rounded-full border border-border bg-white p-3 text-slate-600 lg:hidden"
                  onClick={() => setSidebarOpen(true)}
                  type="button"
                >
                  <Menu className="h-6 w-6" />
                </button>
                <div className="min-w-0">
                  <div className="mb-1 hidden flex-wrap items-center gap-2 text-sm text-muted-foreground sm:flex">
                    {breadcrumbs.map((crumb, index) => (
                      <div className="flex items-center gap-2" key={`${crumb.label}-${index}`}>
                        {crumb.href ? <NavLink to={crumb.href}>{crumb.label}</NavLink> : <span>{crumb.label}</span>}
                        {index < breadcrumbs.length - 1 ? <ChevronRight className="h-4 w-4" /> : null}
                      </div>
                    ))}
                  </div>
                  <h2 className="text-lg font-semibold leading-tight text-slate-900 sm:text-2xl">{title}</h2>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3 sm:gap-4 lg:justify-end">
                <div className="hidden items-center gap-2 rounded-xl border border-border bg-slate-50 px-3 py-2 text-sm text-muted-foreground md:flex">
                  <Search className="h-4 w-4" />
                  Search tenders, scenarios, suppliers
                </div>
                <button
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-white text-slate-600 sm:h-14 sm:w-14"
                  type="button"
                >
                  <Bell className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-base font-semibold text-white sm:h-14 sm:w-14">
                    {initials}
                  </div>
                  <div className="hidden min-w-0 text-left xl:block">
                    <p className="truncate text-sm font-medium text-slate-900">{user?.name || user?.email || "Alimex User"}</p>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Shield className="h-3.5 w-3.5" />
                      <span className="truncate">{primaryGroup}</span>
                    </div>
                  </div>
                  <Button
                    className="h-12 w-12 rounded-full p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-700 sm:h-14 sm:w-14"
                    onClick={() => void signOutUser()}
                    type="button"
                    variant="ghost"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

import { formatTitle } from "./utils";

const tenderSectionLabels: Record<string, string> = {
  "product-configuration": "Product Configuration",
  "material-sourcing": "Material Sourcing & Costing",
  "cost-build-up": "Cost Build-Up Per Bag",
  alternatives: "Alternatives",
  "pricing-approval": "Pricing Approval",
};

export const getPageTitle = (pathname: string) => {
  if (pathname === "/") {
    return "All Tenders";
  }

  if (pathname === "/tenders/intake") {
    return "Tender Intake";
  }

  if (pathname === "/tenders") {
    return "All Tenders";
  }

  if (pathname === "/price-scenarios") {
    return "Price Scenarios";
  }

  if (pathname === "/stock") {
    return "In Stock Rolls";
  }

  if (pathname === "/import-presets") {
    return "Import Rolls";
  }

  if (pathname === "/development") {
    return "Development";
  }

  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] === "price-scenarios" && segments[1]) {
    return "Scenario Detail";
  }

  if (segments[0] === "tenders" && segments[1] && segments[2]) {
    return tenderSectionLabels[segments[2]] ?? formatTitle(segments[2]);
  }

  if (segments[0] === "tenders" && segments[1]) {
    return "Tender Workspace";
  }

  return formatTitle(segments[segments.length - 1] ?? "All Tenders");
};

export const getBreadcrumbs = (pathname: string) => {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return [{ label: "Tenders", href: "/tenders" }, { label: "All Tenders" }];
  }

  const crumbs: Array<{ label: string; href?: string }> = [];

  if (segments[0] === "tenders") {
    crumbs.push({ label: "Tenders", href: "/tenders" });

    if (segments.length === 1) {
      crumbs.push({ label: "All Tenders" });
      return crumbs;
    }

    if (segments[1] === "intake") {
      crumbs.push({ label: segments[2] ? "Edit Tender Intake" : "Tender Intake" });
      return crumbs;
    }

    crumbs.push({ label: segments[1], href: `/tenders/${segments[1]}` });

    if (segments[2]) {
      crumbs.push({
        label: tenderSectionLabels[segments[2]] ?? formatTitle(segments[2]),
      });
    }

    return crumbs;
  }

  if (segments[0] === "price-scenarios") {
    crumbs.push({ label: "Pricing", href: "/price-scenarios" });
    crumbs.push({ label: "Price Scenarios", href: "/price-scenarios" });

    if (segments[1]) {
      crumbs.push({ label: segments[1] });
    }

    return crumbs;
  }

  if (segments[0] === "stock" || segments[0] === "import-presets") {
    crumbs.push({ label: "Master Data", href: "/materials" });
    crumbs.push({ label: segments[0] === "stock" ? "In Stock Rolls" : "Import Rolls" });
    return crumbs;
  }

  if (segments[0] === "development") {
    crumbs.push({ label: "Development" });
    return crumbs;
  }

  return segments.map((segment, index) => ({
    label: formatTitle(segment),
    href: `/${segments.slice(0, index + 1).join("/")}`,
  }));
};

export const getTenderSectionTabs = (tenderId: string) => [
  { label: "Overview", href: `/tenders/${tenderId}` },
  {
    label: "Product Configuration",
    href: `/tenders/${tenderId}/product-configuration`,
  },
  {
    label: "Material Sourcing",
    href: `/tenders/${tenderId}/material-sourcing`,
  },
  {
    label: "Cost Build-Up",
    href: `/tenders/${tenderId}/cost-build-up`,
  },
  {
    label: "Alternatives",
    href: `/tenders/${tenderId}/alternatives`,
  },
  {
    label: "Pricing Approval",
    href: `/tenders/${tenderId}/pricing-approval`,
  },
];

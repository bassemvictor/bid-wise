import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "../components/layout/app-shell";
import { AllTendersPage } from "../pages/all-tenders-page";
import { AccessoriesPage } from "../pages/accessories-page";
import { CustomersPage } from "../pages/customers-page";
import { DashboardPage } from "../pages/dashboard-page";
import { ImportPresetsPage } from "../pages/import-presets-page";
import { CostBuildUpPage } from "../pages/cost-build-up-page";
import { MaterialSourcingPage } from "../pages/material-sourcing-page";
import { MaterialRollCalculationPage } from "../pages/material-roll-calculation-page";
import { MaterialsPage } from "../pages/materials-page";
import { NotFoundPage } from "../pages/not-found-page";
import { PriceScenarioDetailPage } from "../pages/price-scenario-detail-page";
import { PriceScenariosPage } from "../pages/price-scenarios-page";
import { ProductConfigurationPage } from "../pages/product-configuration-page";
import { ProductsPage } from "../pages/products-page";
import { SuppliersPage } from "../pages/suppliers-page";
import { StockPage } from "../pages/stock-page";
import { TenderDetailPage } from "../pages/tender-detail-page";
import { TenderIntakePage } from "../pages/tender-intake-page";
import { TechnicalReviewPage } from "../pages/technical-review-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate replace to="/dashboard" />,
  },
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        path: "dashboard",
        element: <DashboardPage />,
      },
      {
        path: "tenders",
        element: <AllTendersPage />,
      },
      {
        path: "materials",
        element: <MaterialsPage />,
      },
      {
        path: "customers",
        element: <CustomersPage />,
      },
      {
        path: "suppliers",
        element: <SuppliersPage />,
      },
      {
        path: "products",
        element: <ProductsPage />,
      },
      {
        path: "accessories",
        element: <AccessoriesPage />,
      },
      {
        path: "stock",
        element: <StockPage />,
      },
      {
        path: "import-presets",
        element: <ImportPresetsPage />,
      },
      {
        path: "tenders/intake",
        element: <TenderIntakePage />,
      },
      {
        path: "tenders/intake/:tenderId",
        element: <TenderIntakePage />,
      },
      {
        path: "tenders/:tenderId",
        element: <TenderDetailPage />,
      },
      {
        path: "tenders/:tenderId/technical-review",
        element: <TechnicalReviewPage />,
      },
      {
        path: "tenders/:tenderId/product-configuration",
        element: <ProductConfigurationPage />,
      },
      {
        path: "tenders/:tenderId/material-roll-calculation",
        element: <MaterialRollCalculationPage />,
      },
      {
        path: "tenders/:tenderId/material-sourcing",
        element: <MaterialSourcingPage />,
      },
      {
        path: "tenders/:tenderId/cost-build-up",
        element: <CostBuildUpPage />,
      },
      {
        path: "tenders/:tenderId/alternatives",
        element: <TenderDetailPage />,
      },
      {
        path: "tenders/:tenderId/pricing-approval",
        element: <TenderDetailPage />,
      },
      {
        path: "price-scenarios",
        element: <PriceScenariosPage />,
      },
      {
        path: "price-scenarios/:scenarioId",
        element: <PriceScenarioDetailPage />,
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);

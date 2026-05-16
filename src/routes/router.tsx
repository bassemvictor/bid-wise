import { createBrowserRouter, Navigate } from "react-router-dom";

import { RequireAuth } from "../components/auth/require-auth";
import { AppShell } from "../components/layout/app-shell";
import { AllTendersPage } from "../pages/all-tenders-page";
import { AlternativesPage } from "../pages/alternatives-page";
import { AccessoriesPage } from "../pages/accessories-page";
import { AuthPage } from "../pages/auth-page";
import { CustomersPage } from "../pages/customers-page";
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
import { PricingApprovalPage } from "../pages/pricing-approval-page";
import { SuppliersPage } from "../pages/suppliers-page";
import { StockPage } from "../pages/stock-page";
import { TenderDetailPage } from "../pages/tender-detail-page";
import { TenderIntakePage } from "../pages/tender-intake-page";
import { TechnicalReviewPage } from "../pages/technical-review-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate replace to="/tenders" />,
  },
  {
    path: "/auth",
    element: <AuthPage />,
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
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
        element: <AlternativesPage />,
      },
      {
        path: "tenders/:tenderId/pricing-approval",
        element: <PricingApprovalPage />,
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

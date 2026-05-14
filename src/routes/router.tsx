import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "../components/layout/app-shell";
import { DashboardPage } from "../pages/dashboard-page";
import { NotFoundPage } from "../pages/not-found-page";
import { PriceScenarioDetailPage } from "../pages/price-scenario-detail-page";
import { PriceScenariosPage } from "../pages/price-scenarios-page";
import { TenderDetailPage } from "../pages/tender-detail-page";
import { TenderIntakePage } from "../pages/tender-intake-page";

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
        path: "tenders/intake",
        element: <TenderIntakePage />,
      },
      {
        path: "tenders/:tenderId",
        element: <TenderDetailPage />,
      },
      {
        path: "tenders/:tenderId/product-configuration",
        element: <TenderDetailPage />,
      },
      {
        path: "tenders/:tenderId/material-roll-calculation",
        element: <TenderDetailPage />,
      },
      {
        path: "tenders/:tenderId/material-sourcing",
        element: <TenderDetailPage />,
      },
      {
        path: "tenders/:tenderId/cost-build-up",
        element: <TenderDetailPage />,
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

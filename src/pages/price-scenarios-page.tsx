import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { api, isApiConfigured } from "../lib/api";
import type { PricingScenario } from "../../shared/types";

export const PriceScenariosPage = () => {
  const [scenarios, setScenarios] = useState<PricingScenario[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isApiConfigured) {
      return;
    }

    void api
      .get<PricingScenario[]>("/price-scenarios?tenantId=alimex-demo")
      .then(setScenarios)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardDescription>Scenario Catalog</CardDescription>
              <CardTitle className="mt-2 text-3xl">{scenarios.length}</CardTitle>
            </div>
            <Badge>Scenarios</Badge>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardDescription>Price Comparison</CardDescription>
              <CardTitle className="mt-2">Structured</CardTitle>
            </div>
            <Badge variant="neutral">Foundation</Badge>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardDescription>Approval Workflow</CardDescription>
              <CardTitle className="mt-2">Routed</CardTitle>
            </div>
            <Badge variant="success">Enabled</Badge>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Price Scenarios</CardTitle>
            <CardDescription>Scenario rows stay empty until the backend returns data.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scenario</TableHead>
                <TableHead>Tender</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Versions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenarios.length > 0 ? (
                scenarios.map((scenario) => (
                  <TableRow key={scenario.scenarioId}>
                    <TableCell className="font-medium text-slate-900">
                      <NavLink className="text-primary hover:underline" to={`/price-scenarios/${scenario.scenarioId}`}>
                        {scenario.name}
                      </NavLink>
                    </TableCell>
                    <TableCell>{scenario.tenderId}</TableCell>
                    <TableCell>{scenario.status}</TableCell>
                    <TableCell>{scenario.versions.length}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="font-medium text-slate-900">No scenarios available</TableCell>
                  <TableCell>Connect the API or use the backend dev seed route.</TableCell>
                  <TableCell>Awaiting data</TableCell>
                  <TableCell>0</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
};

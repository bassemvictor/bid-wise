import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { api, isApiConfigured } from "../lib/api";
import type { PricingScenario } from "../../shared/types";

export const PriceScenarioDetailPage = () => {
  const { scenarioId = "" } = useParams();
  const [scenario, setScenario] = useState<PricingScenario | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isApiConfigured || !scenarioId) {
      return;
    }

    void api
      .get<PricingScenario>(`/price-scenarios/${scenarioId}?tenantId=alimex-demo`)
      .then(setScenario)
      .catch((reason: Error) => setError(reason.message));
  }, [scenarioId]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{scenario?.name ?? "Scenario Detail"}</CardTitle>
            <CardDescription>Scenario detail and version history come from the Lambda API.</CardDescription>
          </div>
          <Badge>{scenario?.status ?? "Pending"}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <pre className="overflow-x-auto whitespace-pre-wrap break-words text-sm text-slate-700">
              {scenario ? JSON.stringify(scenario, null, 2) : "No scenario loaded yet."}
            </pre>
          </div>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Version Summary</CardTitle>
            <CardDescription>Price versions are embedded in the shared scenario contract.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenario?.versions.length ? (
                scenario.versions.map((version) => (
                  <TableRow key={version.versionId}>
                    <TableCell className="font-medium text-slate-900">v{version.versionNumber}</TableCell>
                    <TableCell>{version.status}</TableCell>
                    <TableCell>
                      {version.currency} {version.totalPrice.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="font-medium text-slate-900">No versions</TableCell>
                  <TableCell>Awaiting pricing data</TableCell>
                  <TableCell>0</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

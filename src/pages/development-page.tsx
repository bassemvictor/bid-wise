import { DatabaseZap } from "lucide-react";
import { useState } from "react";

import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { api, isApiConfigured } from "../lib/api";

type SeedResponse = {
  message: string;
  tenantId: string;
  counts: Record<string, number>;
};

export const DevelopmentPage = () => {
  const [isSeeding, setIsSeeding] = useState(false);
  const [result, setResult] = useState<SeedResponse | null>(null);
  const [error, setError] = useState("");

  const seedMasterData = async () => {
    setError("");
    setResult(null);

    if (!isApiConfigured) {
      setError("API is not configured.");
      return;
    }

    setIsSeeding(true);

    try {
      const response = await api.post<SeedResponse>("/dev/seed-master-data?tenantId=alimex-demo");
      setResult(response);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to seed master data.");
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Development Tools</CardTitle>
            <CardDescription>
              Development-only actions for seeding reusable master data into DynamoDB.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-[1.35rem] border border-dashed border-border bg-slate-50/80 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                  <DatabaseZap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Seed Master Data</h3>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    Creates at least 10 records per reusable master-data entity, including customers, materials,
                    suppliers, products, accessories, in-stock materials, import presets, and supplier offers.
                  </p>
                </div>
              </div>
              <Button onClick={() => void seedMasterData()} type="button">
                {isSeeding ? "Seeding..." : "Seed Master Data"}
              </Button>
            </div>
          </div>

          {result ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <p className="text-sm font-medium text-emerald-800">{result.message}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Object.entries(result.counts).map(([label, count]) => (
                  <div className="rounded-xl bg-white/80 px-3 py-3" key={label}>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{count.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

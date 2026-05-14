import { ClipboardCheck, FileSearch, FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { TenderWorkflowStepper } from "../components/tenders/tender-workflow-stepper";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { api, isApiConfigured } from "../lib/api";
import type { TenderRequest } from "../../shared/types";

const reviewChecks = [
  {
    title: "Specification completeness",
    description: "Confirm requested material, dimensions, and design assumptions are clear enough for technical analysis.",
    icon: FileSearch,
  },
  {
    title: "Manufacturing feasibility",
    description: "Validate whether bag construction, accessories, and delivery expectations fit the operating model.",
    icon: FlaskConical,
  },
  {
    title: "Commercial readiness",
    description: "Review pricing expectations before product configuration and roll calculations begin.",
    icon: ClipboardCheck,
  },
];

export const TechnicalReviewPage = () => {
  const { tenderId = "" } = useParams();
  const [tender, setTender] = useState<TenderRequest | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isApiConfigured || !tenderId) {
      return;
    }

    void api
      .get<TenderRequest>(`/tenders/${tenderId}?tenantId=alimex-demo`)
      .then(setTender)
      .catch((reason: Error) => setError(reason.message));
  }, [tenderId]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Technical Review</CardTitle>
              <CardDescription>
                The intake has been submitted and is ready for technical assessment.
              </CardDescription>
            </div>
            <Badge variant="default">{tender?.status ?? "TECHNICAL_REVIEW"}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <pre className="overflow-x-auto whitespace-pre-wrap break-words text-sm text-slate-700">
                {tender ? JSON.stringify(tender, null, 2) : "Tender details will appear here once loaded from the API."}
              </pre>
            </div>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {reviewChecks.map((item) => {
            const Icon = item.icon;

            return (
              <Card key={item.title}>
                <CardHeader>
                  <div>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </div>
                  <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                    <Icon className="h-5 w-5" />
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>

      <TenderWorkflowStepper currentStep={2} tenderId={tenderId} />
    </div>
  );
};

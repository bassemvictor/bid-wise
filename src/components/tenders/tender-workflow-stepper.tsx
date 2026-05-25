import { Check } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";

type Step = {
  label: string;
  href?: string;
};

type TenderWorkflowStepperProps = {
  currentStep: number;
  currentStepCompleted?: boolean;
  tenderId?: string;
  isDirty?: boolean;
};

const getSteps = (tenderId?: string): Step[] => [
  { label: "Tender Info", href: tenderId ? `/tenders/intake/${tenderId}` : "/tenders/intake" },
  { label: "Product Configuration", href: tenderId ? `/tenders/${tenderId}/product-configuration` : undefined },
  {
    label: "Material Sourcing",
    href: tenderId ? `/tenders/${tenderId}/material-sourcing` : undefined,
  },
  { label: "Cost Build-Up", href: tenderId ? `/tenders/${tenderId}/cost-build-up` : undefined },
  { label: "Alternatives", href: tenderId ? `/tenders/${tenderId}/alternatives` : undefined },
  { label: "Approval", href: tenderId ? `/tenders/${tenderId}/pricing-approval` : undefined },
];

export const TenderWorkflowStepper = ({
  currentStep,
  currentStepCompleted = false,
  tenderId,
  isDirty = false,
}: TenderWorkflowStepperProps) => {
  const steps = getSteps(tenderId);

  return (
    <div className="rounded-[1.4rem] border border-border bg-white px-4 py-4 panel-shadow lg:px-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">Tender Workflow</p>
        {isDirty ? <Badge variant="warning">Changed</Badge> : null}
      </div>
      <div className="overflow-x-auto">
        <div className="flex min-w-max w-full items-center">
          {steps.map((step, index) => {
            const stepNumber = index + 1;
            const isCurrentStep = stepNumber === currentStep;
            const isComplete = stepNumber < currentStep || (isCurrentStep && currentStepCompleted);
            const isActive = isCurrentStep && !currentStepCompleted;
            const content = (
              <div className="relative flex items-center justify-center gap-2 px-1 lg:gap-2.5">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors lg:h-9 lg:w-9",
                    isComplete && "border-emerald-600 bg-emerald-600 text-white",
                    isActive && "border-primary bg-primary text-white",
                    !isActive && !isComplete && "border-slate-200 bg-slate-50 text-slate-500",
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : stepNumber}
                </div>
                <p
                  className={cn(
                    "whitespace-nowrap text-[12px] font-medium transition-colors lg:text-[13px] xl:text-sm",
                    isActive && "text-primary",
                    isComplete && "text-slate-900",
                    !isActive && !isComplete && "text-slate-500",
                  )}
                >
                  {step.label}
                </p>
              </div>
            );

            return (
              <div
                className={cn("flex min-w-0 items-center", index < steps.length - 1 && "flex-1")}
                key={step.label}
              >
                <div className="shrink-0 py-1">
                  {step.href ? (
                    <NavLink
                      className={cn(
                        "flex items-center justify-center rounded-xl bg-white px-1 py-1 transition-opacity hover:opacity-85 lg:px-1.5",
                        !isActive && !isComplete && "hover:opacity-100",
                      )}
                      onClick={(event) => {
                        if (
                          !isDirty ||
                          !step.href ||
                          stepNumber === currentStep ||
                          typeof window === "undefined"
                        ) {
                          return;
                        }

                        const shouldLeave = window.confirm(
                          "You have unsaved changes in this tender stage. Leave without saving?",
                        );

                        if (!shouldLeave) {
                          event.preventDefault();
                        }
                      }}
                      to={step.href}
                    >
                      {content}
                    </NavLink>
                  ) : (
                    <div className="flex items-center justify-center bg-white px-1 py-1 lg:px-1.5">
                      {content}
                    </div>
                  )}
                </div>
                {index < steps.length - 1 ? (
                  <div
                    className={cn(
                      "mx-1 h-px min-w-8 flex-1 lg:mx-2 lg:min-w-10",
                      isComplete ? "bg-primary/70" : "bg-slate-200",
                    )}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

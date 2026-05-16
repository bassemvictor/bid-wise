import { Check } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "../../lib/utils";

type Step = {
  label: string;
  href?: string;
};

type TenderWorkflowStepperProps = {
  currentStep: number;
  tenderId?: string;
};

const getSteps = (tenderId?: string): Step[] => [
  { label: "Tender Info", href: tenderId ? `/tenders/intake/${tenderId}` : "/tenders/intake" },
  { label: "Product Configuration", href: tenderId ? `/tenders/${tenderId}/product-configuration` : undefined },
  {
    label: "Material Sourcing & Costing",
    href: tenderId ? `/tenders/${tenderId}/material-sourcing` : undefined,
  },
  { label: "Cost Build-Up", href: tenderId ? `/tenders/${tenderId}/cost-build-up` : undefined },
  { label: "Alternatives" },
  { label: "Pricing & Approval" },
];

export const TenderWorkflowStepper = ({
  currentStep,
  tenderId,
}: TenderWorkflowStepperProps) => {
  const steps = getSteps(tenderId);

  return (
    <div className="overflow-x-auto rounded-[1.4rem] border border-border bg-white px-5 py-4 panel-shadow">
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-900">Tender Workflow</p>
      </div>
      <div className="flex min-w-max items-center">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isActive = stepNumber === currentStep;
          const isComplete = stepNumber < currentStep;
          const content = (
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                  isComplete && "border-emerald-600 bg-emerald-600 text-white",
                  isActive && "border-primary bg-primary text-white",
                  !isActive && !isComplete && "border-slate-200 bg-slate-50 text-slate-500",
                )}
              >
                {isComplete ? <Check className="h-4 w-4" /> : stepNumber}
              </div>
              <p
                className={cn(
                  "whitespace-nowrap text-sm font-medium transition-colors",
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
            <div className="flex items-center" key={step.label}>
              {step.href ? (
                <NavLink
                  className={cn(
                    "rounded-xl px-2 py-1 transition-opacity hover:opacity-85",
                    !isActive && !isComplete && "hover:opacity-100",
                  )}
                  to={step.href}
                >
                  {content}
                </NavLink>
              ) : (
                <div className="px-2 py-1">{content}</div>
              )}
              {index < steps.length - 1 ? (
                <div
                  className={cn(
                    "mx-3 h-px w-14 shrink-0 lg:w-16",
                    isComplete ? "bg-primary/70" : "bg-slate-200",
                  )}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export type EntityEnvelope = {
  entityType: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
};

export type TenderRequest = EntityEnvelope & {
  tenderId: string;
  title: string;
  customerName: string;
  status: "draft" | "in-review" | "costing" | "approved";
  dueDate: string;
  currency: string;
  owner: string;
  notes?: string;
};

export type ProductConfiguration = EntityEnvelope & {
  tenderId: string;
  configurationId: string;
  productFamily: string;
  productCode: string;
  quantity: number;
  uom: string;
  assumptions: string[];
};

export type RollCalculation = EntityEnvelope & {
  tenderId: string;
  calculationId: string;
  materialCode: string;
  rollWidthMm: number;
  rollLengthM: number;
  utilizationPercent: number;
  wastePercent: number;
};

export type MaterialSourceSelection = EntityEnvelope & {
  tenderId: string;
  selectionId: string;
  materialCode: string;
  supplierId: string;
  leadTimeDays: number;
  pricePerUnit: number;
  currency: string;
  rationale?: string;
};

export type CostBuildUp = EntityEnvelope & {
  tenderId: string;
  costBuildUpId: string;
  materialCost: number;
  conversionCost: number;
  logisticsCost: number;
  overheadCost: number;
  marginTargetPercent: number;
  totalCost: number;
};

export type ScenarioAlternative = EntityEnvelope & {
  tenderId: string;
  scenarioId: string;
  alternativeId: string;
  label: string;
  summary: string;
  deltaPercent: number;
  notes?: string;
};

export type PriceVersion = EntityEnvelope & {
  scenarioId: string;
  versionId: string;
  versionNumber: number;
  status: "draft" | "submitted" | "approved" | "rejected";
  totalPrice: number;
  currency: string;
  submittedAt?: string;
};

export type PricingScenario = EntityEnvelope & {
  scenarioId: string;
  tenderId: string;
  name: string;
  status: "draft" | "under-review" | "approved" | "rejected";
  selectedAlternativeId?: string;
  versions: PriceVersion[];
};

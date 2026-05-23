export type EntityEnvelope = {
  entityType: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
};

export type TenderRequestType =
  | "inquiry"
  | "public tender"
  | "budget offer"
  | "limited tender"
  | "direct order";

export type DeliveryPlace = "factory" | "customer facility";

export type TenderStatus =
  | "DRAFT_INTAKE"
  | "MISSING_INFORMATION"
  | "TECHNICAL_REVIEW"
  | "READY_FOR_PRICING"
  | "PRODUCT_CONFIGURATION"
  | "MATERIAL_ROLL_CALCULATION"
  | "MATERIAL_SOURCING"
  | "COST_BUILDUP"
  | "ALTERNATIVES"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "OFFER_SUBMITTED"
  | "NEGOTIATION"
  | "WON"
  | "LOST"
  | "CANCELLED"
  | "PRICING_IN_PROGRESS"
  | "SOURCING_REVIEW"
  | "PRICE_READY";

export type TenderRequest = EntityEnvelope & {
  tenderId: string;
  customerName: string;
  selectedProductIds: string[];
  productSnapshots: Product[];
  tenderNumber: string;
  internalInquiryNumber: string;
  tenderDueDate: string;
  requestType: TenderRequestType;
  requestedMaterial: string;
  bagDiameterMm: number | null;
  bagLengthMm: number | null;
  topDesign: string;
  bottomDesign: string;
  accessoriesMaterial: string;
  requestedMaterialNotes?: string;
  knownRequiredPrice: number | null;
  knownCompetitorPrice: number | null;
  customerCommissionPercent: number | null;
  exchangeRate: number | null;
  currencySafetyFactorPercent: number | null;
  priceNegotiationExpected: boolean;
  requestedDeliveryTime: string;
  deliveryPlace: DeliveryPlace;
  assignedTo?: string;
  archived?: boolean;
  transportationRequired: boolean;
  installationRequired: boolean;
  notes?: string;
  status: TenderStatus;
};

export type TenderSummary = {
  tenderId: string;
  tenderNumber: string;
  internalInquiryNumber: string;
  customerName: string;
  requestType: TenderRequestType;
  requestedMaterial: string;
  tenderDueDate: string;
  requestedDeliveryTime: string;
  deliveryPlace: DeliveryPlace;
  assignedTo?: string;
  status: TenderStatus;
  archived?: boolean;
  updatedAt: string;
};

export type TenderListSummary = {
  total: number;
  inProgress: number;
  pendingApproval: number;
  approved: number;
  overdue: number;
};

export type TenderListResponse = {
  items: TenderSummary[];
  nextToken: string | null;
  summary: TenderListSummary;
};

export type TenderActivity = EntityEnvelope & {
  tenderId: string;
  activityId: string;
  activityType:
    | "CREATED"
    | "UPDATED"
    | "ARCHIVED"
    | "DUPLICATED"
    | "DELETED";
  section:
    | "TENDER"
    | "PRODUCT_CONFIGURATION"
    | "ROLL_CALCULATION"
    | "MATERIAL_SOURCE_SELECTION"
    | "COST_BUILDUP"
    | "ALTERNATIVES"
    | "PRICING_APPROVAL"
    | "SYSTEM";
  actorId: string;
  actorName: string;
  actorEmail?: string;
  message: string;
  changeCount: number;
  changes: Array<{
    fieldPath: string;
    previousValue: string | number | boolean | null;
    nextValue: string | number | boolean | null;
  }>;
};

export type ProductConfiguration = EntityEnvelope & {
  tenderId: string;
  productConfigId: string;
  selectedProductIds: string[];
  productSnapshots: Product[];
  productType: string;
  quantity: number | null;
  bagDiameterMm: number | null;
  bagLengthMm: number | null;
  seamAllowanceMm: number | null;
  topBottomAllowanceMm: number | null;
  topDesign: string;
  bottomDesign: string;
  seamType: string;
  includeWearStrip: boolean;
  wearStripHeightMm: number | null;
  mainFabricMaterialId: string;
  accessoriesMaterialId: string;
  threadMaterialId: string;
  packagingType: string;
  bagsPerCarton: number | null;
  packagingNotes?: string;
};

export type RollCalculation = EntityEnvelope & {
  tenderId: string;
  productConfigId: string;
  bagDiameterMm: number | null;
  bagLengthMm: number | null;
  seamAllowanceMm: number | null;
  topBottomAllowanceMm: number | null;
  bagWidthMm: number | null;
  bagCuttingAreaM2: number | null;
  rollWidthM: number | null;
  rollLengthM: number | null;
  rollAreaM2: number | null;
  wastePercent: number | null;
  usableRollAreaM2: number | null;
  theoreticalBagsPerRoll: number | null;
  actualBagsPerRoll: number | null;
  actualAreaPerBagM2: number | null;
  totalFabricRequiredM2: number | null;
};

export type MaterialSourceType = "stock" | "import";

export type MaterialCategory = "Fabric Material" | "Ring Material" | "Threading Material";

export type SourcingStrategy = "single-source" | "combine-sources";

export type SelectedMaterialSource = {
  sourceId: string;
  sourceName: string;
  sourceType: MaterialSourceType;
  componentId?: string;
  componentName?: string;
  productId?: string;
  productName?: string;
  supplierId?: string;
  materialId?: string;
  rollWidthM?: number | null;
  rollLengthM?: number | null;
  rollCount?: number | null;
  landedCostEgp?: number | null;
  customsEstimate?: number | null;
  customsPercent?: number | null;
  freightCostPerM2Egp?: number | null;
  clearanceCostPerM2Egp?: number | null;
  bagsAcrossRollWidth?: number | null;
  bagsAlongRollLength?: number | null;
  bagsPerRoll?: number | null;
  allocatedBags?: number | null;
  actualAreaPerBagM2?: number | null;
  qtyUsedM2: number | null;
  unitCostUsdPerM2: number | null;
  totalCostUsd: number | null;
  leadTimeDays: number | null;
};

export type BagBodySourcingSelection = {
  componentId: string;
  componentName: string;
  productId: string;
  productName: string;
  materialId: string;
  requestedQuantity: number | null;
  bagDiameterMm: number | null;
  bagLengthMm: number | null;
  seamAllowanceMm: number | null;
  topBottomAllowanceMm: number | null;
  bagWidthMm: number | null;
  bagLengthWithAllowanceMm: number | null;
  actualAreaPerBagM2: number | null;
  materialCostPerBagEgp: number | null;
  totalMaterialCostEgp: number | null;
  selectedSources: SelectedMaterialSource[];
};

export type MaterialSourceSelection = EntityEnvelope & {
  tenderId: string;
  productConfigId: string;
  materialId: string;
  sourcingStrategy: SourcingStrategy;
  selectedSources: SelectedMaterialSource[];
  componentSelections?: BagBodySourcingSelection[];
  actualAreaPerBagM2?: number | null;
  totalRequiredBags?: number | null;
  totalAllocatedQtyM2: number | null;
  weightedAverageUnitCostUsdPerM2: number | null;
  exchangeRate: number | null;
  currencySafetyFactorPercent: number | null;
  effectiveExchangeRate: number | null;
  freightCostPerM2Egp: number | null;
  customsCostPerM2Egp: number | null;
  otherChargesPerM2Egp: number | null;
  landedCostEgpPerM2: number | null;
  materialCostPerBagEgp: number | null;
  totalMaterialCostEgp: number | null;
  totalLeadTimeDays: number | null;
};

export type CostLine = {
  code: string;
  category: string;
  description: string;
  calculationBasis: string;
  costPerBag: number | null;
  editable: boolean;
};

export type CostBuildUp = EntityEnvelope & {
  tenderId: string;
  productConfigId: string;
  alternativeId: string;
  quantity: number | null;
  currency: "EGP";
  exchangeRate: number | null;
  currencySafetyFactorPercent: number | null;
  effectiveExchangeRate: number | null;
  costLines: CostLine[];
  totalMaterialCostPerBag: number | null;
  totalOperatingCostPerBag: number | null;
  totalAdditionalCostPerBag: number | null;
  totalCostPricePerBag: number | null;
  totalCostPriceForOrder: number | null;
};

export type AlternativeScenario = {
  scenarioId: string;
  label: string;
  profitPercent: number | null;
  factorOfSafetyPercent: number | null;
  customerCommissionPercent: number | null;
  salesPersonCommissionPercent: number | null;
  pricePerBag: number | null;
  totalPrice: number | null;
  notes?: string;
};

export type ScenarioAlternative = EntityEnvelope & {
  tenderId: string;
  alternativeId: string;
  currency: "EGP";
  quantity: number | null;
  baseCostPerBag: number | null;
  scenarios: AlternativeScenario[];
  notes?: string;
};

export type PricingApprovalDecisionStatus = "pending" | "approved" | "denied";

export type PricingApprovalDecision = {
  scenarioId: string;
  label: string;
  status: PricingApprovalDecisionStatus;
  pricePerBag: number | null;
  totalPrice: number | null;
  notes?: string;
};

export type PricingApproval = EntityEnvelope & {
  tenderId: string;
  approvalId: string;
  currency: "EGP";
  approvalsOpen: number;
  status: "pending" | "approved" | "partial" | "denied";
  decisions: PricingApprovalDecision[];
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

export type Customer = EntityEnvelope & {
  customerId: string;
  customerName: string;
  country: string;
  contactName: string;
  email: string;
  phone: string;
  active: boolean;
};

export type Material = EntityEnvelope & {
  materialId: string;
  materialName: string;
  category: MaterialCategory;
  description: string;
  baseMaterial: string;
  defaultWastePercent: number | null;
  rollWidthM: number | null;
  rollLengthM: number | null;
  active: boolean;
};

export type StockItem = EntityEnvelope & {
  stockId: string;
  supplierId: string;
  materialId: string;
  unitCount: number | null;
  rollWidthM: number | null;
  rollLengthM: number | null;
  unitCostUsdPerM2: number | null;
  landedCostEgp: number | null;
  active: boolean;
};

export type ImportPreset = EntityEnvelope & {
  importPresetId: string;
  supplierId: string;
  materialId: string;
  rollWidthM: number | null;
  rollLengthM: number | null;
  leadTimeDays: number | null;
  unitCostUsdPerM2: number | null;
  freightCostPerM2Egp: number | null;
  clearanceCostPerM2Egp: number | null;
  customsPercent: number | null;
  customsEstimate: number | null;
  active: boolean;
};

export type ProductType = "Filter Bag" | "Other";

export type ProductComponentSpecificationValue = string | number | boolean | null;

export type AccessoryPriceItem = {
  key: string;
  price: number | null;
};

export type ProductComponentAccessorySnapshot = {
  accessoryId: string;
  accessoryName: string;
  pricingItems: AccessoryPriceItem[];
  totalPricePerBagEgp: number | null;
};

export type ProductComponent = {
  componentId: string;
  componentName: string;
  componentType: string;
  material: string;
  specifications: Record<string, ProductComponentSpecificationValue>;
  accessorySnapshot?: ProductComponentAccessorySnapshot | null;
};

export type Supplier = EntityEnvelope & {
  supplierId: string;
  supplierName: string;
  country: string;
  contactName: string;
  email: string;
  phone: string;
  preferred: boolean;
  active: boolean;
};

export type SupplierOffer = EntityEnvelope & {
  offerId: string;
  supplierId: string;
  materialId: string;
  unitCostUsdPerM2: number | null;
  minOrderQty: number | null;
  leadTimeDays: number | null;
  freightCost: number | null;
  customsEstimate: number | null;
  validUntil: string;
};

export type Product = EntityEnvelope & {
  productId: string;
  productName: string;
  productType: ProductType;
  requestedQuantity?: number | null;
  factoryOverheadPerBag?: number | null;
  manufacturingOverheadPerBag?: number | null;
  managementOverheadPerBag?: number | null;
  components: ProductComponent[];
  active: boolean;
};

export type Accessory = EntityEnvelope & {
  accessoryId: string;
  accessoryName: string;
  pricingItems: AccessoryPriceItem[];
  totalPricePerBagEgp: number | null;
  active: boolean;
};

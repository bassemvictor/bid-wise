import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";

import type {
  Accessory,
  CostBuildUp,
  Customer,
  DeliveryPlace,
  ImportPreset,
  Material,
  MaterialSourceSelection,
  PricingScenario,
  Product,
  ProductConfiguration,
  RollCalculation,
  ScenarioAlternative,
  StockItem,
  Supplier,
  SupplierOffer,
  TenderActivity,
  TenderListResponse,
  TenderRequestType,
  TenderRequest,
} from "../../../shared/types.js";

type StoredEntity = {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
  GSI3PK?: string;
  GSI3SK?: string;
  entityType: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

type DashboardSummary = {
  tenantId: string;
  tenderCount: number;
  scenarioCount: number;
  approvalCount: number;
  supplierCount: number;
};

type ApprovalSummary = {
  approvalsOpen: number;
  status: string;
};

type RequestContext = {
  tenantId: string;
  tableName: string;
};

let documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const getTableName = () => process.env.TENDER_PRICING_TABLE ?? "";
const isDevEnabled = () => process.env.ENABLE_DEV_ENDPOINTS === "true";
const isoNow = () => new Date().toISOString();
const tenantPk = (tenantId: string) => `TENANT#${tenantId}`;
const tendersGsiPk = (tenantId: string) => `TENANT#${tenantId}#TENDERS`;
const tenderStatusGsiPk = (tenantId: string, status: TenderRequest["status"]) =>
  `TENANT#${tenantId}#STATUS#${status}`;
const tenderEntityPk = (tenderId: string) => `TENDER#${tenderId}`;
const supplierOffersGsiPk = (supplierId: string) => `SUPPLIER#${supplierId}#OFFERS`;
const finalTenderStatuses: TenderRequest["status"][] = [
  "APPROVED",
  "OFFER_SUBMITTED",
  "WON",
  "LOST",
  "CANCELLED",
];

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: {
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
});

const parseBody = <T>(raw: string | undefined | null): T => {
  if (!raw) {
    return {} as T;
  }

  return JSON.parse(raw) as T;
};

const toNullableNumber = (value: unknown) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeTenderPayload = (payload: Partial<TenderRequest>, tenantId: string): TenderRequest => ({
  entityType: "TENDER_REQUEST",
  tenderId: payload.tenderId ?? crypto.randomUUID(),
  tenantId,
  customerName: payload.customerName?.trim() ?? "",
  tenderNumber: payload.tenderNumber?.trim() ?? "",
  internalInquiryNumber: payload.internalInquiryNumber?.trim() ?? "",
  tenderDueDate: payload.tenderDueDate ?? "",
  requestType: (payload.requestType ?? "inquiry") as TenderRequestType,
  requestedMaterial: payload.requestedMaterial?.trim() ?? "",
  bagDiameterMm: toNullableNumber(payload.bagDiameterMm),
  bagLengthMm: toNullableNumber(payload.bagLengthMm),
  topDesign: payload.topDesign?.trim() ?? "",
  bottomDesign: payload.bottomDesign?.trim() ?? "",
  accessoriesMaterial: payload.accessoriesMaterial?.trim() ?? "",
  requestedMaterialNotes: payload.requestedMaterialNotes?.trim() ?? "",
  knownRequiredPrice: toNullableNumber(payload.knownRequiredPrice),
  knownCompetitorPrice: toNullableNumber(payload.knownCompetitorPrice),
  customerCommissionPercent: toNullableNumber(payload.customerCommissionPercent),
  priceNegotiationExpected: Boolean(payload.priceNegotiationExpected),
  requestedDeliveryTime: payload.requestedDeliveryTime?.trim() ?? "",
  deliveryPlace: (payload.deliveryPlace ?? "factory") as DeliveryPlace,
  assignedTo: payload.assignedTo?.trim() ?? "",
  archived: payload.archived ?? false,
  transportationRequired: Boolean(payload.transportationRequired),
  installationRequired: Boolean(payload.installationRequired),
  notes: payload.notes?.trim() ?? "",
  status: payload.status ?? "DRAFT_INTAKE",
  createdAt: payload.createdAt ?? "",
  updatedAt: payload.updatedAt ?? "",
});

const normalizeProductConfigurationPayload = (
  payload: Partial<ProductConfiguration>,
  tenantId: string,
  tenderId: string,
): ProductConfiguration => ({
  entityType: "PRODUCT_CONFIGURATION",
  tenantId,
  tenderId,
  productConfigId: payload.productConfigId ?? "base",
  productType: payload.productType?.trim() || "Filter Bag",
  quantity: toNullableNumber(payload.quantity),
  bagDiameterMm: toNullableNumber(payload.bagDiameterMm),
  bagLengthMm: toNullableNumber(payload.bagLengthMm),
  seamAllowanceMm: toNullableNumber(payload.seamAllowanceMm),
  topBottomAllowanceMm: toNullableNumber(payload.topBottomAllowanceMm),
  topDesign: payload.topDesign?.trim() ?? "",
  bottomDesign: payload.bottomDesign?.trim() ?? "",
  seamType: payload.seamType?.trim() ?? "",
  includeWearStrip: Boolean(payload.includeWearStrip),
  wearStripHeightMm: toNullableNumber(payload.wearStripHeightMm),
  mainFabricMaterialId: payload.mainFabricMaterialId?.trim() ?? "",
  accessoriesMaterialId: payload.accessoriesMaterialId?.trim() ?? "",
  threadMaterialId: payload.threadMaterialId?.trim() ?? "",
  packagingType: payload.packagingType?.trim() ?? "",
  bagsPerCarton: toNullableNumber(payload.bagsPerCarton),
  packagingNotes: payload.packagingNotes?.trim() ?? "",
  createdAt: payload.createdAt ?? "",
  updatedAt: payload.updatedAt ?? "",
});

const normalizeRollCalculationPayload = (
  payload: Partial<RollCalculation>,
  tenantId: string,
  tenderId: string,
): RollCalculation => ({
  entityType: "ROLL_CALCULATION",
  tenantId,
  tenderId,
  productConfigId: payload.productConfigId ?? "base",
  bagDiameterMm: toNullableNumber(payload.bagDiameterMm),
  bagLengthMm: toNullableNumber(payload.bagLengthMm),
  seamAllowanceMm: toNullableNumber(payload.seamAllowanceMm),
  topBottomAllowanceMm: toNullableNumber(payload.topBottomAllowanceMm),
  bagWidthMm: toNullableNumber(payload.bagWidthMm),
  bagCuttingAreaM2: toNullableNumber(payload.bagCuttingAreaM2),
  rollWidthM: toNullableNumber(payload.rollWidthM),
  rollLengthM: toNullableNumber(payload.rollLengthM),
  rollAreaM2: toNullableNumber(payload.rollAreaM2),
  wastePercent: toNullableNumber(payload.wastePercent),
  usableRollAreaM2: toNullableNumber(payload.usableRollAreaM2),
  theoreticalBagsPerRoll: toNullableNumber(payload.theoreticalBagsPerRoll),
  actualBagsPerRoll: toNullableNumber(payload.actualBagsPerRoll),
  actualAreaPerBagM2: toNullableNumber(payload.actualAreaPerBagM2),
  totalFabricRequiredM2: toNullableNumber(payload.totalFabricRequiredM2),
  createdAt: payload.createdAt ?? "",
  updatedAt: payload.updatedAt ?? "",
});

const normalizeMaterialSourceSelectionPayload = (
  payload: Partial<MaterialSourceSelection>,
  tenantId: string,
  tenderId: string,
): MaterialSourceSelection => ({
  entityType: "MATERIAL_SOURCE_SELECTION",
  tenantId,
  tenderId,
  productConfigId: payload.productConfigId ?? "base",
  materialId: payload.materialId?.trim() ?? "",
  sourcingStrategy: payload.sourcingStrategy === "combine-sources" ? "combine-sources" : "single-source",
  selectedSources: Array.isArray(payload.selectedSources)
    ? payload.selectedSources.map((source) => ({
        sourceId: source.sourceId?.trim() ?? "",
        sourceName: source.sourceName?.trim() ?? "",
        sourceType: source.sourceType === "import" ? "import" : "stock",
        qtyUsedM2: toNullableNumber(source.qtyUsedM2),
        unitCostUsdPerM2: toNullableNumber(source.unitCostUsdPerM2),
        totalCostUsd: toNullableNumber(source.totalCostUsd),
        leadTimeDays: toNullableNumber(source.leadTimeDays),
      }))
    : [],
  totalAllocatedQtyM2: toNullableNumber(payload.totalAllocatedQtyM2),
  weightedAverageUnitCostUsdPerM2: toNullableNumber(payload.weightedAverageUnitCostUsdPerM2),
  exchangeRate: toNullableNumber(payload.exchangeRate),
  currencySafetyFactorPercent: toNullableNumber(payload.currencySafetyFactorPercent),
  effectiveExchangeRate: toNullableNumber(payload.effectiveExchangeRate),
  freightCostPerM2Egp: toNullableNumber(payload.freightCostPerM2Egp),
  customsCostPerM2Egp: toNullableNumber(payload.customsCostPerM2Egp),
  otherChargesPerM2Egp: toNullableNumber(payload.otherChargesPerM2Egp),
  landedCostEgpPerM2: toNullableNumber(payload.landedCostEgpPerM2),
  materialCostPerBagEgp: toNullableNumber(payload.materialCostPerBagEgp),
  totalMaterialCostEgp: toNullableNumber(payload.totalMaterialCostEgp),
  totalLeadTimeDays: toNullableNumber(payload.totalLeadTimeDays),
  createdAt: payload.createdAt ?? "",
  updatedAt: payload.updatedAt ?? "",
});

const normalizeCostBuildUpPayload = (
  payload: Partial<CostBuildUp>,
  tenantId: string,
  tenderId: string,
): CostBuildUp => ({
  entityType: "COST_BUILDUP",
  tenantId,
  tenderId,
  productConfigId: payload.productConfigId ?? "base",
  alternativeId: payload.alternativeId?.trim() ?? "base",
  quantity: toNullableNumber(payload.quantity),
  currency: "EGP",
  costLines: Array.isArray(payload.costLines)
    ? payload.costLines.map((line) => ({
        code: line.code?.trim() ?? "",
        category: line.category?.trim() ?? "",
        description: line.description?.trim() ?? "",
        calculationBasis: line.calculationBasis?.trim() ?? "",
        costPerBag: toNullableNumber(line.costPerBag),
        editable: Boolean(line.editable),
      }))
    : [],
  totalMaterialCostPerBag: toNullableNumber(payload.totalMaterialCostPerBag),
  totalOperatingCostPerBag: toNullableNumber(payload.totalOperatingCostPerBag),
  totalAdditionalCostPerBag: toNullableNumber(payload.totalAdditionalCostPerBag),
  totalCostPricePerBag: toNullableNumber(payload.totalCostPricePerBag),
  totalCostPriceForOrder: toNullableNumber(payload.totalCostPriceForOrder),
  createdAt: payload.createdAt ?? "",
  updatedAt: payload.updatedAt ?? "",
});

const normalizeCustomerPayload = (payload: Partial<Customer>, tenantId: string): Customer => ({
  entityType: "CUSTOMER",
  tenantId,
  customerId: payload.customerId ?? crypto.randomUUID(),
  customerName: payload.customerName?.trim() ?? "",
  country: payload.country?.trim() ?? "",
  contactName: payload.contactName?.trim() ?? "",
  email: payload.email?.trim() ?? "",
  phone: payload.phone?.trim() ?? "",
  active: payload.active ?? true,
  createdAt: payload.createdAt ?? "",
  updatedAt: payload.updatedAt ?? "",
});

const normalizeMaterialPayload = (payload: Partial<Material>, tenantId: string): Material => ({
  entityType: "MATERIAL",
  tenantId,
  materialId: payload.materialId ?? crypto.randomUUID(),
  materialName: payload.materialName?.trim() ?? "",
  category: (payload.category ?? "FabricMaterial") as Material["category"],
  temperatureLimit: payload.temperatureLimit?.trim() ?? "",
  chemicalResistance: payload.chemicalResistance?.trim() ?? "",
  defaultWastePercent: toNullableNumber(payload.defaultWastePercent),
  rollWidthM: toNullableNumber(payload.rollWidthM),
  rollLengthM: toNullableNumber(payload.rollLengthM),
  active: payload.active ?? true,
  createdAt: payload.createdAt ?? "",
  updatedAt: payload.updatedAt ?? "",
});

const normalizeStockItemPayload = (payload: Partial<StockItem>, tenantId: string): StockItem => ({
  entityType: "STOCK_ITEM",
  tenantId,
  stockId: payload.stockId ?? crypto.randomUUID(),
  supplierId: payload.supplierId?.trim() ?? "",
  materialId: payload.materialId?.trim() ?? "",
  unitCount: toNullableNumber(payload.unitCount),
  active: payload.active ?? true,
  createdAt: payload.createdAt ?? "",
  updatedAt: payload.updatedAt ?? "",
});

const normalizeImportPresetPayload = (payload: Partial<ImportPreset>, tenantId: string): ImportPreset => ({
  entityType: "IMPORT_PRESET",
  tenantId,
  importPresetId: payload.importPresetId ?? crypto.randomUUID(),
  supplierId: payload.supplierId?.trim() ?? "",
  materialId: payload.materialId?.trim() ?? "",
  leadTimeDays: toNullableNumber(payload.leadTimeDays),
  unitCostUsdPerM2: toNullableNumber(payload.unitCostUsdPerM2),
  active: payload.active ?? true,
  createdAt: payload.createdAt ?? "",
  updatedAt: payload.updatedAt ?? "",
});

const normalizeSupplierPayload = (payload: Partial<Supplier>, tenantId: string): Supplier => ({
  entityType: "SUPPLIER",
  tenantId,
  supplierId: payload.supplierId ?? crypto.randomUUID(),
  supplierName: payload.supplierName?.trim() ?? "",
  country: payload.country?.trim() ?? "",
  contactName: payload.contactName?.trim() ?? "",
  email: payload.email?.trim() ?? "",
  phone: payload.phone?.trim() ?? "",
  preferred: payload.preferred ?? false,
  active: payload.active ?? true,
  createdAt: payload.createdAt ?? "",
  updatedAt: payload.updatedAt ?? "",
});

const normalizeProductPayload = (payload: Partial<Product>, tenantId: string): Product => ({
  entityType: "PRODUCT",
  tenantId,
  productId: payload.productId ?? crypto.randomUUID(),
  productName: payload.productName?.trim() ?? "",
  productType: payload.productType?.trim() ?? "",
  defaultTopDesign: payload.defaultTopDesign?.trim() ?? "",
  defaultBottomDesign: payload.defaultBottomDesign?.trim() ?? "",
  defaultSeamAllowanceMm: toNullableNumber(payload.defaultSeamAllowanceMm),
  defaultTopBottomAllowanceMm: toNullableNumber(payload.defaultTopBottomAllowanceMm),
  active: payload.active ?? true,
  createdAt: payload.createdAt ?? "",
  updatedAt: payload.updatedAt ?? "",
});

const normalizeAccessoryPayload = (payload: Partial<Accessory>, tenantId: string): Accessory => ({
  entityType: "ACCESSORY",
  tenantId,
  accessoryId: payload.accessoryId ?? crypto.randomUUID(),
  accessoryName: payload.accessoryName?.trim() ?? "",
  material: payload.material?.trim() ?? "",
  unit: payload.unit?.trim() ?? "",
  defaultCost: toNullableNumber(payload.defaultCost),
  active: payload.active ?? true,
  createdAt: payload.createdAt ?? "",
  updatedAt: payload.updatedAt ?? "",
});

const normalizeSupplierOfferPayload = (
  payload: Partial<SupplierOffer>,
  tenantId: string,
  supplierId: string,
): SupplierOffer => ({
  entityType: "SUPPLIER_OFFER",
  tenantId,
  offerId: payload.offerId ?? crypto.randomUUID(),
  supplierId,
  materialId: payload.materialId?.trim() ?? "",
  unitCostUsdPerM2: toNullableNumber(payload.unitCostUsdPerM2),
  minOrderQty: toNullableNumber(payload.minOrderQty),
  leadTimeDays: toNullableNumber(payload.leadTimeDays),
  freightCost: toNullableNumber(payload.freightCost),
  customsEstimate: toNullableNumber(payload.customsEstimate),
  validUntil: payload.validUntil ?? "",
  createdAt: payload.createdAt ?? "",
  updatedAt: payload.updatedAt ?? "",
});

const sanitizeTender = (item: StoredEntity | null): TenderRequest | null => {
  if (!item) {
    return null;
  }

  return {
    entityType: item.entityType,
    tenderId: String(item.tenderId ?? ""),
    tenantId: item.tenantId,
    customerName: String(item.customerName ?? ""),
    tenderNumber: String(item.tenderNumber ?? ""),
    internalInquiryNumber: String(item.internalInquiryNumber ?? ""),
    tenderDueDate: String(item.tenderDueDate ?? ""),
    requestType: item.requestType as TenderRequestType,
    requestedMaterial: String(item.requestedMaterial ?? ""),
    bagDiameterMm: toNullableNumber(item.bagDiameterMm),
    bagLengthMm: toNullableNumber(item.bagLengthMm),
    topDesign: String(item.topDesign ?? ""),
    bottomDesign: String(item.bottomDesign ?? ""),
    accessoriesMaterial: String(item.accessoriesMaterial ?? ""),
    requestedMaterialNotes: String(item.requestedMaterialNotes ?? ""),
    knownRequiredPrice: toNullableNumber(item.knownRequiredPrice),
    knownCompetitorPrice: toNullableNumber(item.knownCompetitorPrice),
    customerCommissionPercent: toNullableNumber(item.customerCommissionPercent),
    priceNegotiationExpected: Boolean(item.priceNegotiationExpected),
    requestedDeliveryTime: String(item.requestedDeliveryTime ?? ""),
    deliveryPlace: item.deliveryPlace as DeliveryPlace,
    assignedTo: String(item.assignedTo ?? ""),
    archived: Boolean(item.archived),
    transportationRequired: Boolean(item.transportationRequired),
    installationRequired: Boolean(item.installationRequired),
    notes: String(item.notes ?? ""),
    status: item.status as TenderRequest["status"],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const sanitizeProductConfiguration = (item: StoredEntity | null): ProductConfiguration | null => {
  if (!item) {
    return null;
  }

  return {
    entityType: item.entityType,
    tenantId: item.tenantId,
    tenderId: String(item.tenderId ?? ""),
    productConfigId: String(item.productConfigId ?? "base"),
    productType: String(item.productType ?? "Filter Bag"),
    quantity: toNullableNumber(item.quantity),
    bagDiameterMm: toNullableNumber(item.bagDiameterMm),
    bagLengthMm: toNullableNumber(item.bagLengthMm),
    seamAllowanceMm: toNullableNumber(item.seamAllowanceMm),
    topBottomAllowanceMm: toNullableNumber(item.topBottomAllowanceMm),
    topDesign: String(item.topDesign ?? ""),
    bottomDesign: String(item.bottomDesign ?? ""),
    seamType: String(item.seamType ?? ""),
    includeWearStrip: Boolean(item.includeWearStrip),
    wearStripHeightMm: toNullableNumber(item.wearStripHeightMm),
    mainFabricMaterialId: String(item.mainFabricMaterialId ?? ""),
    accessoriesMaterialId: String(item.accessoriesMaterialId ?? ""),
    threadMaterialId: String(item.threadMaterialId ?? ""),
    packagingType: String(item.packagingType ?? ""),
    bagsPerCarton: toNullableNumber(item.bagsPerCarton),
    packagingNotes: String(item.packagingNotes ?? ""),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const sanitizeRollCalculation = (item: StoredEntity | null): RollCalculation | null => {
  if (!item) {
    return null;
  }

  return {
    entityType: item.entityType,
    tenantId: item.tenantId,
    tenderId: String(item.tenderId ?? ""),
    productConfigId: String(item.productConfigId ?? "base"),
    bagDiameterMm: toNullableNumber(item.bagDiameterMm),
    bagLengthMm: toNullableNumber(item.bagLengthMm),
    seamAllowanceMm: toNullableNumber(item.seamAllowanceMm),
    topBottomAllowanceMm: toNullableNumber(item.topBottomAllowanceMm),
    bagWidthMm: toNullableNumber(item.bagWidthMm),
    bagCuttingAreaM2: toNullableNumber(item.bagCuttingAreaM2),
    rollWidthM: toNullableNumber(item.rollWidthM),
    rollLengthM: toNullableNumber(item.rollLengthM),
    rollAreaM2: toNullableNumber(item.rollAreaM2),
    wastePercent: toNullableNumber(item.wastePercent),
    usableRollAreaM2: toNullableNumber(item.usableRollAreaM2),
    theoreticalBagsPerRoll: toNullableNumber(item.theoreticalBagsPerRoll),
    actualBagsPerRoll: toNullableNumber(item.actualBagsPerRoll),
    actualAreaPerBagM2: toNullableNumber(item.actualAreaPerBagM2),
    totalFabricRequiredM2: toNullableNumber(item.totalFabricRequiredM2),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const sanitizeMaterialSourceSelection = (item: StoredEntity | null): MaterialSourceSelection | null => {
  if (!item) {
    return null;
  }

  return {
    entityType: item.entityType,
    tenantId: item.tenantId,
    tenderId: String(item.tenderId ?? ""),
    productConfigId: String(item.productConfigId ?? "base"),
    materialId: String(item.materialId ?? ""),
    sourcingStrategy: item.sourcingStrategy === "combine-sources" ? "combine-sources" : "single-source",
    selectedSources: Array.isArray(item.selectedSources)
      ? item.selectedSources.map((source) => {
          const record = source as Record<string, unknown>;
          return {
            sourceId: String(record.sourceId ?? ""),
            sourceName: String(record.sourceName ?? ""),
            sourceType: record.sourceType === "import" ? "import" : "stock",
            qtyUsedM2: toNullableNumber(record.qtyUsedM2),
            unitCostUsdPerM2: toNullableNumber(record.unitCostUsdPerM2),
            totalCostUsd: toNullableNumber(record.totalCostUsd),
            leadTimeDays: toNullableNumber(record.leadTimeDays),
          };
        })
      : [],
    totalAllocatedQtyM2: toNullableNumber(item.totalAllocatedQtyM2),
    weightedAverageUnitCostUsdPerM2: toNullableNumber(item.weightedAverageUnitCostUsdPerM2),
    exchangeRate: toNullableNumber(item.exchangeRate),
    currencySafetyFactorPercent: toNullableNumber(item.currencySafetyFactorPercent),
    effectiveExchangeRate: toNullableNumber(item.effectiveExchangeRate),
    freightCostPerM2Egp: toNullableNumber(item.freightCostPerM2Egp),
    customsCostPerM2Egp: toNullableNumber(item.customsCostPerM2Egp),
    otherChargesPerM2Egp: toNullableNumber(item.otherChargesPerM2Egp),
    landedCostEgpPerM2: toNullableNumber(item.landedCostEgpPerM2),
    materialCostPerBagEgp: toNullableNumber(item.materialCostPerBagEgp),
    totalMaterialCostEgp: toNullableNumber(item.totalMaterialCostEgp),
    totalLeadTimeDays: toNullableNumber(item.totalLeadTimeDays),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const sanitizeCostBuildUp = (item: StoredEntity | null): CostBuildUp | null => {
  if (!item) {
    return null;
  }

  return {
    entityType: item.entityType,
    tenantId: item.tenantId,
    tenderId: String(item.tenderId ?? ""),
    productConfigId: String(item.productConfigId ?? "base"),
    alternativeId: String(item.alternativeId ?? "base"),
    quantity: toNullableNumber(item.quantity),
    currency: "EGP",
    costLines: Array.isArray(item.costLines)
      ? item.costLines.map((line) => {
          const record = line as Record<string, unknown>;
          return {
            code: String(record.code ?? ""),
            category: String(record.category ?? ""),
            description: String(record.description ?? ""),
            calculationBasis: String(record.calculationBasis ?? ""),
            costPerBag: toNullableNumber(record.costPerBag),
            editable: Boolean(record.editable),
          };
        })
      : [],
    totalMaterialCostPerBag: toNullableNumber(item.totalMaterialCostPerBag),
    totalOperatingCostPerBag: toNullableNumber(item.totalOperatingCostPerBag),
    totalAdditionalCostPerBag: toNullableNumber(item.totalAdditionalCostPerBag),
    totalCostPricePerBag: toNullableNumber(item.totalCostPricePerBag),
    totalCostPriceForOrder: toNullableNumber(item.totalCostPriceForOrder),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const sanitizeCustomer = (item: StoredEntity | null): Customer | null => {
  if (!item) {
    return null;
  }

  return {
    entityType: item.entityType,
    tenantId: item.tenantId,
    customerId: String(item.customerId ?? ""),
    customerName: String(item.customerName ?? ""),
    country: String(item.country ?? ""),
    contactName: String(item.contactName ?? ""),
    email: String(item.email ?? ""),
    phone: String(item.phone ?? ""),
    active: Boolean(item.active),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const sanitizeMaterial = (item: StoredEntity | null): Material | null => {
  if (!item) {
    return null;
  }

  return {
    entityType: item.entityType,
    tenantId: item.tenantId,
    materialId: String(item.materialId ?? ""),
    materialName: String(item.materialName ?? ""),
    category: (String(item.category ?? "FabricMaterial") as Material["category"]),
    temperatureLimit: String(item.temperatureLimit ?? ""),
    chemicalResistance: String(item.chemicalResistance ?? ""),
    defaultWastePercent: toNullableNumber(item.defaultWastePercent),
    rollWidthM: toNullableNumber(item.rollWidthM),
    rollLengthM: toNullableNumber(item.rollLengthM),
    active: Boolean(item.active),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const sanitizeStockItem = (item: StoredEntity | null): StockItem | null => {
  if (!item) {
    return null;
  }

  return {
    entityType: item.entityType,
    tenantId: item.tenantId,
    stockId: String(item.stockId ?? ""),
    supplierId: String(item.supplierId ?? ""),
    materialId: String(item.materialId ?? ""),
    unitCount: toNullableNumber(item.unitCount),
    active: Boolean(item.active),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const sanitizeImportPreset = (item: StoredEntity | null): ImportPreset | null => {
  if (!item) {
    return null;
  }

  return {
    entityType: item.entityType,
    tenantId: item.tenantId,
    importPresetId: String(item.importPresetId ?? ""),
    supplierId: String(item.supplierId ?? ""),
    materialId: String(item.materialId ?? ""),
    leadTimeDays: toNullableNumber(item.leadTimeDays),
    unitCostUsdPerM2: toNullableNumber(item.unitCostUsdPerM2),
    active: Boolean(item.active),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const sanitizeSupplier = (item: StoredEntity | null): Supplier | null => {
  if (!item) {
    return null;
  }

  return {
    entityType: item.entityType,
    tenantId: item.tenantId,
    supplierId: String(item.supplierId ?? ""),
    supplierName: String(item.supplierName ?? ""),
    country: String(item.country ?? ""),
    contactName: String(item.contactName ?? ""),
    email: String(item.email ?? ""),
    phone: String(item.phone ?? ""),
    preferred: Boolean(item.preferred),
    active: Boolean(item.active),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const sanitizeProduct = (item: StoredEntity | null): Product | null => {
  if (!item) {
    return null;
  }

  return {
    entityType: item.entityType,
    tenantId: item.tenantId,
    productId: String(item.productId ?? ""),
    productName: String(item.productName ?? ""),
    productType: String(item.productType ?? ""),
    defaultTopDesign: String(item.defaultTopDesign ?? ""),
    defaultBottomDesign: String(item.defaultBottomDesign ?? ""),
    defaultSeamAllowanceMm: toNullableNumber(item.defaultSeamAllowanceMm),
    defaultTopBottomAllowanceMm: toNullableNumber(item.defaultTopBottomAllowanceMm),
    active: Boolean(item.active),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const sanitizeAccessory = (item: StoredEntity | null): Accessory | null => {
  if (!item) {
    return null;
  }

  return {
    entityType: item.entityType,
    tenantId: item.tenantId,
    accessoryId: String(item.accessoryId ?? ""),
    accessoryName: String(item.accessoryName ?? ""),
    material: String(item.material ?? ""),
    unit: String(item.unit ?? ""),
    defaultCost: toNullableNumber(item.defaultCost),
    active: Boolean(item.active),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const sanitizeSupplierOffer = (item: StoredEntity | null): SupplierOffer | null => {
  if (!item) {
    return null;
  }

  return {
    entityType: item.entityType,
    tenantId: item.tenantId,
    offerId: String(item.offerId ?? ""),
    supplierId: String(item.supplierId ?? ""),
    materialId: String(item.materialId ?? ""),
    unitCostUsdPerM2: toNullableNumber(item.unitCostUsdPerM2),
    minOrderQty: toNullableNumber(item.minOrderQty),
    leadTimeDays: toNullableNumber(item.leadTimeDays),
    freightCost: toNullableNumber(item.freightCost),
    customsEstimate: toNullableNumber(item.customsEstimate),
    validUntil: String(item.validUntil ?? ""),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const getTenantId = (event: Parameters<APIGatewayProxyHandlerV2>[0]) =>
  event.queryStringParameters?.tenantId ??
  event.pathParameters?.tenantId ??
  parseBody<{ tenantId?: string }>(event.body).tenantId ??
  "alimex-demo";

const baseEnvelope = <T extends { tenantId: string; entityType?: string }>(
  payload: T,
  entityType: string,
  createdAt?: string,
) => ({
  ...payload,
  entityType,
  createdAt: createdAt ?? isoNow(),
  updatedAt: isoNow(),
});

const putRecord = async (tableName: string, item: StoredEntity) => {
  await documentClient.send(
    new PutCommand({
      TableName: tableName,
      Item: item,
    }),
  );
};

const getRecord = async <T>(
  tableName: string,
  tenantId: string,
  sk: string,
) => {
  const response = await documentClient.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: tenantPk(tenantId),
        SK: sk,
      },
    }),
  );

  return (response.Item as T | undefined) ?? null;
};

const queryTenant = async <T>(
  tableName: string,
  tenantId: string,
  beginsWith?: string,
) => {
  const response = await documentClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: beginsWith
        ? "PK = :pk AND begins_with(SK, :sk)"
        : "PK = :pk",
      ExpressionAttributeValues: beginsWith
        ? {
            ":pk": tenantPk(tenantId),
            ":sk": beginsWith,
          }
        : {
            ":pk": tenantPk(tenantId),
          },
    }),
  );

  return (response.Items as T[] | undefined) ?? [];
};

const decodeNextToken = (token?: string | null) => {
  if (!token) {
    return 0;
  }

  try {
    const value = JSON.parse(Buffer.from(token, "base64").toString("utf8")) as { offset?: number };
    return typeof value.offset === "number" ? value.offset : 0;
  } catch {
    return 0;
  }
};

const encodeNextToken = (offset: number) =>
  Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64");

const sectionConfig = {
  "product-configuration": {
    sk: (tenderId: string) => `TENDER#${tenderId}#PRODUCT_CONFIGURATION`,
    entityType: "ProductConfiguration",
  },
  "material-roll-calculation": {
    sk: (tenderId: string) => `TENDER#${tenderId}#ROLL_CALCULATION`,
    entityType: "RollCalculation",
  },
  "material-sourcing": {
    sk: (tenderId: string) => `TENDER#${tenderId}#MATERIAL_SOURCE_SELECTION`,
    entityType: "MaterialSourceSelection",
  },
  "cost-build-up": {
    sk: (tenderId: string) => `TENDER#${tenderId}#COST_BUILD_UP`,
    entityType: "CostBuildUp",
  },
  alternatives: {
    sk: (tenderId: string) => `TENDER#${tenderId}#SCENARIO_ALTERNATIVE`,
    entityType: "ScenarioAlternative",
  },
  "pricing-approval": {
    sk: (tenderId: string) => `TENDER#${tenderId}#PRICING_APPROVAL`,
    entityType: "PricingApproval",
  },
} as const;

const getRequestContext = (event: Parameters<APIGatewayProxyHandlerV2>[0]): RequestContext => {
  const tableName = getTableName();

  if (!tableName) {
    throw new Error("Missing TENDER_PRICING_TABLE environment variable.");
  }

  return {
    tableName,
    tenantId: getTenantId(event),
  };
};

const summarizeTenders = (items: TenderRequest[]) => ({
  total: items.length,
  inProgress: items.filter(
    (item) =>
      !["APPROVED", "OFFER_SUBMITTED", "WON", "LOST", "CANCELLED", "PENDING_APPROVAL"].includes(item.status),
  ).length,
  pendingApproval: items.filter((item) => item.status === "PENDING_APPROVAL").length,
  approved: items.filter((item) => item.status === "APPROVED").length,
  overdue: items.filter(
    (item) =>
      item.tenderDueDate &&
      item.tenderDueDate < new Date().toISOString().slice(0, 10) &&
      !finalTenderStatuses.includes(item.status),
  ).length,
});

const toTenderSummary = (item: TenderRequest) => ({
  tenderId: item.tenderId,
  tenderNumber: item.tenderNumber,
  internalInquiryNumber: item.internalInquiryNumber,
  customerName: item.customerName,
  requestType: item.requestType,
  requestedMaterial: item.requestedMaterial,
  tenderDueDate: item.tenderDueDate,
  requestedDeliveryTime: item.requestedDeliveryTime,
  deliveryPlace: item.deliveryPlace,
  assignedTo: item.assignedTo,
  status: item.status,
  archived: item.archived,
  updatedAt: item.updatedAt,
});

const listTenders = async (
  context: RequestContext,
  params: Parameters<APIGatewayProxyHandlerV2>[0]["queryStringParameters"],
): Promise<TenderListResponse> => {
  const limit = Math.max(1, Number(params?.limit ?? 25));
  const offset = decodeNextToken(params?.nextToken);
  const statusFilter = params?.status as TenderRequest["status"] | undefined;

  const items = statusFilter
    ? await documentClient.send(
        new QueryCommand({
          TableName: context.tableName,
          IndexName: "GSI2",
          KeyConditionExpression: "GSI2PK = :pk",
          ExpressionAttributeValues: {
            ":pk": tenderStatusGsiPk(context.tenantId, statusFilter),
          },
          ScanIndexForward: true,
        }),
      ).then((response) => (response.Items as StoredEntity[] | undefined) ?? [])
    : await documentClient.send(
        new QueryCommand({
          TableName: context.tableName,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk",
          ExpressionAttributeValues: {
            ":pk": tendersGsiPk(context.tenantId),
          },
          ScanIndexForward: false,
        }),
      ).then((response) => (response.Items as StoredEntity[] | undefined) ?? []);

  const normalized = items
    .filter((record) => record.entityType === "TENDER_REQUEST")
    .map(sanitizeTender)
    .filter((record): record is TenderRequest => Boolean(record))
    .filter((record) => !record.archived);

  const filtered = normalized.filter((record) => {
    const search = (params?.search ?? "").toLowerCase();
    const matchesSearch =
      search.length === 0 ||
      [record.customerName, record.tenderNumber, record.internalInquiryNumber]
        .join(" ")
        .toLowerCase()
        .includes(search);
    const matchesStatus = !params?.status || record.status === params.status;
    const matchesRequestType = !params?.requestType || record.requestType === params.requestType;
    const matchesCustomer = !params?.customerName || record.customerName === params.customerName;
    const matchesAssigned = !params?.assignedTo || record.assignedTo === params.assignedTo;
    const matchesDelivery = !params?.deliveryPlace || record.deliveryPlace === params.deliveryPlace;
    const matchesDueFrom = !params?.dueDateFrom || record.tenderDueDate >= params.dueDateFrom;
    const matchesDueTo = !params?.dueDateTo || record.tenderDueDate <= params.dueDateTo;
    return (
      matchesSearch &&
      matchesStatus &&
      matchesRequestType &&
      matchesCustomer &&
      matchesAssigned &&
      matchesDelivery &&
      matchesDueFrom &&
      matchesDueTo
    );
  });

  const sortBy = params?.sortBy ?? "updatedAt";
  const sortDirection = params?.sortDirection === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    const aValue = String((a as Record<string, unknown>)[sortBy] ?? "");
    const bValue = String((b as Record<string, unknown>)[sortBy] ?? "");
    return aValue.localeCompare(bValue) * sortDirection;
  });

  const page = filtered.slice(offset, offset + limit);
  const nextOffset = offset + limit;

  return {
    items: page.map(toTenderSummary),
    nextToken: nextOffset < filtered.length ? encodeNextToken(nextOffset) : null,
    summary: summarizeTenders(filtered),
  };
};

const saveTender = async (context: RequestContext, payload: Partial<TenderRequest>) => {
  const normalized = normalizeTenderPayload(payload, context.tenantId);
  const existing = await getRecord<StoredEntity>(
    context.tableName,
    context.tenantId,
    `TENDER#${normalized.tenderId}`,
  );
  const timestamps = baseEnvelope(
    normalized,
    "TENDER_REQUEST",
    existing?.createdAt as string | undefined,
  );

  const item = {
    PK: tenantPk(context.tenantId),
    SK: `TENDER#${normalized.tenderId}`,
    GSI1PK: tendersGsiPk(context.tenantId),
    GSI1SK: `UPDATED#${timestamps.updatedAt}`,
    GSI2PK: tenderStatusGsiPk(context.tenantId, timestamps.status),
    GSI2SK: `DUE#${timestamps.tenderDueDate || "9999-12-31"}`,
    ...timestamps,
  } satisfies StoredEntity;

  await putRecord(context.tableName, item);
  return sanitizeTender(item)!;
};

const getTender = async (context: RequestContext, tenderId: string) => {
  const sk = `TENDER#${tenderId}`;
  const record = await getRecord<StoredEntity>(context.tableName, context.tenantId, sk);

  console.log("DEBUG getTender lookup", {
    tableName: context.tableName,
    tenantId: context.tenantId,
    pk: tenantPk(context.tenantId),
    sk,
    found: Boolean(record),
    entityType: record?.entityType ?? null,
    recordTenantId: record?.tenantId ?? null,
    recordTenderId: record?.tenderId ?? null,
  });

  return sanitizeTender(record);
};

const updateTenderStatus = async (
  context: RequestContext,
  tenderId: string,
  status: TenderRequest["status"],
) => {
  const existing = await getTender(context, tenderId);

  if (!existing) {
    throw new Error(`Tender ${tenderId} not found.`);
  }

  return saveTender(context, {
    ...existing,
    status,
  });
};

const createTenderActivity = async (
  tableName: string,
  tenderId: string,
  tenantId: string,
  activityType: TenderActivity["activityType"],
  message: string,
) => {
  const createdAt = isoNow();
  const activityId = crypto.randomUUID();
  const item = {
    PK: tenderEntityPk(tenderId),
    SK: `ACTIVITY#${createdAt}#${activityId}`,
    ...baseEnvelope(
      {
        tenantId,
        tenderId,
        activityId,
        activityType,
        message,
      },
      "TENDER_ACTIVITY",
      createdAt,
    ),
  } satisfies StoredEntity;

  await putRecord(tableName, item);
};

const archiveTender = async (context: RequestContext, tenderId: string) => {
  const existing = await getTender(context, tenderId);
  if (!existing) {
    return null;
  }

  const archived = await saveTender(context, {
    ...existing,
    archived: true,
  });

  await createTenderActivity(
    context.tableName,
    tenderId,
    context.tenantId,
    "ARCHIVED",
    `Tender ${existing.tenderNumber || tenderId} archived.`,
  );

  return archived;
};

const deleteTender = async (context: RequestContext, tenderId: string) => {
  const existing = await getTender(context, tenderId);
  if (!existing) {
    return null;
  }

  if (existing.status !== "DRAFT_INTAKE") {
    throw new Error("Only draft tenders can be deleted.");
  }

  await documentClient.send(
    new DeleteCommand({
      TableName: context.tableName,
      Key: {
        PK: tenantPk(context.tenantId),
        SK: `TENDER#${tenderId}`,
      },
    }),
  );

  await createTenderActivity(
    context.tableName,
    tenderId,
    context.tenantId,
    "DELETED",
    `Tender ${existing.tenderNumber || tenderId} deleted.`,
  );

  return existing;
};

const duplicateTender = async (context: RequestContext, tenderId: string) => {
  const existing = await getTender(context, tenderId);
  if (!existing) {
    return null;
  }

  const duplicated = await saveTender(context, {
    ...existing,
    tenderId: crypto.randomUUID(),
    status: "DRAFT_INTAKE",
    archived: false,
    notes: `Copy of ${existing.tenderNumber}. ${existing.notes ?? ""}`.trim(),
  });

  await createTenderActivity(
    context.tableName,
    duplicated.tenderId,
    context.tenantId,
    "DUPLICATED",
    `Tender duplicated from ${existing.tenderNumber || tenderId}.`,
  );

  return duplicated;
};

const getProductConfigurationRecord = async (
  tableName: string,
  tenderId: string,
) => {
  const response = await documentClient.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: tenderEntityPk(tenderId),
        SK: "PRODUCT_CONFIG#base",
      },
    }),
  );

  return (response.Item as StoredEntity | undefined) ?? null;
};

const getProductConfiguration = async (context: RequestContext, tenderId: string) =>
  sanitizeProductConfiguration(await getProductConfigurationRecord(context.tableName, tenderId));

const saveProductConfiguration = async (
  context: RequestContext,
  tenderId: string,
  payload: Partial<ProductConfiguration>,
) => {
  const normalized = normalizeProductConfigurationPayload(payload, context.tenantId, tenderId);
  const existing = await getProductConfigurationRecord(context.tableName, tenderId);
  const timestamps = baseEnvelope(
    normalized,
    "PRODUCT_CONFIGURATION",
    existing?.createdAt as string | undefined,
  );

  const item = {
    PK: tenderEntityPk(tenderId),
    SK: "PRODUCT_CONFIG#base",
    ...timestamps,
  } satisfies StoredEntity;

  await putRecord(context.tableName, item);
  await updateTenderStatus(context, tenderId, "PRODUCT_CONFIGURATION");
  return sanitizeProductConfiguration(item)!;
};

const getRollCalculationRecord = async (tableName: string, tenderId: string) => {
  const response = await documentClient.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: tenderEntityPk(tenderId),
        SK: "ROLL_CALC#base",
      },
    }),
  );

  return (response.Item as StoredEntity | undefined) ?? null;
};

const getRollCalculation = async (context: RequestContext, tenderId: string) =>
  sanitizeRollCalculation(await getRollCalculationRecord(context.tableName, tenderId));

const saveRollCalculation = async (
  context: RequestContext,
  tenderId: string,
  payload: Partial<RollCalculation>,
) => {
  const normalized = normalizeRollCalculationPayload(payload, context.tenantId, tenderId);
  const existing = await getRollCalculationRecord(context.tableName, tenderId);
  const timestamps = baseEnvelope(
    normalized,
    "ROLL_CALCULATION",
    existing?.createdAt as string | undefined,
  );

  const item = {
    PK: tenderEntityPk(tenderId),
    SK: "ROLL_CALC#base",
    ...timestamps,
  } satisfies StoredEntity;

  await putRecord(context.tableName, item);
  await updateTenderStatus(context, tenderId, "MATERIAL_ROLL_CALCULATION");
  return sanitizeRollCalculation(item)!;
};

const getMaterialSourcingRecord = async (tableName: string, tenderId: string) => {
  const response = await documentClient.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: tenderEntityPk(tenderId),
        SK: "MATERIAL_SOURCE#base",
      },
    }),
  );

  return (response.Item as StoredEntity | undefined) ?? null;
};

const getMaterialSourcing = async (context: RequestContext, tenderId: string) =>
  sanitizeMaterialSourceSelection(await getMaterialSourcingRecord(context.tableName, tenderId));

const saveMaterialSourcing = async (
  context: RequestContext,
  tenderId: string,
  payload: Partial<MaterialSourceSelection>,
) => {
  const normalized = normalizeMaterialSourceSelectionPayload(payload, context.tenantId, tenderId);
  const existing = await getMaterialSourcingRecord(context.tableName, tenderId);
  const timestamps = baseEnvelope(
    normalized,
    "MATERIAL_SOURCE_SELECTION",
    existing?.createdAt as string | undefined,
  );

  const item = {
    PK: tenderEntityPk(tenderId),
    SK: "MATERIAL_SOURCE#base",
    ...timestamps,
  } satisfies StoredEntity;

  await putRecord(context.tableName, item);
  await updateTenderStatus(context, tenderId, "MATERIAL_SOURCING");
  return sanitizeMaterialSourceSelection(item)!;
};

const getCostBuildUpRecord = async (tableName: string, tenderId: string) => {
  const response = await documentClient.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: tenderEntityPk(tenderId),
        SK: "COST_BUILDUP#base",
      },
    }),
  );

  return (response.Item as StoredEntity | undefined) ?? null;
};

const getCostBuildUp = async (context: RequestContext, tenderId: string) =>
  sanitizeCostBuildUp(await getCostBuildUpRecord(context.tableName, tenderId));

const saveCostBuildUp = async (
  context: RequestContext,
  tenderId: string,
  payload: Partial<CostBuildUp>,
) => {
  const normalized = normalizeCostBuildUpPayload(payload, context.tenantId, tenderId);
  const existing = await getCostBuildUpRecord(context.tableName, tenderId);
  const timestamps = baseEnvelope(
    normalized,
    "COST_BUILDUP",
    existing?.createdAt as string | undefined,
  );

  const item = {
    PK: tenderEntityPk(tenderId),
    SK: "COST_BUILDUP#base",
    ...timestamps,
  } satisfies StoredEntity;

  await putRecord(context.tableName, item);
  await updateTenderStatus(context, tenderId, "COST_BUILDUP");
  return sanitizeCostBuildUp(item)!;
};

const listTenantEntities = async <T>(
  tableName: string,
  tenantId: string,
  prefix: string,
  sanitizer: (item: StoredEntity | null) => T | null,
) => {
  const items = await queryTenant<StoredEntity>(tableName, tenantId, prefix);
  return items.map((item) => sanitizer(item)).filter((item): item is T => Boolean(item));
};

const saveTenantEntity = async <T extends StoredEntity, U>(
  tableName: string,
  tenantId: string,
  sk: string,
  normalized: U & { tenantId: string },
  entityType: string,
  sanitizer: (item: StoredEntity | null) => T | U | null,
  extra?: Partial<StoredEntity>,
) => {
  const existing = await getRecord<StoredEntity>(tableName, tenantId, sk);
  const timestamps = baseEnvelope(normalized, entityType, existing?.createdAt as string | undefined);
  const item = {
    PK: tenantPk(tenantId),
    SK: sk,
    ...extra,
    ...timestamps,
  } satisfies StoredEntity;

  await putRecord(tableName, item);
  return sanitizer(item);
};

const getCustomer = async (context: RequestContext, customerId: string) =>
  sanitizeCustomer(await getRecord<StoredEntity>(context.tableName, context.tenantId, `CUSTOMER#${customerId}`));

const listCustomers = async (context: RequestContext) =>
  listTenantEntities<Customer>(context.tableName, context.tenantId, "CUSTOMER#", sanitizeCustomer);

const saveCustomer = async (context: RequestContext, payload: Partial<Customer>) =>
  {
    const normalized = normalizeCustomerPayload(payload, context.tenantId);
    return saveTenantEntity(
      context.tableName,
      context.tenantId,
      `CUSTOMER#${normalized.customerId}`,
      normalized,
      "CUSTOMER",
      sanitizeCustomer,
    ) as Promise<Customer>;
  };

const getMaterial = async (context: RequestContext, materialId: string) =>
  sanitizeMaterial(await getRecord<StoredEntity>(context.tableName, context.tenantId, `MATERIAL#${materialId}`));

const listMaterials = async (context: RequestContext) =>
  listTenantEntities<Material>(context.tableName, context.tenantId, "MATERIAL#", sanitizeMaterial);

const saveMaterial = async (context: RequestContext, payload: Partial<Material>) =>
  {
    const normalized = normalizeMaterialPayload(payload, context.tenantId);
    return saveTenantEntity(
      context.tableName,
      context.tenantId,
      `MATERIAL#${normalized.materialId}`,
      normalized,
      "MATERIAL",
      sanitizeMaterial,
    ) as Promise<Material>;
  };

const getStockItem = async (context: RequestContext, stockId: string) =>
  sanitizeStockItem(await getRecord<StoredEntity>(context.tableName, context.tenantId, `STOCK#${stockId}`));

const listStockItems = async (context: RequestContext) =>
  listTenantEntities<StockItem>(context.tableName, context.tenantId, "STOCK#", sanitizeStockItem);

const saveStockItem = async (context: RequestContext, payload: Partial<StockItem>) => {
  const normalized = normalizeStockItemPayload(payload, context.tenantId);
  return saveTenantEntity(
    context.tableName,
    context.tenantId,
    `STOCK#${normalized.stockId}`,
    normalized,
    "STOCK_ITEM",
    sanitizeStockItem,
  ) as Promise<StockItem>;
};

const getImportPreset = async (context: RequestContext, importPresetId: string) =>
  sanitizeImportPreset(await getRecord<StoredEntity>(context.tableName, context.tenantId, `IMPORT_PRESET#${importPresetId}`));

const listImportPresets = async (context: RequestContext) =>
  listTenantEntities<ImportPreset>(context.tableName, context.tenantId, "IMPORT_PRESET#", sanitizeImportPreset);

const saveImportPreset = async (context: RequestContext, payload: Partial<ImportPreset>) => {
  const normalized = normalizeImportPresetPayload(payload, context.tenantId);
  return saveTenantEntity(
    context.tableName,
    context.tenantId,
    `IMPORT_PRESET#${normalized.importPresetId}`,
    normalized,
    "IMPORT_PRESET",
    sanitizeImportPreset,
  ) as Promise<ImportPreset>;
};

const getSupplier = async (context: RequestContext, supplierId: string) =>
  sanitizeSupplier(await getRecord<StoredEntity>(context.tableName, context.tenantId, `SUPPLIER#${supplierId}`));

const listSuppliers = async (context: RequestContext) =>
  listTenantEntities<Supplier>(context.tableName, context.tenantId, "SUPPLIER#", sanitizeSupplier);

const saveSupplier = async (context: RequestContext, payload: Partial<Supplier>) =>
  {
    const normalized = normalizeSupplierPayload(payload, context.tenantId);
    return saveTenantEntity(
      context.tableName,
      context.tenantId,
      `SUPPLIER#${normalized.supplierId}`,
      normalized,
      "SUPPLIER",
      sanitizeSupplier,
    ) as Promise<Supplier>;
  };

const getProduct = async (context: RequestContext, productId: string) =>
  sanitizeProduct(await getRecord<StoredEntity>(context.tableName, context.tenantId, `PRODUCT#${productId}`));

const listProducts = async (context: RequestContext) =>
  listTenantEntities<Product>(context.tableName, context.tenantId, "PRODUCT#", sanitizeProduct);

const saveProduct = async (context: RequestContext, payload: Partial<Product>) =>
  {
    const normalized = normalizeProductPayload(payload, context.tenantId);
    return saveTenantEntity(
      context.tableName,
      context.tenantId,
      `PRODUCT#${normalized.productId}`,
      normalized,
      "PRODUCT",
      sanitizeProduct,
    ) as Promise<Product>;
  };

const getAccessory = async (context: RequestContext, accessoryId: string) =>
  sanitizeAccessory(await getRecord<StoredEntity>(context.tableName, context.tenantId, `ACCESSORY#${accessoryId}`));

const listAccessories = async (context: RequestContext) =>
  listTenantEntities<Accessory>(context.tableName, context.tenantId, "ACCESSORY#", sanitizeAccessory);

const saveAccessory = async (context: RequestContext, payload: Partial<Accessory>) =>
  {
    const normalized = normalizeAccessoryPayload(payload, context.tenantId);
    return saveTenantEntity(
      context.tableName,
      context.tenantId,
      `ACCESSORY#${normalized.accessoryId}`,
      normalized,
      "ACCESSORY",
      sanitizeAccessory,
    ) as Promise<Accessory>;
  };

const getSupplierOfferById = async (tableName: string, supplierId: string, offerId: string) => {
  const response = await documentClient.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI3",
      KeyConditionExpression: "GSI3PK = :pk AND GSI3SK = :sk",
      ExpressionAttributeValues: {
        ":pk": supplierOffersGsiPk(supplierId),
        ":sk": `OFFER#${offerId}`,
      },
    }),
  );

  return ((response.Items as StoredEntity[] | undefined) ?? [])[0] ?? null;
};

const listSupplierOffers = async (tableName: string, supplierId: string) => {
  const response = await documentClient.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI3",
      KeyConditionExpression: "GSI3PK = :pk",
      ExpressionAttributeValues: {
        ":pk": supplierOffersGsiPk(supplierId),
      },
    }),
  );

  return ((response.Items as StoredEntity[] | undefined) ?? [])
    .map((item) => sanitizeSupplierOffer(item))
    .filter((item): item is SupplierOffer => Boolean(item));
};

const saveSupplierOffer = async (
  context: RequestContext,
  supplierId: string,
  payload: Partial<SupplierOffer>,
) => {
  const normalized = normalizeSupplierOfferPayload(payload, context.tenantId, supplierId);
  const offerId = normalized.offerId;
  const existing = offerId
    ? await getSupplierOfferById(context.tableName, supplierId, offerId)
    : null;
  const timestamps = baseEnvelope(
    normalized,
    "SUPPLIER_OFFER",
    existing?.createdAt as string | undefined,
  );
  const materialId = normalized.materialId || (existing?.materialId as string | undefined) || "";
  const item = {
    PK: `MATERIAL#${materialId}`,
    SK: `SUPPLIER#${supplierId}#OFFER#${offerId}`,
    GSI3PK: supplierOffersGsiPk(supplierId),
    GSI3SK: `OFFER#${offerId}`,
    ...timestamps,
  } satisfies StoredEntity;

  await putRecord(context.tableName, item);
  return sanitizeSupplierOffer(item)!;
};

const deleteSupplierOffer = async (tableName: string, supplierId: string, offerId: string) => {
  const existing = await getSupplierOfferById(tableName, supplierId, offerId);
  if (!existing) {
    return null;
  }

  await documentClient.send(
    new DeleteCommand({
      TableName: tableName,
      Key: {
        PK: existing.PK,
        SK: existing.SK,
      },
    }),
  );

  return sanitizeSupplierOffer(existing);
};

const archiveTenantEntity = async (
  tableName: string,
  tenantId: string,
  sk: string,
  sanitizer: (item: StoredEntity | null) => unknown,
) => {
  const existing = await getRecord<StoredEntity>(tableName, tenantId, sk);
  if (!existing) {
    return null;
  }

  if ("active" in existing && existing.active === true) {
    const item = {
      ...existing,
      active: false,
      updatedAt: isoNow(),
    } satisfies StoredEntity;
    await putRecord(tableName, item);
    return sanitizer(item);
  }

  await documentClient.send(
    new DeleteCommand({
      TableName: tableName,
      Key: {
        PK: existing.PK,
        SK: existing.SK,
      },
    }),
  );

  return sanitizer(existing);
};

const saveTenderSection = async (
  context: RequestContext,
  tenderId: string,
  section: keyof typeof sectionConfig,
  payload:
    | ProductConfiguration
    | RollCalculation
    | MaterialSourceSelection
    | CostBuildUp
    | ScenarioAlternative
    | ApprovalSummary,
) => {
  const config = sectionConfig[section];
  const existing = await getRecord<StoredEntity>(context.tableName, context.tenantId, config.sk(tenderId));
  const item = {
    PK: tenantPk(context.tenantId),
    SK: config.sk(tenderId),
    ...baseEnvelope(
      {
        ...payload,
        tenderId,
        tenantId: context.tenantId,
      },
      config.entityType,
      existing?.createdAt as string | undefined,
    ),
  } satisfies StoredEntity;

  await putRecord(context.tableName, item);
  return item;
};

const getTenderSection = async (
  context: RequestContext,
  tenderId: string,
  section: keyof typeof sectionConfig,
) => {
  return getRecord<StoredEntity>(context.tableName, context.tenantId, sectionConfig[section].sk(tenderId));
};

const listScenarios = async ({ tableName, tenantId }: RequestContext) => {
  const records = await queryTenant<StoredEntity>(tableName, tenantId, "SCENARIO#");
  return records.filter(
    (record): record is StoredEntity & PricingScenario => record.entityType === "PricingScenario",
  );
};

const saveScenario = async (context: RequestContext, payload: PricingScenario) => {
  const existing = await getRecord<StoredEntity>(
    context.tableName,
    context.tenantId,
    `SCENARIO#${payload.scenarioId}`,
  );

  const item = {
    PK: tenantPk(context.tenantId),
    SK: `SCENARIO#${payload.scenarioId}`,
    ...baseEnvelope(
      {
        ...payload,
        tenantId: context.tenantId,
      },
      "PricingScenario",
      existing?.createdAt as string | undefined,
    ),
  } satisfies StoredEntity;

  await putRecord(context.tableName, item);
  return item as PricingScenario;
};

const getScenario = async (context: RequestContext, scenarioId: string) =>
  getRecord<PricingScenario>(context.tableName, context.tenantId, `SCENARIO#${scenarioId}`);

const dashboardSummary = async (context: RequestContext): Promise<DashboardSummary> => {
  const items = await queryTenant<StoredEntity>(context.tableName, context.tenantId);

  return {
    tenantId: context.tenantId,
    tenderCount: items.filter((item) => item.entityType === "TENDER_REQUEST").length,
    scenarioCount: items.filter((item) => item.entityType === "PricingScenario").length,
    approvalCount: items.filter((item) => item.entityType === "PricingApproval").length,
    supplierCount: items.filter((item) => item.entityType === "MaterialSourceSelection").length,
  };
};

const seedDevData = async (context: RequestContext) => {
  if (!isDevEnabled()) {
    return json(403, { message: "Development-only endpoint disabled." });
  }

  const createdAt = isoNow();

  const tender: TenderRequest = {
    entityType: "TENDER_REQUEST",
    tenderId: "TDR-1001",
    tenantId: context.tenantId,
    customerName: "Sample Customer",
    tenderNumber: "TEN-2026-1001",
    internalInquiryNumber: "INQ-1001",
    tenderDueDate: "2026-06-15",
    requestType: "public tender",
    requestedMaterial: "Laminated foil",
    bagDiameterMm: 300,
    bagLengthMm: 500,
    topDesign: "Heat sealed",
    bottomDesign: "Flat bottom",
    accessoriesMaterial: "Valve set",
    requestedMaterialNotes: "Development-only seeded record.",
    knownRequiredPrice: 112500,
    knownCompetitorPrice: 109950,
    customerCommissionPercent: 2.5,
    priceNegotiationExpected: true,
    requestedDeliveryTime: "4 weeks after confirmation",
    deliveryPlace: "customer facility",
    transportationRequired: true,
    installationRequired: false,
    notes: "Development-only seeded record.",
    status: "TECHNICAL_REVIEW",
    createdAt,
    updatedAt: createdAt,
  };

  const scenario: PricingScenario = {
    entityType: "PricingScenario",
    scenarioId: "SCN-1001",
    tenantId: context.tenantId,
    tenderId: tender.tenderId,
    name: "Base Scenario",
    status: "under-review",
    selectedAlternativeId: "ALT-1001",
    createdAt,
    updatedAt: createdAt,
    versions: [
      {
        entityType: "PriceVersion",
        scenarioId: "SCN-1001",
        tenantId: context.tenantId,
        versionId: "VER-1",
        versionNumber: 1,
        status: "draft",
        totalPrice: 125000,
        currency: "USD",
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };

  const configuration: ProductConfiguration = {
    entityType: "PRODUCT_CONFIGURATION",
    tenantId: context.tenantId,
    tenderId: tender.tenderId,
    productConfigId: "base",
    productType: "Filter Bag",
    quantity: 1000,
    bagDiameterMm: 300,
    bagLengthMm: 500,
    seamAllowanceMm: 18,
    topBottomAllowanceMm: 24,
    topDesign: "Snap band",
    bottomDesign: "Disc bottom",
    seamType: "Folded stitch seam",
    includeWearStrip: true,
    wearStripHeightMm: 120,
    mainFabricMaterialId: "FAB-001",
    accessoriesMaterialId: "ACC-002",
    threadMaterialId: "THR-001",
    packagingType: "carton",
    bagsPerCarton: 25,
    packagingNotes: "Development-only seeded record.",
    createdAt,
    updatedAt: createdAt,
  };

  const rollCalculation: RollCalculation = {
    entityType: "ROLL_CALCULATION",
    tenantId: context.tenantId,
    tenderId: tender.tenderId,
    productConfigId: "base",
    bagDiameterMm: 300,
    bagLengthMm: 500,
    seamAllowanceMm: 18,
    topBottomAllowanceMm: 24,
    bagWidthMm: Math.PI * 300 + 18,
    bagCuttingAreaM2: ((Math.PI * 300 + 18) * (500 + 24)) / 1_000_000,
    rollWidthM: 1.6,
    rollLengthM: 100,
    rollAreaM2: 160,
    wastePercent: 5,
    usableRollAreaM2: 152,
    theoreticalBagsPerRoll: 965.213,
    actualBagsPerRoll: 965,
    actualAreaPerBagM2: 0.1658,
    totalFabricRequiredM2: 165.8,
    createdAt,
    updatedAt: createdAt,
  };

  const approval: ApprovalSummary = {
    approvalsOpen: 1,
    status: "pending",
  };

  await saveTender(context, tender);
  await saveScenario(context, scenario);
  await saveProductConfiguration(context, tender.tenderId, configuration);
  await saveRollCalculation(context, tender.tenderId, rollCalculation);
  await saveTenderSection(context, tender.tenderId, "pricing-approval", approval);

  return json(201, {
    message: "Development-only seed completed.",
    tenantId: context.tenantId,
  });
};

const clearTenant = async (context: RequestContext) => {
  if (!isDevEnabled()) {
    return json(403, { message: "Development-only endpoint disabled." });
  }

  const items = await queryTenant<StoredEntity>(context.tableName, context.tenantId);

  for (let index = 0; index < items.length; index += 25) {
    const chunk = items.slice(index, index + 25);
    await documentClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [context.tableName]: chunk.map((item) => ({
            DeleteRequest: {
              Key: {
                PK: item.PK,
                SK: item.SK,
              },
            },
          })),
        },
      }),
    );
  }

  return json(200, {
    message: "Development-only tenant clear completed.",
    tenantId: context.tenantId,
    deletedCount: items.length,
  });
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const context = getRequestContext(event);
    const method = event.requestContext.http.method;
    const path = event.rawPath;
    const tenderId = event.pathParameters?.tenderId;
    const scenarioId = event.pathParameters?.scenarioId;
    const section = event.pathParameters?.section as keyof typeof sectionConfig | undefined;

    if (method === "GET" && path === "/dashboard/summary") {
      return json(200, await dashboardSummary(context));
    }

    if (method === "GET" && path === "/customers") {
      return json(200, await listCustomers(context));
    }

    if (method === "POST" && path === "/customers") {
      return json(201, await saveCustomer(context, parseBody<Partial<Customer>>(event.body)));
    }

    if (event.pathParameters?.customerId && method === "GET" && path === `/customers/${event.pathParameters.customerId}`) {
      const customer = await getCustomer(context, event.pathParameters.customerId);
      return customer ? json(200, customer) : json(404, { message: "Customer not found." });
    }

    if (event.pathParameters?.customerId && method === "PUT" && path === `/customers/${event.pathParameters.customerId}`) {
      return json(
        200,
        await saveCustomer(context, {
          ...parseBody<Partial<Customer>>(event.body),
          customerId: event.pathParameters.customerId,
        }),
      );
    }

    if (event.pathParameters?.customerId && method === "DELETE" && path === `/customers/${event.pathParameters.customerId}`) {
      const customer = await archiveTenantEntity(
        context.tableName,
        context.tenantId,
        `CUSTOMER#${event.pathParameters.customerId}`,
        sanitizeCustomer,
      );
      return customer ? json(200, customer) : json(404, { message: "Customer not found." });
    }

    if (method === "GET" && path === "/materials") {
      return json(200, await listMaterials(context));
    }

    if (method === "POST" && path === "/materials") {
      return json(201, await saveMaterial(context, parseBody<Partial<Material>>(event.body)));
    }

    if (event.pathParameters?.materialId && method === "GET" && path === `/materials/${event.pathParameters.materialId}`) {
      const material = await getMaterial(context, event.pathParameters.materialId);
      return material ? json(200, material) : json(404, { message: "Material not found." });
    }

    if (event.pathParameters?.materialId && method === "PUT" && path === `/materials/${event.pathParameters.materialId}`) {
      return json(
        200,
        await saveMaterial(context, {
          ...parseBody<Partial<Material>>(event.body),
          materialId: event.pathParameters.materialId,
        }),
      );
    }

    if (event.pathParameters?.materialId && method === "DELETE" && path === `/materials/${event.pathParameters.materialId}`) {
      const material = await archiveTenantEntity(
        context.tableName,
        context.tenantId,
        `MATERIAL#${event.pathParameters.materialId}`,
        sanitizeMaterial,
      );
      return material ? json(200, material) : json(404, { message: "Material not found." });
    }

    if (method === "GET" && path === "/stock") {
      return json(200, await listStockItems(context));
    }

    if (method === "POST" && path === "/stock") {
      return json(201, await saveStockItem(context, parseBody<Partial<StockItem>>(event.body)));
    }

    if (event.pathParameters?.stockId && method === "GET" && path === `/stock/${event.pathParameters.stockId}`) {
      const stockItem = await getStockItem(context, event.pathParameters.stockId);
      return stockItem ? json(200, stockItem) : json(404, { message: "Stock item not found." });
    }

    if (event.pathParameters?.stockId && method === "PUT" && path === `/stock/${event.pathParameters.stockId}`) {
      return json(
        200,
        await saveStockItem(context, {
          ...parseBody<Partial<StockItem>>(event.body),
          stockId: event.pathParameters.stockId,
        }),
      );
    }

    if (event.pathParameters?.stockId && method === "DELETE" && path === `/stock/${event.pathParameters.stockId}`) {
      const stockItem = await archiveTenantEntity(
        context.tableName,
        context.tenantId,
        `STOCK#${event.pathParameters.stockId}`,
        sanitizeStockItem,
      );
      return stockItem ? json(200, stockItem) : json(404, { message: "Stock item not found." });
    }

    if (method === "GET" && path === "/import-presets") {
      return json(200, await listImportPresets(context));
    }

    if (method === "POST" && path === "/import-presets") {
      return json(201, await saveImportPreset(context, parseBody<Partial<ImportPreset>>(event.body)));
    }

    if (
      event.pathParameters?.importPresetId &&
      method === "GET" &&
      path === `/import-presets/${event.pathParameters.importPresetId}`
    ) {
      const importPreset = await getImportPreset(context, event.pathParameters.importPresetId);
      return importPreset ? json(200, importPreset) : json(404, { message: "Import preset not found." });
    }

    if (
      event.pathParameters?.importPresetId &&
      method === "PUT" &&
      path === `/import-presets/${event.pathParameters.importPresetId}`
    ) {
      return json(
        200,
        await saveImportPreset(context, {
          ...parseBody<Partial<ImportPreset>>(event.body),
          importPresetId: event.pathParameters.importPresetId,
        }),
      );
    }

    if (
      event.pathParameters?.importPresetId &&
      method === "DELETE" &&
      path === `/import-presets/${event.pathParameters.importPresetId}`
    ) {
      const importPreset = await archiveTenantEntity(
        context.tableName,
        context.tenantId,
        `IMPORT_PRESET#${event.pathParameters.importPresetId}`,
        sanitizeImportPreset,
      );
      return importPreset ? json(200, importPreset) : json(404, { message: "Import preset not found." });
    }

    if (method === "GET" && path === "/suppliers") {
      return json(200, await listSuppliers(context));
    }

    if (method === "POST" && path === "/suppliers") {
      return json(201, await saveSupplier(context, parseBody<Partial<Supplier>>(event.body)));
    }

    if (event.pathParameters?.supplierId && method === "GET" && path === `/suppliers/${event.pathParameters.supplierId}`) {
      const supplier = await getSupplier(context, event.pathParameters.supplierId);
      return supplier ? json(200, supplier) : json(404, { message: "Supplier not found." });
    }

    if (event.pathParameters?.supplierId && method === "PUT" && path === `/suppliers/${event.pathParameters.supplierId}`) {
      return json(
        200,
        await saveSupplier(context, {
          ...parseBody<Partial<Supplier>>(event.body),
          supplierId: event.pathParameters.supplierId,
        }),
      );
    }

    if (event.pathParameters?.supplierId && method === "DELETE" && path === `/suppliers/${event.pathParameters.supplierId}`) {
      const supplier = await archiveTenantEntity(
        context.tableName,
        context.tenantId,
        `SUPPLIER#${event.pathParameters.supplierId}`,
        sanitizeSupplier,
      );
      return supplier ? json(200, supplier) : json(404, { message: "Supplier not found." });
    }

    if (event.pathParameters?.supplierId && method === "GET" && path === `/suppliers/${event.pathParameters.supplierId}/offers`) {
      return json(200, await listSupplierOffers(context.tableName, event.pathParameters.supplierId));
    }

    if (event.pathParameters?.supplierId && method === "POST" && path === `/suppliers/${event.pathParameters.supplierId}/offers`) {
      return json(
        201,
        await saveSupplierOffer(
          context,
          event.pathParameters.supplierId,
          parseBody<Partial<SupplierOffer>>(event.body),
        ),
      );
    }

    if (
      event.pathParameters?.supplierId &&
      event.pathParameters?.offerId &&
      method === "PUT" &&
      path === `/suppliers/${event.pathParameters.supplierId}/offers/${event.pathParameters.offerId}`
    ) {
      return json(
        200,
        await saveSupplierOffer(
          context,
          event.pathParameters.supplierId,
          {
            ...parseBody<Partial<SupplierOffer>>(event.body),
            offerId: event.pathParameters.offerId,
          },
        ),
      );
    }

    if (
      event.pathParameters?.supplierId &&
      event.pathParameters?.offerId &&
      method === "DELETE" &&
      path === `/suppliers/${event.pathParameters.supplierId}/offers/${event.pathParameters.offerId}`
    ) {
      const offer = await deleteSupplierOffer(
        context.tableName,
        event.pathParameters.supplierId,
        event.pathParameters.offerId,
      );
      return offer ? json(200, offer) : json(404, { message: "Supplier offer not found." });
    }

    if (method === "GET" && path === "/products") {
      return json(200, await listProducts(context));
    }

    if (method === "POST" && path === "/products") {
      return json(201, await saveProduct(context, parseBody<Partial<Product>>(event.body)));
    }

    if (event.pathParameters?.productId && method === "GET" && path === `/products/${event.pathParameters.productId}`) {
      const product = await getProduct(context, event.pathParameters.productId);
      return product ? json(200, product) : json(404, { message: "Product not found." });
    }

    if (event.pathParameters?.productId && method === "PUT" && path === `/products/${event.pathParameters.productId}`) {
      return json(
        200,
        await saveProduct(context, {
          ...parseBody<Partial<Product>>(event.body),
          productId: event.pathParameters.productId,
        }),
      );
    }

    if (event.pathParameters?.productId && method === "DELETE" && path === `/products/${event.pathParameters.productId}`) {
      const product = await archiveTenantEntity(
        context.tableName,
        context.tenantId,
        `PRODUCT#${event.pathParameters.productId}`,
        sanitizeProduct,
      );
      return product ? json(200, product) : json(404, { message: "Product not found." });
    }

    if (method === "GET" && path === "/accessories") {
      return json(200, await listAccessories(context));
    }

    if (method === "POST" && path === "/accessories") {
      return json(201, await saveAccessory(context, parseBody<Partial<Accessory>>(event.body)));
    }

    if (event.pathParameters?.accessoryId && method === "GET" && path === `/accessories/${event.pathParameters.accessoryId}`) {
      const accessory = await getAccessory(context, event.pathParameters.accessoryId);
      return accessory ? json(200, accessory) : json(404, { message: "Accessory not found." });
    }

    if (event.pathParameters?.accessoryId && method === "PUT" && path === `/accessories/${event.pathParameters.accessoryId}`) {
      return json(
        200,
        await saveAccessory(context, {
          ...parseBody<Partial<Accessory>>(event.body),
          accessoryId: event.pathParameters.accessoryId,
        }),
      );
    }

    if (event.pathParameters?.accessoryId && method === "DELETE" && path === `/accessories/${event.pathParameters.accessoryId}`) {
      const accessory = await archiveTenantEntity(
        context.tableName,
        context.tenantId,
        `ACCESSORY#${event.pathParameters.accessoryId}`,
        sanitizeAccessory,
      );
      return accessory ? json(200, accessory) : json(404, { message: "Accessory not found." });
    }

    if (method === "GET" && path === "/tenders") {
      return json(200, await listTenders(context, event.queryStringParameters));
    }

    if (method === "POST" && path === "/tenders") {
      return json(201, await saveTender(context, parseBody<Partial<TenderRequest>>(event.body)));
    }

    if (tenderId && method === "GET" && path === `/tenders/${tenderId}`) {
      console.log("DEBUG GET /tenders/{tenderId} request", {
        path,
        method,
        tenderId,
        tenantId: context.tenantId,
        tableName: context.tableName,
        queryStringParameters: event.queryStringParameters ?? {},
        pathParameters: event.pathParameters ?? {},
      });
      const tender = await getTender(context, tenderId);
      console.log("DEBUG GET /tenders/{tenderId} result", {
        tenderId,
        tenantId: context.tenantId,
        found: Boolean(tender),
        status: tender?.status ?? null,
      });
      return tender ? json(200, tender) : json(404, { message: "Tender not found." });
    }

    if (tenderId && method === "POST" && path === `/tenders/${tenderId}/duplicate`) {
      const duplicated = await duplicateTender(context, tenderId);
      return duplicated ? json(201, duplicated) : json(404, { message: "Tender not found." });
    }

    if (tenderId && method === "POST" && path === `/tenders/${tenderId}/archive`) {
      const archived = await archiveTender(context, tenderId);
      return archived ? json(200, archived) : json(404, { message: "Tender not found." });
    }

    if (tenderId && method === "PUT" && path === `/tenders/${tenderId}`) {
      return json(
        200,
        await saveTender(context, {
          ...parseBody<Partial<TenderRequest>>(event.body),
          tenderId,
          tenantId: context.tenantId,
        }),
      );
    }

    if (tenderId && method === "DELETE" && path === `/tenders/${tenderId}`) {
      const deleted = await deleteTender(context, tenderId);
      return deleted ? json(200, deleted) : json(404, { message: "Tender not found." });
    }

    if (tenderId && section && method === "GET" && path === `/tenders/${tenderId}/${section}`) {
      if (section === "product-configuration") {
        const config = await getProductConfiguration(context, tenderId);
        return config ? json(200, config) : json(404, { message: "Product configuration not found." });
      }

      if (section === "material-sourcing") {
        const sourcing = await getMaterialSourcing(context, tenderId);
        return sourcing ? json(200, sourcing) : json(404, { message: "Material sourcing not found." });
      }

      if (section === "cost-build-up") {
        const costBuildUp = await getCostBuildUp(context, tenderId);
        return costBuildUp ? json(200, costBuildUp) : json(404, { message: "Cost build-up not found." });
      }

      const payload = await getTenderSection(context, tenderId, section);
      return payload ? json(200, payload) : json(404, { message: "Tender section not found." });
    }

    if (tenderId && method === "GET" && path === `/tenders/${tenderId}/roll-calculation`) {
      const rollCalculation = await getRollCalculation(context, tenderId);
      return rollCalculation ? json(200, rollCalculation) : json(404, { message: "Roll calculation not found." });
    }

    if (tenderId && method === "PUT" && path === `/tenders/${tenderId}/roll-calculation`) {
      return json(
        200,
        await saveRollCalculation(
          context,
          tenderId,
          parseBody<Partial<RollCalculation>>(event.body),
        ),
      );
    }

    if (tenderId && section && method === "PUT" && path === `/tenders/${tenderId}/${section}`) {
      if (section === "product-configuration") {
        return json(
          200,
          await saveProductConfiguration(
            context,
            tenderId,
            parseBody<Partial<ProductConfiguration>>(event.body),
          ),
        );
      }

      if (section === "material-sourcing") {
        return json(
          200,
          await saveMaterialSourcing(
            context,
            tenderId,
            parseBody<Partial<MaterialSourceSelection>>(event.body),
          ),
        );
      }

      if (section === "cost-build-up") {
        return json(
          200,
          await saveCostBuildUp(
            context,
            tenderId,
            parseBody<Partial<CostBuildUp>>(event.body),
          ),
        );
      }

      return json(
        200,
        await saveTenderSection(
          context,
          tenderId,
          section,
          parseBody<
            | ProductConfiguration
            | RollCalculation
            | MaterialSourceSelection
            | CostBuildUp
            | ScenarioAlternative
            | ApprovalSummary
          >(event.body),
        ),
      );
    }

    if (method === "GET" && path === "/price-scenarios") {
      return json(200, await listScenarios(context));
    }

    if (method === "POST" && path === "/price-scenarios") {
      return json(201, await saveScenario(context, parseBody<PricingScenario>(event.body)));
    }

    if (scenarioId && method === "GET" && path === `/price-scenarios/${scenarioId}`) {
      const scenario = await getScenario(context, scenarioId);
      return scenario ? json(200, scenario) : json(404, { message: "Scenario not found." });
    }

    if (scenarioId && method === "PUT" && path === `/price-scenarios/${scenarioId}`) {
      return json(
        200,
        await saveScenario(context, {
          ...parseBody<PricingScenario>(event.body),
          scenarioId,
          tenantId: context.tenantId,
        }),
      );
    }

    if (method === "POST" && path === "/dev/seed") {
      return seedDevData(context);
    }

    if (method === "DELETE" && event.pathParameters?.tenantId && path === `/dev/tenant/${event.pathParameters.tenantId}/clear`) {
      return clearTenant({
        ...context,
        tenantId: event.pathParameters.tenantId,
      });
    }

    return json(404, { message: "Route not found." });
  } catch (error) {
    console.error("Tender pricing API failed", error);

    return json(500, {
      message: error instanceof Error ? error.message : "Unhandled API error.",
    });
  }
};

export const setHandlerClientsForTesting = (client: DynamoDBDocumentClient) => {
  documentClient = client;
};

export const resetHandlerClientsForTesting = () => {
  documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
};

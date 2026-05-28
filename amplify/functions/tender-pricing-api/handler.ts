import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  AdminAddUserToGroupCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  CognitoIdentityProviderClient,
  ListGroupsCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
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
  BagBodySourcingSelection,
  Accessory,
  AccessManagementAuditEntry,
  AccessManagementGroup,
  AccessManagementMe,
  AccessManagementUpdateGroupsRequest,
  AccessManagementUser,
  AppCognitoGroup,
  CostBuildUp,
  Customer,
  DeliveryPlace,
  ImportPreset,
  Material,
  MaterialSourceSelection,
  PricingApproval,
  PricingScenario,
  Product,
  ProductComponentSpecificationValue,
  ProductConfiguration,
  RollCalculation,
  ScenarioAlternative,
  SelectedMaterialSource,
  StockReservationStatus,
  StockItem,
  Supplier,
  SupplierOffer,
  TenderListResponse,
  TenderRequestType,
  TenderRequest,
  UserActivityAuditActionType,
  UserActivityAuditLog,
  UserActivityAuditStage,
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

type AccessAuditPayload = {
  actorUserId: string;
  actorUsername: string;
  actorEmail?: string;
  targetUsername: string;
  groupName: AppCognitoGroup;
  actionType: AccessManagementAuditEntry["actionType"];
  timestamp: string;
};

type RequestContext = {
  tenantId: string;
  tableName: string;
  actorId: string;
  actorUsername: string;
  actorName: string;
  actorEmail?: string;
  actorGroups: AppCognitoGroup[];
  resolvedActorGroups?: AppCognitoGroup[];
};

type TenderAuditFieldValue = UserActivityAuditLog["changes"][number]["oldValue"];
type TenderAuditStage = UserActivityAuditStage;
type AuditChangeDraft = {
  productId?: string;
  stage: TenderAuditStage;
  fieldName: string;
  fieldLabel: string;
  oldValue: TenderAuditFieldValue;
  newValue: TenderAuditFieldValue;
  actionType: UserActivityAuditActionType;
  sourcePage: string;
  sourceComponent: string;
};

let documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
let cognitoClient = new CognitoIdentityProviderClient({});

const getTableName = () => process.env.TENDER_PRICING_TABLE ?? "";
const getUserPoolId = () => process.env.COGNITO_USER_POOL_ID ?? "";
const isDevEnabled = () => process.env.ENABLE_DEV_ENDPOINTS === "true";
const isoNow = () => new Date().toISOString();
const allGroups: AppCognitoGroup[] = [
  "sales_engineer",
  "sales_manager",
  "pricing_engineer",
  "admin",
  "super_user",
];
const accessManagerGroups: AppCognitoGroup[] = ["admin", "super_user"];
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
  selectedProductIds: Array.isArray(payload.selectedProductIds)
    ? payload.selectedProductIds.map((productId) => String(productId).trim()).filter(Boolean)
    : [],
  productSnapshots: Array.isArray(payload.productSnapshots)
    ? payload.productSnapshots.map((product) => normalizeProductPayload(product, tenantId))
    : [],
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
  exchangeRate: toNullableNumber(payload.exchangeRate),
  currencySafetyFactorPercent: toNullableNumber(payload.currencySafetyFactorPercent),
  overtimePerBag: toNullableNumber(payload.overtimePerBag),
  installationPerBag: toNullableNumber(payload.installationPerBag),
  transportationCostPerBag: toNullableNumber(payload.transportationCostPerBag),
  salesPercentage: toNullableNumber(payload.salesPercentage),
  salesFixed: toNullableNumber(payload.salesFixed),
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
  selectedProductIds: Array.isArray(payload.selectedProductIds)
    ? payload.selectedProductIds.map((productId) => String(productId).trim()).filter(Boolean)
    : [],
  productSnapshots: Array.isArray(payload.productSnapshots)
    ? payload.productSnapshots.map((product) => normalizeProductPayload(product, tenantId))
    : [],
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
        componentId: source.componentId?.trim() ?? "",
        componentName: source.componentName?.trim() ?? "",
        productId: source.productId?.trim() ?? "",
        productName: source.productName?.trim() ?? "",
        supplierId: source.supplierId?.trim() ?? "",
        materialId: source.materialId?.trim() ?? "",
        rollWidthM: toNullableNumber(source.rollWidthM),
        rollLengthM: toNullableNumber(source.rollLengthM),
        rollCount: toNullableNumber(source.rollCount),
        customsEstimate: toNullableNumber(source.customsEstimate),
        customsPercent: toNullableNumber(source.customsPercent),
        freightCostPerM2Egp: toNullableNumber(source.freightCostPerM2Egp),
        clearanceCostPerM2Egp: toNullableNumber(source.clearanceCostPerM2Egp),
        bagsAcrossRollWidth: toNullableNumber(source.bagsAcrossRollWidth),
        bagsAlongRollLength: toNullableNumber(source.bagsAlongRollLength),
        bagsPerRoll: toNullableNumber(source.bagsPerRoll),
        allocatedBags: toNullableNumber(source.allocatedBags),
        actualAreaPerBagM2: toNullableNumber(source.actualAreaPerBagM2),
        qtyUsedM2: toNullableNumber(source.qtyUsedM2),
        unitCostUsdPerM2: toNullableNumber(source.unitCostUsdPerM2),
        totalCostUsd: toNullableNumber(source.totalCostUsd),
        leadTimeDays: toNullableNumber(source.leadTimeDays),
      }))
    : [],
  componentSelections: Array.isArray(payload.componentSelections)
    ? payload.componentSelections.map((selection) => ({
        componentId: selection.componentId?.trim() ?? "",
        componentName: selection.componentName?.trim() ?? "",
        productId: selection.productId?.trim() ?? "",
        productName: selection.productName?.trim() ?? "",
        materialId: selection.materialId?.trim() ?? "",
        requestedQuantity: toNullableNumber(selection.requestedQuantity),
        bagDiameterMm: toNullableNumber(selection.bagDiameterMm),
        bagLengthMm: toNullableNumber(selection.bagLengthMm),
        seamAllowanceMm: toNullableNumber(selection.seamAllowanceMm),
        topBottomAllowanceMm: toNullableNumber(selection.topBottomAllowanceMm),
        bagWidthMm: toNullableNumber(selection.bagWidthMm),
        bagLengthWithAllowanceMm: toNullableNumber(selection.bagLengthWithAllowanceMm),
        actualAreaPerBagM2: toNullableNumber(selection.actualAreaPerBagM2),
        materialCostPerBagEgp: toNullableNumber(selection.materialCostPerBagEgp),
        totalMaterialCostEgp: toNullableNumber(selection.totalMaterialCostEgp),
        selectedSources: Array.isArray(selection.selectedSources)
          ? selection.selectedSources.map((source) => ({
              sourceId: source.sourceId?.trim() ?? "",
              sourceName: source.sourceName?.trim() ?? "",
              sourceType: source.sourceType === "import" ? "import" : "stock",
              componentId: source.componentId?.trim() ?? "",
              componentName: source.componentName?.trim() ?? "",
              productId: source.productId?.trim() ?? "",
              productName: source.productName?.trim() ?? "",
              supplierId: source.supplierId?.trim() ?? "",
              materialId: source.materialId?.trim() ?? "",
              rollWidthM: toNullableNumber(source.rollWidthM),
              rollLengthM: toNullableNumber(source.rollLengthM),
              rollCount: toNullableNumber(source.rollCount),
              customsEstimate: toNullableNumber(source.customsEstimate),
              customsPercent: toNullableNumber(source.customsPercent),
              freightCostPerM2Egp: toNullableNumber(source.freightCostPerM2Egp),
              clearanceCostPerM2Egp: toNullableNumber(source.clearanceCostPerM2Egp),
              bagsAcrossRollWidth: toNullableNumber(source.bagsAcrossRollWidth),
              bagsAlongRollLength: toNullableNumber(source.bagsAlongRollLength),
              bagsPerRoll: toNullableNumber(source.bagsPerRoll),
              allocatedBags: toNullableNumber(source.allocatedBags),
              actualAreaPerBagM2: toNullableNumber(source.actualAreaPerBagM2),
              qtyUsedM2: toNullableNumber(source.qtyUsedM2),
              unitCostUsdPerM2: toNullableNumber(source.unitCostUsdPerM2),
              totalCostUsd: toNullableNumber(source.totalCostUsd),
              leadTimeDays: toNullableNumber(source.leadTimeDays),
            }))
          : [],
      }))
    : [],
  actualAreaPerBagM2: toNullableNumber(payload.actualAreaPerBagM2),
  totalRequiredBags: toNullableNumber(payload.totalRequiredBags),
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
  exchangeRate: toNullableNumber(payload.exchangeRate),
  currencySafetyFactorPercent: toNullableNumber(payload.currencySafetyFactorPercent),
  effectiveExchangeRate: toNullableNumber(payload.effectiveExchangeRate),
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

const normalizeMaterialCategory = (value: unknown): Material["category"] => {
  switch (String(value ?? "").trim()) {
    case "FabricMaterial":
    case "Fabric Material":
      return "Fabric Material";
    case "threadMaterial":
    case "Threading Material":
      return "Threading Material";
    case "accessoriesMaterial":
    case "Ring Material":
      return "Ring Material";
    default:
      return "Fabric Material";
  }
};

const normalizeMaterialPayload = (payload: Partial<Material>, tenantId: string): Material => ({
  entityType: "MATERIAL",
  tenantId,
  materialId: payload.materialId ?? crypto.randomUUID(),
  materialName: payload.materialName?.trim() ?? "",
  category: normalizeMaterialCategory(payload.category),
  description: payload.description?.trim() ?? "",
  baseMaterial: payload.baseMaterial?.trim() ?? "",
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
  rollWidthM: toNullableNumber(payload.rollWidthM),
  rollLengthM: toNullableNumber(payload.rollLengthM),
  unitCostUsdPerM2: toNullableNumber(payload.unitCostUsdPerM2),
  landedCostEgp: toNullableNumber(payload.landedCostEgp),
  reservationStatus:
    payload.reservationStatus === "unavailable"
      ? "unavailable"
      : payload.reservationStatus === "reserved"
        ? "reserved"
        : null,
  reservedForTenderId: payload.reservedForTenderId?.trim() || null,
  reservedForTenderNumber: payload.reservedForTenderNumber?.trim() || null,
  reservedAt: payload.reservedAt?.trim() || null,
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
  rollWidthM: toNullableNumber(payload.rollWidthM),
  rollLengthM: toNullableNumber(payload.rollLengthM),
  leadTimeDays: toNullableNumber(payload.leadTimeDays),
  unitCostUsdPerM2: toNullableNumber(payload.unitCostUsdPerM2),
  freightCostPerM2Egp: toNullableNumber(payload.freightCostPerM2Egp),
  clearanceCostPerM2Egp: toNullableNumber(payload.clearanceCostPerM2Egp),
  customsPercent: toNullableNumber(payload.customsPercent),
  customsEstimate: toNullableNumber(payload.customsEstimate),
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
  productType: payload.productType === "Other" ? "Other" : "Filter Bag",
  requestedQuantity: toNullableNumber(payload.requestedQuantity),
  factoryOverheadPerBag: toNullableNumber(payload.factoryOverheadPerBag),
  manufacturingOverheadPerBag: toNullableNumber(payload.manufacturingOverheadPerBag),
  managementOverheadPerBag: toNullableNumber(payload.managementOverheadPerBag),
  components: Array.isArray(payload.components)
    ? payload.components.map((component) => ({
        componentId: component.componentId ?? crypto.randomUUID(),
        componentName: component.componentName?.trim() ?? "",
        componentType: component.componentType?.trim() ?? "",
        material: component.material?.trim() ?? "",
        accessorySnapshot:
          component.accessorySnapshot && typeof component.accessorySnapshot === "object"
            ? {
                accessoryId: component.accessorySnapshot.accessoryId?.trim() ?? "",
                accessoryName: component.accessorySnapshot.accessoryName?.trim() ?? "",
                pricingItems: Array.isArray(component.accessorySnapshot.pricingItems)
                  ? component.accessorySnapshot.pricingItems.map((item) => ({
                      key: item.key?.trim() ?? "",
                      price: toNullableNumber(item.price),
                    }))
                  : [],
                totalPricePerBagEgp: toNullableNumber(component.accessorySnapshot.totalPricePerBagEgp),
              }
            : null,
        specifications:
          component.specifications && typeof component.specifications === "object"
            ? Object.fromEntries(
                Object.entries(component.specifications).map(([key, value]) => [
                  key,
                  typeof value === "number" ? value : typeof value === "boolean" ? value : value ?? null,
                ]),
              )
            : {},
      }))
    : [],
  active: payload.active ?? true,
  createdAt: payload.createdAt ?? "",
  updatedAt: payload.updatedAt ?? "",
});

const normalizeAccessoryPayload = (payload: Partial<Accessory>, tenantId: string): Accessory => ({
  entityType: "ACCESSORY",
  tenantId,
  accessoryId: payload.accessoryId ?? crypto.randomUUID(),
  accessoryName: payload.accessoryName?.trim() ?? "",
  pricingItems: Array.isArray(payload.pricingItems)
    ? payload.pricingItems.map((item) => ({
        key: item.key?.trim() ?? "",
        price: toNullableNumber(item.price),
      }))
    : [],
  totalPricePerBagEgp: toNullableNumber(payload.totalPricePerBagEgp),
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
    selectedProductIds: Array.isArray(item.selectedProductIds)
      ? item.selectedProductIds.map((productId) => String(productId))
      : [],
    productSnapshots: Array.isArray(item.productSnapshots)
      ? item.productSnapshots
          .map((product) => sanitizeProduct(product as StoredEntity))
          .filter((product): product is Product => Boolean(product))
      : [],
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
    exchangeRate: toNullableNumber(item.exchangeRate),
    currencySafetyFactorPercent: toNullableNumber(item.currencySafetyFactorPercent),
    overtimePerBag: toNullableNumber(item.overtimePerBag),
    installationPerBag: toNullableNumber(item.installationPerBag),
    transportationCostPerBag: toNullableNumber(item.transportationCostPerBag),
    salesPercentage: toNullableNumber(item.salesPercentage),
    salesFixed: toNullableNumber(item.salesFixed),
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

const sanitizeTenderAuditLog = (item: StoredEntity | null): UserActivityAuditLog | null => {
  if (!item) {
    return null;
  }

  return {
    entityType: item.entityType,
    tenantId: item.tenantId,
    tenderId: String(item.tenderId ?? ""),
    auditId: String(item.auditId ?? ""),
    productId: item.productId ? String(item.productId) : undefined,
    stage: String(item.stage ?? "SYSTEM") as UserActivityAuditLog["stage"],
    actionType: String(item.actionType ?? "UPDATE") as UserActivityAuditLog["actionType"],
    changeCount: toNullableNumber(item.changeCount) ?? 0,
    changes: Array.isArray(item.changes)
      ? item.changes.map((change) => {
          const record = (change ?? {}) as Record<string, unknown>;
          return {
            fieldName: String(record.fieldName ?? ""),
            fieldLabel: String(record.fieldLabel ?? ""),
            oldValue: toAuditValue(record.oldValue),
            newValue: toAuditValue(record.newValue),
            actionType: String(record.actionType ?? "UPDATE") as UserActivityAuditLog["changes"][number]["actionType"],
          };
        })
      : [],
    changedByUserId: String(item.changedByUserId ?? "anonymous"),
    changedByUserName: String(item.changedByUserName ?? item.changedByUserId ?? "anonymous"),
    changedByUserEmail: item.changedByUserEmail ? String(item.changedByUserEmail) : "",
    changedAt: String(item.changedAt ?? item.createdAt ?? ""),
    sourcePage: String(item.sourcePage ?? ""),
    sourceComponent: String(item.sourceComponent ?? ""),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const sanitizeScenarioAlternative = (item: StoredEntity | null): ScenarioAlternative | null => {
  if (!item || item.entityType !== "ScenarioAlternative") {
    return null;
  }

  return {
    entityType: "ScenarioAlternative",
    tenantId: String(item.tenantId ?? ""),
    tenderId: String(item.tenderId ?? ""),
    alternativeId: String(item.alternativeId ?? "base"),
    currency: (String(item.currency ?? "EGP") as "EGP"),
    quantity: toNullableNumber(item.quantity),
    baseCostPerBag: toNullableNumber(item.baseCostPerBag),
    scenarios: Array.isArray(item.scenarios)
      ? item.scenarios.map((scenario) => {
          const record = (scenario ?? {}) as Record<string, unknown>;
        return {
          scenarioId: String(record.scenarioId ?? crypto.randomUUID()),
          label: String(record.label ?? ""),
          profitPercent: toNullableNumber(record.profitPercent),
          customerCommissionPercent: toNullableNumber(record.customerCommissionPercent),
          salesPersonCommissionMode:
            record.salesPersonCommissionMode === "fixed" ||
            toNullableNumber(record.salesPersonCommissionFixedAmount) !== null
              ? "fixed"
              : "percent",
          salesPersonCommissionPercent: toNullableNumber(record.salesPersonCommissionPercent),
          salesPersonCommissionFixedAmount: toNullableNumber(record.salesPersonCommissionFixedAmount),
          totalCost: toNullableNumber(record.totalCost),
          pricePerBag: toNullableNumber(record.pricePerBag),
            totalPrice: toNullableNumber(record.totalPrice),
            notes: String(record.notes ?? ""),
          };
        })
      : [],
    notes: String(item.notes ?? ""),
    createdAt: String(item.createdAt ?? ""),
    updatedAt: String(item.updatedAt ?? ""),
  };
};

const sanitizePricingApproval = (item: StoredEntity | null): PricingApproval | null => {
  if (!item || item.entityType !== "PricingApproval") {
    return null;
  }

  return {
    entityType: "PricingApproval",
    tenantId: String(item.tenantId ?? ""),
    tenderId: String(item.tenderId ?? ""),
    approvalId: String(item.approvalId ?? "base"),
    currency: "EGP",
    approvalsOpen: Number(item.approvalsOpen ?? 0),
    status: (String(item.status ?? "pending") as PricingApproval["status"]),
    decisions: Array.isArray(item.decisions)
      ? item.decisions.map((decision) => {
          const record = (decision ?? {}) as Record<string, unknown>;
          return {
            scenarioId: String(record.scenarioId ?? ""),
            label: String(record.label ?? ""),
            status: (String(record.status ?? "pending") as PricingApproval["decisions"][number]["status"]),
            pricePerBag: toNullableNumber(record.pricePerBag),
            totalPrice: toNullableNumber(record.totalPrice),
            notes: String(record.notes ?? ""),
          };
        })
      : [],
    notes: String(item.notes ?? ""),
    createdAt: String(item.createdAt ?? ""),
    updatedAt: String(item.updatedAt ?? ""),
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
    selectedProductIds: Array.isArray(item.selectedProductIds)
      ? item.selectedProductIds.map((productId) => String(productId))
      : [],
    productSnapshots: Array.isArray(item.productSnapshots)
      ? item.productSnapshots
          .map((product) => sanitizeProduct(product as StoredEntity))
          .filter((product): product is Product => Boolean(product))
      : [],
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
            componentId: String(record.componentId ?? ""),
            componentName: String(record.componentName ?? ""),
            productId: String(record.productId ?? ""),
            productName: String(record.productName ?? ""),
            supplierId: String(record.supplierId ?? ""),
            materialId: String(record.materialId ?? ""),
            rollWidthM: toNullableNumber(record.rollWidthM),
            rollLengthM: toNullableNumber(record.rollLengthM),
            rollCount: toNullableNumber(record.rollCount),
            customsEstimate: toNullableNumber(record.customsEstimate),
            customsPercent: toNullableNumber(record.customsPercent),
            freightCostPerM2Egp: toNullableNumber(record.freightCostPerM2Egp),
            clearanceCostPerM2Egp: toNullableNumber(record.clearanceCostPerM2Egp),
            bagsAcrossRollWidth: toNullableNumber(record.bagsAcrossRollWidth),
            bagsAlongRollLength: toNullableNumber(record.bagsAlongRollLength),
            bagsPerRoll: toNullableNumber(record.bagsPerRoll),
            allocatedBags: toNullableNumber(record.allocatedBags),
            actualAreaPerBagM2: toNullableNumber(record.actualAreaPerBagM2),
            qtyUsedM2: toNullableNumber(record.qtyUsedM2),
            unitCostUsdPerM2: toNullableNumber(record.unitCostUsdPerM2),
            totalCostUsd: toNullableNumber(record.totalCostUsd),
            leadTimeDays: toNullableNumber(record.leadTimeDays),
          };
        })
      : [],
    componentSelections: Array.isArray(item.componentSelections)
      ? item.componentSelections.map((selection) => {
          const record = selection as Record<string, unknown>;
          return {
            componentId: String(record.componentId ?? ""),
            componentName: String(record.componentName ?? ""),
            productId: String(record.productId ?? ""),
            productName: String(record.productName ?? ""),
            materialId: String(record.materialId ?? ""),
            requestedQuantity: toNullableNumber(record.requestedQuantity),
            bagDiameterMm: toNullableNumber(record.bagDiameterMm),
            bagLengthMm: toNullableNumber(record.bagLengthMm),
            seamAllowanceMm: toNullableNumber(record.seamAllowanceMm),
            topBottomAllowanceMm: toNullableNumber(record.topBottomAllowanceMm),
            bagWidthMm: toNullableNumber(record.bagWidthMm),
            bagLengthWithAllowanceMm: toNullableNumber(record.bagLengthWithAllowanceMm),
            actualAreaPerBagM2: toNullableNumber(record.actualAreaPerBagM2),
            materialCostPerBagEgp: toNullableNumber(record.materialCostPerBagEgp),
            totalMaterialCostEgp: toNullableNumber(record.totalMaterialCostEgp),
            selectedSources: Array.isArray(record.selectedSources)
              ? record.selectedSources.map((source) => {
                  const sourceRecord = source as Record<string, unknown>;
                  return {
                    sourceId: String(sourceRecord.sourceId ?? ""),
                    sourceName: String(sourceRecord.sourceName ?? ""),
                    sourceType: sourceRecord.sourceType === "import" ? "import" : "stock",
                    componentId: String(sourceRecord.componentId ?? ""),
                    componentName: String(sourceRecord.componentName ?? ""),
                    productId: String(sourceRecord.productId ?? ""),
                    productName: String(sourceRecord.productName ?? ""),
                    supplierId: String(sourceRecord.supplierId ?? ""),
                    materialId: String(sourceRecord.materialId ?? ""),
                    rollWidthM: toNullableNumber(sourceRecord.rollWidthM),
                    rollLengthM: toNullableNumber(sourceRecord.rollLengthM),
                    rollCount: toNullableNumber(sourceRecord.rollCount),
                    customsEstimate: toNullableNumber(sourceRecord.customsEstimate),
                    customsPercent: toNullableNumber(sourceRecord.customsPercent),
                    freightCostPerM2Egp: toNullableNumber(sourceRecord.freightCostPerM2Egp),
                    clearanceCostPerM2Egp: toNullableNumber(sourceRecord.clearanceCostPerM2Egp),
                    bagsAcrossRollWidth: toNullableNumber(sourceRecord.bagsAcrossRollWidth),
                    bagsAlongRollLength: toNullableNumber(sourceRecord.bagsAlongRollLength),
                    bagsPerRoll: toNullableNumber(sourceRecord.bagsPerRoll),
                    allocatedBags: toNullableNumber(sourceRecord.allocatedBags),
                    actualAreaPerBagM2: toNullableNumber(sourceRecord.actualAreaPerBagM2),
                    qtyUsedM2: toNullableNumber(sourceRecord.qtyUsedM2),
                    unitCostUsdPerM2: toNullableNumber(sourceRecord.unitCostUsdPerM2),
                    totalCostUsd: toNullableNumber(sourceRecord.totalCostUsd),
                    leadTimeDays: toNullableNumber(sourceRecord.leadTimeDays),
                  };
                })
              : [],
          } satisfies BagBodySourcingSelection;
        })
      : [],
    actualAreaPerBagM2: toNullableNumber(item.actualAreaPerBagM2),
    totalRequiredBags: toNullableNumber(item.totalRequiredBags),
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
    exchangeRate: toNullableNumber(item.exchangeRate),
    currencySafetyFactorPercent: toNullableNumber(item.currencySafetyFactorPercent),
    effectiveExchangeRate: toNullableNumber(item.effectiveExchangeRate),
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
    category: normalizeMaterialCategory(item.category),
    description: String(item.description ?? ""),
    baseMaterial: String(item.baseMaterial ?? ""),
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
    rollWidthM: toNullableNumber(item.rollWidthM),
    rollLengthM: toNullableNumber(item.rollLengthM),
    unitCostUsdPerM2: toNullableNumber(item.unitCostUsdPerM2),
    landedCostEgp: toNullableNumber(item.landedCostEgp),
    reservationStatus:
      item.reservationStatus === "unavailable"
        ? "unavailable"
        : item.reservationStatus === "reserved"
          ? "reserved"
          : null,
    reservedForTenderId: String(item.reservedForTenderId ?? "").trim() || null,
    reservedForTenderNumber: String(item.reservedForTenderNumber ?? "").trim() || null,
    reservedAt: String(item.reservedAt ?? "").trim() || null,
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
    rollWidthM: toNullableNumber(item.rollWidthM),
    rollLengthM: toNullableNumber(item.rollLengthM),
    leadTimeDays: toNullableNumber(item.leadTimeDays),
    unitCostUsdPerM2: toNullableNumber(item.unitCostUsdPerM2),
    freightCostPerM2Egp: toNullableNumber(item.freightCostPerM2Egp),
    clearanceCostPerM2Egp: toNullableNumber(item.clearanceCostPerM2Egp),
    customsPercent: toNullableNumber(item.customsPercent),
    customsEstimate: toNullableNumber(item.customsEstimate),
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
    productType: item.productType === "Other" ? "Other" : "Filter Bag",
    requestedQuantity: toNullableNumber(item.requestedQuantity),
    factoryOverheadPerBag: toNullableNumber(item.factoryOverheadPerBag),
    manufacturingOverheadPerBag: toNullableNumber(item.manufacturingOverheadPerBag),
    managementOverheadPerBag: toNullableNumber(item.managementOverheadPerBag),
    components: Array.isArray(item.components)
      ? item.components.map((component) => {
          const record = component as Record<string, unknown>;
          return {
            componentId: String(record.componentId ?? ""),
            componentName: String(record.componentName ?? ""),
            componentType: String(record.componentType ?? ""),
            material: String(record.material ?? ""),
            accessorySnapshot:
              record.accessorySnapshot && typeof record.accessorySnapshot === "object"
                ? {
                    accessoryId: String((record.accessorySnapshot as Record<string, unknown>).accessoryId ?? ""),
                    accessoryName: String((record.accessorySnapshot as Record<string, unknown>).accessoryName ?? ""),
                    pricingItems: Array.isArray((record.accessorySnapshot as Record<string, unknown>).pricingItems)
                      ? ((record.accessorySnapshot as Record<string, unknown>).pricingItems as Array<Record<string, unknown>>).map((entry) => ({
                          key: String(entry.key ?? ""),
                          price: toNullableNumber(entry.price),
                        }))
                      : [],
                    totalPricePerBagEgp: toNullableNumber((record.accessorySnapshot as Record<string, unknown>).totalPricePerBagEgp),
                  }
                : null,
            specifications:
              record.specifications && typeof record.specifications === "object"
                ? Object.fromEntries(
                    Object.entries(record.specifications as Record<string, unknown>).map(([key, value]) => [
                      key,
                      (typeof value === "string" ||
                      typeof value === "number" ||
                      typeof value === "boolean" ||
                      value === null
                        ? value
                        : String(value)) as ProductComponentSpecificationValue,
                    ]),
                  )
                : {},
          };
        })
      : [],
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
    pricingItems: Array.isArray(item.pricingItems)
      ? item.pricingItems.map((entry) => ({
          key: String((entry as Record<string, unknown>).key ?? ""),
          price: toNullableNumber((entry as Record<string, unknown>).price),
        }))
      : [],
    totalPricePerBagEgp: toNullableNumber(item.totalPricePerBagEgp),
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

const getHeader = (
  headers: Parameters<APIGatewayProxyHandlerV2>[0]["headers"] | undefined,
  key: string,
) => {
  const target = key.toLowerCase();
  const match = Object.entries(headers ?? {}).find(([headerKey]) => headerKey.toLowerCase() === target);
  return match?.[1];
};

const isAppGroup = (value: string): value is AppCognitoGroup =>
  allGroups.includes(value as AppCognitoGroup);

const normalizeGroups = (rawGroups: unknown): AppCognitoGroup[] => {
  if (Array.isArray(rawGroups)) {
    return rawGroups.map((group) => String(group)).filter(isAppGroup);
  }

  if (typeof rawGroups === "string" && rawGroups.trim()) {
    return rawGroups
      .split(",")
      .map((group) => group.trim())
      .filter(isAppGroup);
  }

  return [];
};

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
}

const toAuditValue = (value: unknown): string | number | boolean | null => {
  if (value === undefined) {
    return null;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return JSON.stringify(value);
};

const normalizeAuditComparable = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeAuditComparable);
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((accumulator, [key, nestedValue]) => {
        accumulator[key] = normalizeAuditComparable(nestedValue);
        return accumulator;
      }, {});
  }

  return value ?? null;
};

const auditValuesEqual = (left: unknown, right: unknown) =>
  JSON.stringify(normalizeAuditComparable(left)) === JSON.stringify(normalizeAuditComparable(right));

const stageSourceMap: Record<TenderAuditStage, { sourcePage: string; sourceComponent: string }> = {
  TENDER: { sourcePage: "tender-intake", sourceComponent: "TenderIntakePage" },
  PRODUCT_CONFIGURATION: { sourcePage: "product-configuration", sourceComponent: "ProductConfigurationPage" },
  ROLL_CALCULATION: { sourcePage: "material-roll-calculation", sourceComponent: "MaterialRollCalculationPage" },
  MATERIAL_SOURCE_SELECTION: { sourcePage: "material-sourcing", sourceComponent: "MaterialSourcingPage" },
  COST_BUILDUP: { sourcePage: "cost-build-up", sourceComponent: "CostBuildUpPage" },
  ALTERNATIVES: { sourcePage: "alternatives", sourceComponent: "AlternativesPage" },
  PRICING_APPROVAL: { sourcePage: "pricing-approval", sourceComponent: "PricingApprovalPage" },
  SYSTEM: { sourcePage: "system", sourceComponent: "TenderWorkflowApi" },
};

const createAuditChangeDraft = (
  stage: TenderAuditStage,
  fieldName: string,
  fieldLabel: string,
  oldValue: unknown,
  newValue: unknown,
  actionType?: UserActivityAuditActionType,
  productId?: string,
): AuditChangeDraft | null => {
  if (auditValuesEqual(oldValue, newValue)) {
    return null;
  }

  const resolvedActionType =
    actionType ??
    (oldValue === null || oldValue === undefined
      ? "CREATE"
      : newValue === null || newValue === undefined
        ? "DELETE"
        : "UPDATE");

  return {
    productId,
    stage,
    fieldName,
    fieldLabel,
    oldValue: toAuditValue(oldValue),
    newValue: toAuditValue(newValue),
    actionType: resolvedActionType,
    sourcePage: stageSourceMap[stage].sourcePage,
    sourceComponent: stageSourceMap[stage].sourceComponent,
  };
};

const summarizeSelectedSources = (sources: unknown): string | null => {
  if (!Array.isArray(sources) || sources.length === 0) {
    return null;
  }

  const normalized = sources.map((entry) => {
    const source = (entry ?? {}) as Record<string, unknown>;
    return {
      sourceId: String(source.sourceId ?? ""),
      sourceName: String(source.sourceName ?? ""),
      sourceType: String(source.sourceType ?? ""),
      supplierId: String(source.supplierId ?? ""),
      materialId: String(source.materialId ?? ""),
      componentId: String(source.componentId ?? ""),
      productId: String(source.productId ?? ""),
      qtyUsedM2: toNullableNumber(source.qtyUsedM2),
    };
  });

  return JSON.stringify(normalizeAuditComparable(normalized));
};

const summarizeComponentSelections = (selections: unknown): string | null => {
  if (!Array.isArray(selections) || selections.length === 0) {
    return null;
  }

  const normalized = selections.map((entry) => {
    const selection = (entry ?? {}) as Record<string, unknown>;
    return {
      componentId: String(selection.componentId ?? ""),
      componentName: String(selection.componentName ?? ""),
      productId: String(selection.productId ?? ""),
      productName: String(selection.productName ?? ""),
      materialId: String(selection.materialId ?? ""),
      requestedQuantity: toNullableNumber(selection.requestedQuantity),
      selectedSources: JSON.parse(summarizeSelectedSources(selection.selectedSources) ?? "null"),
    };
  });

  return JSON.stringify(normalizeAuditComparable(normalized));
};

const buildTenderAuditRecords = (
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
) => {
  const records = [
    createAuditChangeDraft("TENDER", "customerName", "Customer", previous?.customerName, next.customerName),
    createAuditChangeDraft("TENDER", "tenderNumber", "Tender Number", previous?.tenderNumber, next.tenderNumber),
    createAuditChangeDraft("TENDER", "internalInquiryNumber", "Internal Inquiry Number", previous?.internalInquiryNumber, next.internalInquiryNumber),
    createAuditChangeDraft("TENDER", "tenderDueDate", "Tender Due Date", previous?.tenderDueDate, next.tenderDueDate),
    createAuditChangeDraft("TENDER", "requestType", "Request Type", previous?.requestType, next.requestType),
    createAuditChangeDraft("TENDER", "requestedMaterial", "Requested Material", previous?.requestedMaterial, next.requestedMaterial),
    createAuditChangeDraft("TENDER", "bagDiameterMm", "Bag Diameter (mm)", previous?.bagDiameterMm, next.bagDiameterMm),
    createAuditChangeDraft("TENDER", "bagLengthMm", "Bag Length (mm)", previous?.bagLengthMm, next.bagLengthMm),
    createAuditChangeDraft("TENDER", "topDesign", "Top Design", previous?.topDesign, next.topDesign),
    createAuditChangeDraft("TENDER", "bottomDesign", "Bottom Design", previous?.bottomDesign, next.bottomDesign),
    createAuditChangeDraft("TENDER", "accessoriesMaterial", "Accessories", previous?.accessoriesMaterial, next.accessoriesMaterial),
    createAuditChangeDraft("TENDER", "requestedMaterialNotes", "Requested Material Notes", previous?.requestedMaterialNotes, next.requestedMaterialNotes),
    createAuditChangeDraft("TENDER", "knownRequiredPrice", "Known Required Price", previous?.knownRequiredPrice, next.knownRequiredPrice),
    createAuditChangeDraft("TENDER", "knownCompetitorPrice", "Known Competitor Price", previous?.knownCompetitorPrice, next.knownCompetitorPrice),
    createAuditChangeDraft("TENDER", "customerCommissionPercent", "Customer Commission %", previous?.customerCommissionPercent, next.customerCommissionPercent),
    createAuditChangeDraft("TENDER", "exchangeRate", "Exchange Rate", previous?.exchangeRate, next.exchangeRate),
    createAuditChangeDraft("TENDER", "currencySafetyFactorPercent", "Currency Safety Factor %", previous?.currencySafetyFactorPercent, next.currencySafetyFactorPercent),
    createAuditChangeDraft("TENDER", "overtimePerBag", "Overtime / Bag", previous?.overtimePerBag, next.overtimePerBag),
    createAuditChangeDraft("TENDER", "installationPerBag", "Installation / Bag", previous?.installationPerBag, next.installationPerBag),
    createAuditChangeDraft("TENDER", "transportationCostPerBag", "Transportation Cost / Bag", previous?.transportationCostPerBag, next.transportationCostPerBag),
    createAuditChangeDraft("TENDER", "salesPercentage", "Sales Percentage %", previous?.salesPercentage, next.salesPercentage),
    createAuditChangeDraft("TENDER", "salesFixed", "Sales Fixed", previous?.salesFixed, next.salesFixed),
    createAuditChangeDraft("TENDER", "priceNegotiationExpected", "Price Negotiation Expected", previous?.priceNegotiationExpected, next.priceNegotiationExpected),
    createAuditChangeDraft("TENDER", "requestedDeliveryTime", "Requested Delivery Time", previous?.requestedDeliveryTime, next.requestedDeliveryTime),
    createAuditChangeDraft("TENDER", "deliveryPlace", "Delivery Place", previous?.deliveryPlace, next.deliveryPlace),
    createAuditChangeDraft("TENDER", "assignedTo", "Assigned To", previous?.assignedTo, next.assignedTo),
    createAuditChangeDraft("TENDER", "transportationRequired", "Transportation Required", previous?.transportationRequired, next.transportationRequired),
    createAuditChangeDraft("TENDER", "installationRequired", "Installation Required", previous?.installationRequired, next.installationRequired),
    createAuditChangeDraft("TENDER", "notes", "Tender Notes", previous?.notes, next.notes),
  ];

  return records.filter((record): record is AuditChangeDraft => Boolean(record));
};

const buildProductConfigurationAuditRecords = (
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
) => {
  const records = [
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "selectedProductIds", "Selected Products", previous?.selectedProductIds, next.selectedProductIds),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "productType", "Product Type", previous?.productType, next.productType),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "quantity", "Number of Bags", previous?.quantity, next.quantity),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "bagDiameterMm", "Bag Diameter (mm)", previous?.bagDiameterMm, next.bagDiameterMm),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "bagLengthMm", "Bag Length (mm)", previous?.bagLengthMm, next.bagLengthMm),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "seamAllowanceMm", "Seam Allowance (mm)", previous?.seamAllowanceMm, next.seamAllowanceMm),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "topBottomAllowanceMm", "Top/Bottom Allowance (mm)", previous?.topBottomAllowanceMm, next.topBottomAllowanceMm),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "topDesign", "Top Design", previous?.topDesign, next.topDesign),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "bottomDesign", "Bottom Design", previous?.bottomDesign, next.bottomDesign),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "seamType", "Seam Type", previous?.seamType, next.seamType),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "includeWearStrip", "Include Wear Strip", previous?.includeWearStrip, next.includeWearStrip),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "wearStripHeightMm", "Wear Strip Height (mm)", previous?.wearStripHeightMm, next.wearStripHeightMm),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "mainFabricMaterialId", "Main Fabric Material", previous?.mainFabricMaterialId, next.mainFabricMaterialId),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "accessoriesMaterialId", "Accessories Material", previous?.accessoriesMaterialId, next.accessoriesMaterialId),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "threadMaterialId", "Thread Material", previous?.threadMaterialId, next.threadMaterialId),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "packagingType", "Packaging Type", previous?.packagingType, next.packagingType),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "bagsPerCarton", "Bags Per Carton", previous?.bagsPerCarton, next.bagsPerCarton),
    createAuditChangeDraft("PRODUCT_CONFIGURATION", "packagingNotes", "Packaging Notes", previous?.packagingNotes, next.packagingNotes),
  ];

  return records.filter((record): record is AuditChangeDraft => Boolean(record));
};

const buildMaterialSourcingAuditRecords = (
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
) => {
  const records = [
    createAuditChangeDraft("MATERIAL_SOURCE_SELECTION", "materialId", "Material", previous?.materialId, next.materialId),
    createAuditChangeDraft("MATERIAL_SOURCE_SELECTION", "sourcingStrategy", "Sourcing Strategy", previous?.sourcingStrategy, next.sourcingStrategy),
    createAuditChangeDraft("MATERIAL_SOURCE_SELECTION", "selectedSources", "Selected Suppliers / Materials", summarizeSelectedSources(previous?.selectedSources), summarizeSelectedSources(next.selectedSources)),
    createAuditChangeDraft("MATERIAL_SOURCE_SELECTION", "componentSelections", "Selected Component Sources", summarizeComponentSelections(previous?.componentSelections), summarizeComponentSelections(next.componentSelections)),
    createAuditChangeDraft("MATERIAL_SOURCE_SELECTION", "exchangeRate", "Exchange Rate", previous?.exchangeRate, next.exchangeRate),
    createAuditChangeDraft("MATERIAL_SOURCE_SELECTION", "currencySafetyFactorPercent", "Currency Safety Factor %", previous?.currencySafetyFactorPercent, next.currencySafetyFactorPercent),
    createAuditChangeDraft("MATERIAL_SOURCE_SELECTION", "freightCostPerM2Egp", "Freight Cost / m2", previous?.freightCostPerM2Egp, next.freightCostPerM2Egp),
    createAuditChangeDraft("MATERIAL_SOURCE_SELECTION", "customsCostPerM2Egp", "Customs Cost / m2", previous?.customsCostPerM2Egp, next.customsCostPerM2Egp),
    createAuditChangeDraft("MATERIAL_SOURCE_SELECTION", "otherChargesPerM2Egp", "Other Charges / m2", previous?.otherChargesPerM2Egp, next.otherChargesPerM2Egp),
  ];

  return records.filter((record): record is AuditChangeDraft => Boolean(record));
};

const getEditableCostLines = (lines: unknown) => {
  if (!Array.isArray(lines)) {
    return [];
  }

  return lines
    .map((line) => (line ?? {}) as Record<string, unknown>)
    .filter((line) => Boolean(line.editable))
    .map((line) => ({
      code: String(line.code ?? ""),
      category: String(line.category ?? ""),
      description: String(line.description ?? ""),
      costPerBag: toNullableNumber(line.costPerBag),
    }));
};

const buildCostBuildUpAuditRecords = (
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
) => {
  const records: AuditChangeDraft[] = [];
  const seedRecords = [
    createAuditChangeDraft("COST_BUILDUP", "quantity", "Number of Bags", previous?.quantity, next.quantity),
    createAuditChangeDraft("COST_BUILDUP", "currency", "Currency", previous?.currency, next.currency),
    createAuditChangeDraft("COST_BUILDUP", "exchangeRate", "Exchange Rate", previous?.exchangeRate, next.exchangeRate),
    createAuditChangeDraft("COST_BUILDUP", "currencySafetyFactorPercent", "Currency Safety Factor %", previous?.currencySafetyFactorPercent, next.currencySafetyFactorPercent),
  ];

  records.push(...seedRecords.filter((record): record is AuditChangeDraft => Boolean(record)));

  const previousEditableLines = new Map(getEditableCostLines(previous?.costLines).map((line) => [line.code, line]));
  const nextEditableLines = new Map(getEditableCostLines(next.costLines).map((line) => [line.code, line]));
  const lineCodes = Array.from(new Set([...previousEditableLines.keys(), ...nextEditableLines.keys()])).sort();

  lineCodes.forEach((code) => {
    const previousLine = previousEditableLines.get(code) ?? null;
    const nextLine = nextEditableLines.get(code) ?? null;
    const record = createAuditChangeDraft(
      "COST_BUILDUP",
      `costLine.${code}`,
      nextLine?.category || previousLine?.category || nextLine?.description || previousLine?.description || code,
      previousLine?.costPerBag ?? null,
      nextLine?.costPerBag ?? null,
    );

    if (record) {
      records.push(record);
    }
  });

  return records;
};

const getAlternativeScenarios = (scenarios: unknown) => {
  if (!Array.isArray(scenarios)) {
    return [];
  }

  return scenarios.map((scenario) => {
    const entry = (scenario ?? {}) as Record<string, unknown>;
    return {
      scenarioId: String(entry.scenarioId ?? ""),
      label: String(entry.label ?? ""),
      profitPercent: toNullableNumber(entry.profitPercent),
      customerCommissionPercent: toNullableNumber(entry.customerCommissionPercent),
      salesPersonCommissionMode: String(entry.salesPersonCommissionMode ?? "percent"),
      salesPersonCommissionPercent: toNullableNumber(entry.salesPersonCommissionPercent),
      salesPersonCommissionFixedAmount: toNullableNumber(entry.salesPersonCommissionFixedAmount),
      notes: String(entry.notes ?? ""),
    };
  });
};

const buildAlternativesAuditRecords = (
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
) => {
  const records: AuditChangeDraft[] = [];
  const previousScenarios = new Map(getAlternativeScenarios(previous?.scenarios).map((scenario) => [scenario.scenarioId, scenario]));
  const nextScenarios = new Map(getAlternativeScenarios(next.scenarios).map((scenario) => [scenario.scenarioId, scenario]));
  const scenarioIds = Array.from(new Set([...previousScenarios.keys(), ...nextScenarios.keys()])).sort();

  scenarioIds.forEach((scenarioId) => {
    const previousScenario = previousScenarios.get(scenarioId) ?? null;
    const nextScenario = nextScenarios.get(scenarioId) ?? null;
    const prefix = nextScenario?.label || previousScenario?.label || scenarioId;
    const scenarioRecords = [
      createAuditChangeDraft("ALTERNATIVES", `scenario.${scenarioId}.label`, `${prefix} Label`, previousScenario?.label, nextScenario?.label),
      createAuditChangeDraft("ALTERNATIVES", `scenario.${scenarioId}.profitPercent`, `${prefix} Profit %`, previousScenario?.profitPercent, nextScenario?.profitPercent),
      createAuditChangeDraft("ALTERNATIVES", `scenario.${scenarioId}.customerCommissionPercent`, `${prefix} Customer Commission %`, previousScenario?.customerCommissionPercent, nextScenario?.customerCommissionPercent),
      createAuditChangeDraft("ALTERNATIVES", `scenario.${scenarioId}.salesPersonCommissionMode`, `${prefix} Sales Mode`, previousScenario?.salesPersonCommissionMode, nextScenario?.salesPersonCommissionMode),
      createAuditChangeDraft("ALTERNATIVES", `scenario.${scenarioId}.salesPersonCommissionPercent`, `${prefix} Sales Percentage %`, previousScenario?.salesPersonCommissionPercent, nextScenario?.salesPersonCommissionPercent),
      createAuditChangeDraft("ALTERNATIVES", `scenario.${scenarioId}.salesPersonCommissionFixedAmount`, `${prefix} Sales Fixed`, previousScenario?.salesPersonCommissionFixedAmount, nextScenario?.salesPersonCommissionFixedAmount),
      createAuditChangeDraft("ALTERNATIVES", `scenario.${scenarioId}.notes`, `${prefix} Notes`, previousScenario?.notes, nextScenario?.notes),
    ];

    records.push(...scenarioRecords.filter((record): record is AuditChangeDraft => Boolean(record)));
  });

  const notesRecord = createAuditChangeDraft("ALTERNATIVES", "notes", "Alternative Notes", previous?.notes, next.notes);
  if (notesRecord) {
    records.push(notesRecord);
  }

  return records;
};

const getApprovalDecisions = (decisions: unknown) => {
  if (!Array.isArray(decisions)) {
    return [];
  }

  return decisions.map((decision) => {
    const entry = (decision ?? {}) as Record<string, unknown>;
    return {
      scenarioId: String(entry.scenarioId ?? ""),
      label: String(entry.label ?? ""),
      status: String(entry.status ?? "pending"),
      notes: String(entry.notes ?? ""),
    };
  });
};

const buildPricingApprovalAuditRecords = (
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
) => {
  const records: AuditChangeDraft[] = [];
  const previousDecisions = new Map(getApprovalDecisions(previous?.decisions).map((decision) => [decision.scenarioId, decision]));
  const nextDecisions = new Map(getApprovalDecisions(next.decisions).map((decision) => [decision.scenarioId, decision]));
  const decisionIds = Array.from(new Set([...previousDecisions.keys(), ...nextDecisions.keys()])).sort();

  decisionIds.forEach((decisionId) => {
    const previousDecision = previousDecisions.get(decisionId) ?? null;
    const nextDecision = nextDecisions.get(decisionId) ?? null;
    const label = nextDecision?.label || previousDecision?.label || decisionId;
    const statusActionType =
      nextDecision?.status === "approved"
        ? "APPROVE"
        : nextDecision?.status === "denied"
          ? "REJECT"
          : undefined;
    const statusRecord = createAuditChangeDraft(
      "PRICING_APPROVAL",
      `decision.${decisionId}.status`,
      `${label} Decision`,
      previousDecision?.status ?? null,
      nextDecision?.status ?? null,
      statusActionType,
    );
    const notesRecord = createAuditChangeDraft(
      "PRICING_APPROVAL",
      `decision.${decisionId}.notes`,
      `${label} Notes`,
      previousDecision?.notes ?? null,
      nextDecision?.notes ?? null,
    );

    if (statusRecord) {
      records.push(statusRecord);
    }

    if (notesRecord) {
      records.push(notesRecord);
    }
  });

  const notesRecord = createAuditChangeDraft("PRICING_APPROVAL", "notes", "Approval Notes", previous?.notes, next.notes);
  if (notesRecord) {
    records.push(notesRecord);
  }

  return records;
};

const getActorIdentity = (event: Parameters<APIGatewayProxyHandlerV2>[0]) => {
  const requestContext = event.requestContext as Parameters<APIGatewayProxyHandlerV2>[0]["requestContext"] & {
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  };
  const claims = (
    requestContext.authorizer as
      | { jwt?: { claims?: Record<string, unknown> } }
      | undefined
  )?.jwt?.claims;
  const bodyActor = parseBody<{ actorId?: string; actorName?: string; actorEmail?: string }>(event.body);
  const actorGroups = normalizeGroups(claims?.["cognito:groups"]);
  const actorUsername =
    (typeof claims?.["cognito:username"] === "string" ? claims["cognito:username"] : undefined) ??
    (typeof claims?.username === "string" ? claims.username : undefined) ??
    bodyActor.actorId ??
    "anonymous";

  const actorId =
    event.queryStringParameters?.actorId ??
    getHeader(event.headers, "x-user-id") ??
    bodyActor.actorId ??
    (typeof claims?.sub === "string" ? claims.sub : undefined) ??
    actorUsername ??
    "anonymous";
  const actorEmail =
    event.queryStringParameters?.actorEmail ??
    getHeader(event.headers, "x-user-email") ??
    bodyActor.actorEmail ??
    (typeof claims?.email === "string" ? claims.email : undefined) ??
    undefined;
  const actorName =
    event.queryStringParameters?.actorName ??
    getHeader(event.headers, "x-user-name") ??
    bodyActor.actorName ??
    (typeof claims?.name === "string" ? claims.name : undefined) ??
    actorEmail ??
    actorId;

  return {
    actorId,
    actorUsername,
    actorName,
    actorEmail,
    actorGroups,
  };
};

const resolveActorGroups = async (context: RequestContext): Promise<AppCognitoGroup[]> => {
  if (context.resolvedActorGroups) {
    return context.resolvedActorGroups;
  }

  if (!context.actorUsername || context.actorUsername === "anonymous") {
    context.resolvedActorGroups = context.actorGroups;
    return context.resolvedActorGroups;
  }

  try {
    const groups = await listGroupsForUsername(context.actorUsername);
    context.resolvedActorGroups = groups;
    return groups;
  } catch {
    context.resolvedActorGroups = context.actorGroups;
    return context.resolvedActorGroups;
  }
};

const assertAccessManager = async (context: RequestContext) => {
  const actorGroups = await resolveActorGroups(context);

  if (!actorGroups.some((group) => accessManagerGroups.includes(group))) {
    throw new HttpError(403, "You do not have permission to manage access.");
  }
};

const assertNotSelfTarget = (context: RequestContext, targetUsername: string) => {
  if (context.actorUsername.toLowerCase() === targetUsername.toLowerCase()) {
    throw new HttpError(403, "You cannot modify your own group membership.");
  }
};

const assertValidGroups = (groups: string[]): AppCognitoGroup[] => {
  if (!groups.length) {
    return [];
  }

  const normalized = Array.from(new Set(groups.map((group) => group.trim()).filter(Boolean)));
  const invalid = normalized.filter((group) => !isAppGroup(group));

  if (invalid.length > 0) {
    throw new HttpError(400, `Invalid group name: ${invalid.join(", ")}.`);
  }

  return normalized as AppCognitoGroup[];
};

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

const listSupportedGroups = async (): Promise<AccessManagementGroup[]> => {
  const userPoolId = getUserPoolId();
  const response = await cognitoClient.send(
    new ListGroupsCommand({
      UserPoolId: userPoolId,
      Limit: 60,
    }),
  );
  const availableGroups = new Set(
    (response.Groups ?? [])
      .map((group) => group.GroupName ?? "")
      .filter(isAppGroup),
  );

  return allGroups
    .filter((group) => availableGroups.has(group))
    .map((group) => ({
      name: group,
      description:
        group === "sales_engineer"
          ? "Can work on sales engineering flows."
          : group === "sales_manager"
            ? "Can oversee sales management workflows."
            : group === "pricing_engineer"
              ? "Can work on pricing and costing workflows."
              : group === "admin"
                ? "Can manage users and access."
                : "Has elevated access management privileges.",
    }));
};

const listGroupsForUsername = async (username: string): Promise<AppCognitoGroup[]> => {
  const response = await cognitoClient.send(
    new AdminListGroupsForUserCommand({
      UserPoolId: getUserPoolId(),
      Username: username,
    }),
  );

  return (response.Groups ?? [])
    .map((group) => group.GroupName ?? "")
    .filter(isAppGroup);
};

const getAttributeValue = (
  attributes: Array<{ Name?: string; Value?: string }> | undefined,
  name: string,
) => attributes?.find((attribute) => attribute.Name === name)?.Value ?? "";

const listAccessUsers = async (): Promise<AccessManagementUser[]> => {
  const response = await cognitoClient.send(
    new ListUsersCommand({
      UserPoolId: getUserPoolId(),
      Limit: 60,
    }),
  );

  const users = await Promise.all(
    (response.Users ?? []).map(async (user) => {
      const username = user.Username ?? "";
      const groups = username ? await listGroupsForUsername(username) : [];

      return {
        name: getAttributeValue(user.Attributes, "name") || getAttributeValue(user.Attributes, "given_name"),
        email: getAttributeValue(user.Attributes, "email"),
        username,
        enabled: Boolean(user.Enabled),
        status: user.UserStatus ?? "UNKNOWN",
        groups,
      } satisfies AccessManagementUser;
    }),
  );

  return users.sort((left, right) => left.username.localeCompare(right.username));
};

const createAccessAuditEntry = async (
  context: RequestContext,
  payload: AccessAuditPayload,
) => {
  const timestamp = payload.timestamp || isoNow();
  const auditId = crypto.randomUUID();
  const record = baseEnvelope<AccessManagementAuditEntry & StoredEntity>(
    {
      PK: tenantPk(context.tenantId),
      SK: `ACCESS_AUDIT#${timestamp}#${auditId}`,
      entityType: "ACCESS_MANAGEMENT_AUDIT",
      tenantId: context.tenantId,
      auditId,
      actorUserId: payload.actorUserId,
      actorUsername: payload.actorUsername,
      actorEmail: payload.actorEmail,
      targetUsername: payload.targetUsername,
      groupName: payload.groupName,
      actionType: payload.actionType,
      timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    "ACCESS_MANAGEMENT_AUDIT",
    timestamp,
  );

  console.info("Access management change", {
    auditId,
    actorUsername: payload.actorUsername,
    targetUsername: payload.targetUsername,
    groupName: payload.groupName,
    actionType: payload.actionType,
    timestamp,
  });
  await putRecord(context.tableName, record);
};

const getAccessMe = async (context: RequestContext): Promise<AccessManagementMe> => {
  const actorGroups = await resolveActorGroups(context);

  return {
    userId: context.actorId,
    username: context.actorUsername,
    email: context.actorEmail,
    name: context.actorName,
    groups: actorGroups,
    canManageAccess: actorGroups.some((group) => accessManagerGroups.includes(group)),
  };
};

const updateAccessGroups = async (
  context: RequestContext,
  username: string,
  payload: AccessManagementUpdateGroupsRequest,
) => {
  await assertAccessManager(context);
  assertNotSelfTarget(context, username);

  if (!username.trim()) {
    throw new HttpError(400, "Username is required.");
  }

  const desiredGroups = assertValidGroups(Array.isArray(payload.groups) ? payload.groups : []);
  const currentGroups = await listGroupsForUsername(username);
  const groupsToAdd = desiredGroups.filter((group) => !currentGroups.includes(group));
  const groupsToRemove = currentGroups.filter((group) => !desiredGroups.includes(group));

  await Promise.all(
    groupsToAdd.map(async (group) => {
      await cognitoClient.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: getUserPoolId(),
          Username: username,
          GroupName: group,
        }),
      );
      await createAccessAuditEntry(context, {
        actorUserId: context.actorId,
        actorUsername: context.actorUsername,
        actorEmail: context.actorEmail,
        targetUsername: username,
        groupName: group,
        actionType: "GROUP_ADDED",
        timestamp: isoNow(),
      });
    }),
  );

  await Promise.all(
    groupsToRemove.map(async (group) => {
      await cognitoClient.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: getUserPoolId(),
          Username: username,
          GroupName: group,
        }),
      );
      await createAccessAuditEntry(context, {
        actorUserId: context.actorId,
        actorUsername: context.actorUsername,
        actorEmail: context.actorEmail,
        targetUsername: username,
        groupName: group,
        actionType: "GROUP_REMOVED",
        timestamp: isoNow(),
      });
    }),
  );

  const users = await listAccessUsers();
  const updatedUser = users.find((entry) => entry.username === username);

  if (!updatedUser) {
    throw new HttpError(404, "User not found after updating groups.");
  }

  return updatedUser;
};

const changeAccessGroupMembership = async (
  context: RequestContext,
  username: string,
  groupName: string,
  action: AccessManagementAuditEntry["actionType"],
) => {
  await assertAccessManager(context);
  assertNotSelfTarget(context, username);

  if (!username.trim()) {
    throw new HttpError(400, "Username is required.");
  }

  const [validatedGroup] = assertValidGroups([groupName]);
  const currentGroups = await listGroupsForUsername(username);

  if (action === "GROUP_ADDED") {
    if (!currentGroups.includes(validatedGroup)) {
      await cognitoClient.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: getUserPoolId(),
          Username: username,
          GroupName: validatedGroup,
        }),
      );
      await createAccessAuditEntry(context, {
        actorUserId: context.actorId,
        actorUsername: context.actorUsername,
        actorEmail: context.actorEmail,
        targetUsername: username,
        groupName: validatedGroup,
        actionType: action,
        timestamp: isoNow(),
      });
    }
  } else if (currentGroups.includes(validatedGroup)) {
    await cognitoClient.send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: getUserPoolId(),
        Username: username,
        GroupName: validatedGroup,
      }),
    );
    await createAccessAuditEntry(context, {
      actorUserId: context.actorId,
      actorUsername: context.actorUsername,
      actorEmail: context.actorEmail,
      targetUsername: username,
      groupName: validatedGroup,
      actionType: action,
      timestamp: isoNow(),
    });
  }

  const users = await listAccessUsers();
  const updatedUser = users.find((entry) => entry.username === username);

  if (!updatedUser) {
    throw new HttpError(404, "User not found after updating groups.");
  }

  return updatedUser;
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
  const userPoolId = getUserPoolId();

  if (!tableName) {
    throw new Error("Missing TENDER_PRICING_TABLE environment variable.");
  }

  if (!userPoolId) {
    throw new Error("Missing COGNITO_USER_POOL_ID environment variable.");
  }

  const actor = getActorIdentity(event);

  return {
    tableName,
    tenantId: getTenantId(event),
    actorId: actor.actorId,
    actorUsername: actor.actorUsername,
    actorName: actor.actorName,
    actorEmail: actor.actorEmail,
    actorGroups: actor.actorGroups,
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
  await createAuditEntriesForStage(context, normalized.tenderId, "TENDER", existing, item);
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

const createTenderAuditLogEntry = async (
  context: RequestContext,
  tenderId: string,
  payload: {
    productId?: string;
    stage: TenderAuditStage;
    actionType: UserActivityAuditActionType;
    changes: AuditChangeDraft[];
    sourcePage: string;
    sourceComponent: string;
  },
) => {
  if (payload.changes.length === 0) {
    return;
  }

  const changedAt = isoNow();
  const auditId = crypto.randomUUID();
  const item = {
    PK: tenderEntityPk(tenderId),
    SK: `AUDIT#${changedAt}#${auditId}`,
    ...baseEnvelope(
      {
        tenantId: context.tenantId,
        tenderId,
        auditId,
        productId: payload.productId,
        stage: payload.stage,
        actionType: payload.actionType,
        changeCount: payload.changes.length,
        changes: payload.changes.map((change) => ({
          fieldName: change.fieldName,
          fieldLabel: change.fieldLabel,
          oldValue: change.oldValue,
          newValue: change.newValue,
          actionType: change.actionType,
        })),
        changedByUserId: context.actorId,
        changedByUserName: context.actorName,
        changedByUserEmail: context.actorEmail ?? "",
        changedAt,
        sourcePage: payload.sourcePage,
        sourceComponent: payload.sourceComponent,
      },
      "USER_ACTIVITY_AUDIT_LOG",
      changedAt,
    ),
  } satisfies StoredEntity;

  await putRecord(context.tableName, item);
};

const resolveAuditActionType = (changes: AuditChangeDraft[]): UserActivityAuditActionType => {
  const actionTypes = new Set(changes.map((change) => change.actionType));

  if (actionTypes.size === 1) {
    return changes[0]?.actionType ?? "UPDATE";
  }

  if (actionTypes.has("APPROVE") && !actionTypes.has("REJECT")) {
    return "APPROVE";
  }

  if (actionTypes.has("REJECT") && !actionTypes.has("APPROVE")) {
    return "REJECT";
  }

  return "UPDATE";
};

const createAuditEntriesForStage = async (
  context: RequestContext,
  tenderId: string,
  stage: TenderAuditStage,
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
) => {
  const drafts =
    stage === "TENDER"
      ? buildTenderAuditRecords(previous, next)
      : stage === "PRODUCT_CONFIGURATION"
        ? buildProductConfigurationAuditRecords(previous, next)
        : stage === "MATERIAL_SOURCE_SELECTION"
          ? buildMaterialSourcingAuditRecords(previous, next)
          : stage === "COST_BUILDUP"
            ? buildCostBuildUpAuditRecords(previous, next)
            : stage === "ALTERNATIVES"
              ? buildAlternativesAuditRecords(previous, next)
              : stage === "PRICING_APPROVAL"
                ? buildPricingApprovalAuditRecords(previous, next)
                : [];

  if (drafts.length === 0) {
    return;
  }

  await createTenderAuditLogEntry(context, tenderId, {
    productId: drafts.find((draft) => draft.productId)?.productId,
    stage,
    actionType: resolveAuditActionType(drafts),
    changes: drafts,
    sourcePage: stageSourceMap[stage].sourcePage,
    sourceComponent: stageSourceMap[stage].sourceComponent,
  });
};

const listTenderAuditLog = async (
  context: RequestContext,
  tenderId: string,
  filters: {
    stage?: string;
    user?: string;
    actionType?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {},
) => {
  const items = await queryTenderEntityRecords(context.tableName, tenderId);
  return items
    .filter((item) => item.entityType === "USER_ACTIVITY_AUDIT_LOG")
    .map(sanitizeTenderAuditLog)
    .filter((item): item is UserActivityAuditLog => Boolean(item))
    .filter((item) => !filters.stage || item.stage === filters.stage)
    .filter((item) => !filters.actionType || item.actionType === filters.actionType)
    .filter((item) => {
      if (!filters.user) {
        return true;
      }

      const search = filters.user.toLowerCase();
      return (
        item.changedByUserId.toLowerCase().includes(search) ||
        item.changedByUserName.toLowerCase().includes(search) ||
        (item.changedByUserEmail ?? "").toLowerCase().includes(search)
      );
    })
    .filter((item) => !filters.dateFrom || item.changedAt >= filters.dateFrom)
    .filter((item) => !filters.dateTo || item.changedAt <= filters.dateTo)
    .sort((left, right) => right.changedAt.localeCompare(left.changedAt));
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

  await createTenderAuditLogEntry(context, tenderId, {
    actionType: "UPDATE",
    stage: "SYSTEM",
    changes: [
      {
        stage: "SYSTEM",
        fieldName: "archived",
        fieldLabel: "Archived Tender",
        oldValue: false,
        newValue: true,
        actionType: "UPDATE",
        sourcePage: "tender-detail",
        sourceComponent: "TenderDetailPage",
      },
    ],
    sourcePage: "tender-detail",
    sourceComponent: "TenderDetailPage",
  });

  return archived;
};

const queryTenderEntityRecords = async (tableName: string, tenderId: string) => {
  const response = await documentClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": tenderEntityPk(tenderId),
      },
    }),
  );

  return (response.Items as StoredEntity[] | undefined) ?? [];
};

const deleteRecordsInBatches = async (tableName: string, items: Array<Pick<StoredEntity, "PK" | "SK">>) => {
  for (let index = 0; index < items.length; index += 25) {
    const chunk = items.slice(index, index + 25);
    await documentClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: chunk.map((item) => ({
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
};

const deleteTender = async (context: RequestContext, tenderId: string) => {
  const existing = await getTender(context, tenderId);
  if (!existing) {
    return null;
  }

  if (existing.status === "APPROVED") {
    throw new Error("Approved tenders cannot be deleted.");
  }

  const tenderEntityItems = await queryTenderEntityRecords(context.tableName, tenderId);
  await deleteRecordsInBatches(context.tableName, tenderEntityItems);

  await documentClient.send(
    new DeleteCommand({
      TableName: context.tableName,
      Key: {
        PK: tenantPk(context.tenantId),
        SK: `TENDER#${tenderId}`,
      },
    }),
  );

  return existing;
};

const duplicateTender = async (context: RequestContext, tenderId: string) => {
  const existing = await getTender(context, tenderId);
  if (!existing) {
    return null;
  }

  const duplicatedTenderId = crypto.randomUUID();
  const duplicated = await saveTender(context, {
    ...existing,
    tenderId: duplicatedTenderId,
    archived: false,
    notes: `Copy of ${existing.tenderNumber}. ${existing.notes ?? ""}`.trim(),
  });

  const [productConfiguration, rollCalculation, materialSourcing, costBuildUp] = await Promise.all([
    getProductConfiguration(context, tenderId),
    getRollCalculation(context, tenderId),
    getMaterialSourcing(context, tenderId),
    getCostBuildUp(context, tenderId),
  ]);

  if (productConfiguration) {
    await saveProductConfiguration(context, duplicatedTenderId, {
      ...productConfiguration,
      tenderId: duplicatedTenderId,
    });
  }

  if (rollCalculation) {
    await saveRollCalculation(context, duplicatedTenderId, {
      ...rollCalculation,
      tenderId: duplicatedTenderId,
    });
  }

  if (materialSourcing) {
    await saveMaterialSourcing(context, duplicatedTenderId, {
      ...materialSourcing,
      tenderId: duplicatedTenderId,
    });
  }

  if (costBuildUp) {
    await saveCostBuildUp(context, duplicatedTenderId, {
      ...costBuildUp,
      tenderId: duplicatedTenderId,
    });
  }

  if (duplicated.status !== existing.status) {
    await saveTender(context, {
      ...duplicated,
      status: existing.status,
    });
  }

  await createTenderAuditLogEntry(context, duplicated.tenderId, {
    actionType: "CREATE",
    stage: "SYSTEM",
    changes: [
      {
        stage: "SYSTEM",
        fieldName: "duplicatedFromTenderId",
        fieldLabel: "Duplicated From Tender",
        oldValue: null,
        newValue: existing.tenderNumber || tenderId,
        actionType: "CREATE",
        sourcePage: "tender-detail",
        sourceComponent: "TenderDetailPage",
      },
    ],
    sourcePage: "tender-detail",
    sourceComponent: "TenderDetailPage",
  });

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

const hasConfiguredProducts = (configuration: ProductConfiguration | null) =>
  Boolean(
    configuration &&
      ((Array.isArray(configuration.selectedProductIds) && configuration.selectedProductIds.length > 0) ||
        (Array.isArray(configuration.productSnapshots) && configuration.productSnapshots.length > 0)),
  );

const clearTenderWorkflowStage = async (
  tableName: string,
  tenderId: string,
  sk: string,
) => {
  await documentClient.send(
    new DeleteCommand({
      TableName: tableName,
      Key: {
        PK: tenderEntityPk(tenderId),
        SK: sk,
      },
    }),
  );
};

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
  await createAuditEntriesForStage(context, tenderId, "PRODUCT_CONFIGURATION", existing, item);
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
  const [existing, configuration] = await Promise.all([
    getRollCalculationRecord(context.tableName, tenderId),
    getProductConfiguration(context, tenderId),
  ]);
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
  if (hasConfiguredProducts(configuration)) {
    await updateTenderStatus(context, tenderId, "MATERIAL_ROLL_CALCULATION");
  }
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

const getReservedStockSourceIds = (selection: Partial<MaterialSourceSelection> | null | undefined) => {
  const stockIds = new Set<string>();
  const collect = (sources: Partial<SelectedMaterialSource>[] | undefined) => {
    sources?.forEach((source) => {
      const sourceId = source.sourceId?.trim();
      if (source.sourceType === "stock" && sourceId) {
        stockIds.add(sourceId);
      }
    });
  };

  collect(selection?.selectedSources);
  selection?.componentSelections?.forEach((component) => collect(component.selectedSources));
  return stockIds;
};

const saveStockReservationState = async (
  context: RequestContext,
  stockItem: StockItem,
  reservation: Pick<
    StockItem,
    "reservationStatus" | "reservedForTenderId" | "reservedForTenderNumber" | "reservedAt"
  >,
) => {
  const item = {
    PK: tenantPk(context.tenantId),
    SK: `STOCK#${stockItem.stockId}`,
    ...baseEnvelope(
      {
        ...stockItem,
        ...reservation,
      },
      "STOCK_ITEM",
      stockItem.createdAt,
    ),
  } satisfies StoredEntity;

  await putRecord(context.tableName, item);
};

const syncTenderStockReservations = async (
  context: RequestContext,
  tenderId: string,
  nextSelection: Partial<MaterialSourceSelection> | null | undefined,
  reservationStatus?: StockReservationStatus,
) => {
  const [existingSelection, tender] = await Promise.all([
    getMaterialSourcing(context, tenderId),
    getTender(context, tenderId),
  ]);

  if (!tender) {
    throw new Error(`Tender ${tenderId} not found.`);
  }

  const previousStockIds = getReservedStockSourceIds(existingSelection);
  const nextStockIds = getReservedStockSourceIds(nextSelection);
  const stockIds = [...new Set([...previousStockIds, ...nextStockIds])];

  if (stockIds.length === 0) {
    return;
  }

  const stockItems = await Promise.all(stockIds.map((stockId) => getStockItem(context, stockId)));
  const stockById = new Map(
    stockItems
      .filter((item): item is StockItem => Boolean(item))
      .map((item) => [item.stockId, item]),
  );

  for (const stockId of nextStockIds) {
    const stockItem = stockById.get(stockId);
    if (!stockItem) {
      throw new Error(`Stock item ${stockId} not found.`);
    }

    if (stockItem.reservedForTenderId && stockItem.reservedForTenderId !== tenderId) {
      const reservedFor = stockItem.reservedForTenderNumber || stockItem.reservedForTenderId;
      const statusLabel = stockItem.reservationStatus === "unavailable" ? "unavailable" : "reserved";
      throw new Error(`Stock item ${stockId} is ${statusLabel} by tender ${reservedFor}.`);
    }
  }

  const reservationTimestamp = isoNow();
  const nextReservationStatus = reservationStatus ?? (tender.status === "APPROVED" ? "unavailable" : "reserved");

  await Promise.all(
    stockIds.map(async (stockId) => {
      const stockItem = stockById.get(stockId);
      if (!stockItem) {
        return;
      }

      const shouldReserve = nextStockIds.has(stockId);
      const isReservedByCurrentTender = stockItem.reservedForTenderId === tenderId;

      if (shouldReserve) {
        if (
          isReservedByCurrentTender &&
          stockItem.reservedForTenderNumber === (tender.tenderNumber || tender.tenderId) &&
          stockItem.reservationStatus === nextReservationStatus
        ) {
          return;
        }

        await saveStockReservationState(context, stockItem, {
          reservationStatus: nextReservationStatus,
          reservedForTenderId: tenderId,
          reservedForTenderNumber: tender.tenderNumber || tender.tenderId,
          reservedAt: reservationTimestamp,
        });
        return;
      }

      if (isReservedByCurrentTender) {
        await saveStockReservationState(context, stockItem, {
          reservationStatus: null,
          reservedForTenderId: null,
          reservedForTenderNumber: null,
          reservedAt: null,
        });
      }
    }),
  );
};

const saveMaterialSourcing = async (
  context: RequestContext,
  tenderId: string,
  payload: Partial<MaterialSourceSelection>,
) => {
  const normalized = normalizeMaterialSourceSelectionPayload(payload, context.tenantId, tenderId);
  const [existing, configuration] = await Promise.all([
    getMaterialSourcingRecord(context.tableName, tenderId),
    getProductConfiguration(context, tenderId),
  ]);
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

  await syncTenderStockReservations(context, tenderId, normalized);
  await putRecord(context.tableName, item);
  await createAuditEntriesForStage(context, tenderId, "MATERIAL_SOURCE_SELECTION", existing, item);
  if (hasConfiguredProducts(configuration)) {
    await updateTenderStatus(context, tenderId, "MATERIAL_SOURCING");
  }
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
  await createAuditEntriesForStage(context, tenderId, "COST_BUILDUP", existing, item);
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
  const existing = payload.stockId ? await getStockItem(context, payload.stockId) : null;
  const normalized = normalizeStockItemPayload(
    {
      ...existing,
      ...payload,
    },
    context.tenantId,
  );
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
    | PricingApproval,
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

const saveAlternatives = async (
  context: RequestContext,
  tenderId: string,
  payload: ScenarioAlternative,
) => {
  const currentCostBuildUp = await getCostBuildUp(context, tenderId);

  if (
    !currentCostBuildUp ||
    currentCostBuildUp.quantity === null ||
    currentCostBuildUp.quantity === undefined ||
    currentCostBuildUp.totalCostPricePerBag === null ||
    currentCostBuildUp.totalCostPricePerBag === undefined ||
    currentCostBuildUp.totalCostPriceForOrder === null ||
    currentCostBuildUp.totalCostPriceForOrder === undefined
  ) {
    throw new Error("Cost Build-Up must be saved before alternatives can be stored.");
  }

  const existing = await getRecord<StoredEntity>(
    context.tableName,
    context.tenantId,
    sectionConfig.alternatives.sk(tenderId),
  );
  const syncedPayload: ScenarioAlternative = {
    entityType: "ScenarioAlternative",
    tenantId: context.tenantId,
    tenderId,
    alternativeId: String(payload.alternativeId ?? "base"),
    currency: "EGP",
    quantity: currentCostBuildUp.quantity,
    baseCostPerBag: currentCostBuildUp.totalCostPricePerBag,
    scenarios: Array.isArray(payload.scenarios)
      ? payload.scenarios.map((scenario) => ({
        scenarioId: String(scenario.scenarioId ?? crypto.randomUUID()),
        label: String(scenario.label ?? ""),
        profitPercent: toNullableNumber(scenario.profitPercent),
        customerCommissionPercent: toNullableNumber(scenario.customerCommissionPercent),
        salesPersonCommissionMode:
          scenario.salesPersonCommissionMode === "fixed" ||
          toNullableNumber(scenario.salesPersonCommissionFixedAmount) !== null
            ? "fixed"
            : "percent",
        salesPersonCommissionPercent: toNullableNumber(scenario.salesPersonCommissionPercent),
        salesPersonCommissionFixedAmount: toNullableNumber(scenario.salesPersonCommissionFixedAmount),
        totalCost: toNullableNumber(scenario.totalCost),
        pricePerBag: toNullableNumber(scenario.pricePerBag),
        totalPrice: toNullableNumber(scenario.totalPrice),
        notes: String(scenario.notes ?? ""),
        }))
      : [],
    notes: String(payload.notes ?? ""),
    createdAt: payload.createdAt ?? "",
    updatedAt: payload.updatedAt ?? "",
  };
  const item = await saveTenderSection(context, tenderId, "alternatives", syncedPayload);
  await createAuditEntriesForStage(context, tenderId, "ALTERNATIVES", existing, item);
  await updateTenderStatus(context, tenderId, "ALTERNATIVES");
  return sanitizeScenarioAlternative(item)!;
};

const savePricingApproval = async (
  context: RequestContext,
  tenderId: string,
  payload: PricingApproval,
) => {
  const existing = await getRecord<StoredEntity>(
    context.tableName,
    context.tenantId,
    sectionConfig["pricing-approval"].sk(tenderId),
  );
  const approvalsOpen = payload.decisions.filter((decision) => decision.status === "pending").length;
  const approvedCount = payload.decisions.filter((decision) => decision.status === "approved").length;
  const deniedCount = payload.decisions.filter((decision) => decision.status === "denied").length;
  const requestedApproval = payload.status === "approved";

  if (requestedApproval && approvedCount === 0) {
    throw new Error("At least one scenario must be approved before approving the tender.");
  }

  const overallStatus: PricingApproval["status"] = requestedApproval
    ? "approved"
    : approvalsOpen === 0 && approvedCount > 0 && deniedCount === 0
      ? "approved"
      : approvedCount > 0 && (approvalsOpen > 0 || deniedCount > 0)
        ? "partial"
        : deniedCount > 0 && approvedCount === 0 && approvalsOpen === 0
          ? "denied"
          : "pending";

  const item = await saveTenderSection(context, tenderId, "pricing-approval", {
    ...payload,
    tenderId,
    approvalId: payload.approvalId || "base",
    approvalsOpen,
    status: overallStatus,
  });

  await createAuditEntriesForStage(context, tenderId, "PRICING_APPROVAL", existing, item);
  if (overallStatus === "approved") {
    const currentSourcing = await getMaterialSourcing(context, tenderId);
    if (currentSourcing) {
      await syncTenderStockReservations(context, tenderId, currentSourcing, "unavailable");
    }
  }
  await updateTenderStatus(context, tenderId, overallStatus === "approved" ? "APPROVED" : "PENDING_APPROVAL");
  return sanitizePricingApproval(item)!;
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
    selectedProductIds: [],
    productSnapshots: [],
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
    exchangeRate: null,
    currencySafetyFactorPercent: null,
    overtimePerBag: null,
    installationPerBag: null,
    transportationCostPerBag: null,
    salesPercentage: null,
    salesFixed: null,
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
    selectedProductIds: [],
    productSnapshots: [],
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

  const approval: PricingApproval = {
    entityType: "PricingApproval",
    tenantId: context.tenantId,
    tenderId: tender.tenderId,
    approvalId: "base",
    currency: "EGP",
    approvalsOpen: 1,
    status: "pending",
    decisions: [
      {
        scenarioId: "base-scenario",
        label: "Scenario 1",
        status: "pending",
        pricePerBag: 1675,
        totalPrice: 167500,
        notes: "",
      },
    ],
    notes: "",
    createdAt,
    updatedAt: createdAt,
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

const seedDevMasterData = async (context: RequestContext) => {
  if (!isDevEnabled()) {
    return json(403, { message: "Development-only endpoint disabled." });
  }

  const customerCountries = [
    "Canada",
    "United States",
    "Germany",
    "France",
    "Italy",
    "Spain",
    "United Kingdom",
    "Egypt",
    "Saudi Arabia",
    "UAE",
  ];
  const materialNames = [
    "PPS Felt 500",
    "PTFE Membrane 420",
    "Polyester Needle Felt",
    "Acrylic Blend 450",
    "Nomex HeatShield",
    "Fiberglass Woven 800",
    "Aramid Prime 320",
    "Polypropylene Flow 280",
    "ePTFE UltraClean",
    "Cotton Support Mesh",
  ];
  const supplierCountries = [
    "Canada",
    "United States",
    "Germany",
    "Italy",
    "India",
    "China",
    "Turkey",
    "Egypt",
    "Saudi Arabia",
    "UAE",
  ];
  const accessoryUnits = ["piece", "set", "pack", "piece", "roll", "set", "pack", "piece", "set", "pack"];

  const customers = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      saveCustomer(context, {
        customerId: `CUS-${String(index + 1).padStart(3, "0")}`,
        tenantId: context.tenantId,
        customerName: `Customer ${index + 1}`,
        country: customerCountries[index],
        contactName: `Contact ${index + 1}`,
        email: `customer${index + 1}@alimex.dev`,
        phone: `+1-555-010${index}`,
        active: true,
      }),
    ),
  );

  const materials = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      saveMaterial(context, {
        materialId: `MAT-${String(index + 1).padStart(3, "0")}`,
        tenantId: context.tenantId,
        materialName: materialNames[index],
        category:
          index < 6 ? "Fabric Material" : index < 8 ? "Ring Material" : "Threading Material",
        description: `${materialNames[index]} master data`,
        baseMaterial: index < 6 ? "PTFE" : index < 8 ? "Steel" : "Nylon",
        defaultWastePercent: 3 + index,
        rollWidthM: index < 6 ? Number((1.2 + index * 0.05).toFixed(2)) : null,
        rollLengthM: index < 6 ? 80 + index * 10 : null,
        active: true,
      }),
    ),
  );

  const suppliers = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      saveSupplier(context, {
        supplierId: `SUP-${String(index + 1).padStart(3, "0")}`,
        tenantId: context.tenantId,
        supplierName: `Supplier ${index + 1}`,
        country: supplierCountries[index],
        contactName: `Sales ${index + 1}`,
        email: `supplier${index + 1}@alimex.dev`,
        phone: `+20-100-000-${String(index + 1).padStart(4, "0")}`,
        preferred: index < 3,
        active: true,
      }),
    ),
  );

  const accessories = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      saveAccessory(context, {
        accessoryId: `ACC-${String(index + 1).padStart(3, "0")}`,
        tenantId: context.tenantId,
        accessoryName: `Accessory ${index + 1}`,
        pricingItems: [
          { key: "Material", price: Number((0.1 + index * 0.05).toFixed(2)) },
          { key: "Labour", price: Number((0.05 + index * 0.02).toFixed(2)) },
        ],
        totalPricePerBagEgp: Number((0.15 + index * 0.07).toFixed(2)),
        active: true,
      }),
    ),
  );

  const products = await Promise.all(
    Array.from({ length: 10 }, (_, index) => {
      const mainMaterial = materials[index % 6];
      const threadMaterial = materials[8 + (index % 2)];
      return saveProduct(context, {
        productId: `PRD-${String(index + 1).padStart(3, "0")}`,
        tenantId: context.tenantId,
        productName: `Filter Bag ${index + 1}`,
        productType: "Filter Bag",
        factoryOverheadPerBag: Number((0.8 + index * 0.05).toFixed(2)),
        manufacturingOverheadPerBag: Number((0.45 + index * 0.04).toFixed(2)),
        managementOverheadPerBag: Number((0.3 + index * 0.03).toFixed(2)),
        active: true,
        components: [
          {
            componentId: crypto.randomUUID(),
            componentName: "Main Body",
            componentType: "Bag Body",
            material: mainMaterial?.materialId ?? "",
            specifications: {
              diameter: Number((0.12 + index * 0.005).toFixed(3)),
              length: Number((1.8 + index * 0.08).toFixed(3)),
              seamAllowance: Number((0.015 + index * 0.001).toFixed(3)),
              topBottomAllowance: Number((0.02 + index * 0.001).toFixed(3)),
            },
          },
          {
            componentId: crypto.randomUUID(),
            componentName: "Ring",
            componentType: "Ring",
            material: materials[6]?.materialId ?? "",
            specifications: {
              finish: index % 2 === 0 ? "Galvanized" : "Stainless",
            },
          },
          {
            componentId: crypto.randomUUID(),
            componentName: "Thread",
            componentType: "Thread",
            material: threadMaterial?.materialId ?? "",
            specifications: {
              ply: index % 2 === 0 ? 3 : 4,
            },
          },
        ],
      });
    }),
  );

  const stockItems = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      saveStockItem(context, {
        stockId: `STK-${String(index + 1).padStart(3, "0")}`,
        tenantId: context.tenantId,
        supplierId: suppliers[index % suppliers.length]?.supplierId ?? "",
        materialId: materials[index % 6]?.materialId ?? "",
        unitCount: 3 + index,
        rollWidthM: Number((1.2 + index * 0.04).toFixed(2)),
        rollLengthM: 60 + index * 8,
        unitCostUsdPerM2: Number((4.8 + index * 0.35).toFixed(2)),
        active: true,
      }),
    ),
  );

  const importPresets = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      saveImportPreset(context, {
        importPresetId: `IMP-${String(index + 1).padStart(3, "0")}`,
        tenantId: context.tenantId,
        supplierId: suppliers[(index + 2) % suppliers.length]?.supplierId ?? "",
        materialId: materials[index % 6]?.materialId ?? "",
        rollWidthM: Number((1.35 + index * 0.03).toFixed(2)),
        rollLengthM: 90 + index * 10,
        leadTimeDays: 21 + index * 2,
        unitCostUsdPerM2: Number((5.5 + index * 0.4).toFixed(2)),
        customsEstimate: Number((0.45 + index * 0.08).toFixed(2)),
        customsPercent: Number((8 + index * 2).toFixed(2)),
        freightCostPerM2Egp: Number((4.5 + index * 0.6).toFixed(2)),
        clearanceCostPerM2Egp: Number((2.5 + index * 0.35).toFixed(2)),
        active: true,
      }),
    ),
  );

  const supplierOffers = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      saveSupplierOffer(context, suppliers[index % suppliers.length]?.supplierId ?? "", {
        offerId: `OFR-${String(index + 1).padStart(3, "0")}`,
        tenantId: context.tenantId,
        supplierId: suppliers[index % suppliers.length]?.supplierId ?? "",
        materialId: materials[index % 6]?.materialId ?? "",
        unitCostUsdPerM2: Number((5.1 + index * 0.28).toFixed(2)),
        minOrderQty: 500 + index * 100,
        leadTimeDays: 14 + index * 3,
        freightCost: Number((125 + index * 15).toFixed(2)),
        customsEstimate: Number((85 + index * 10).toFixed(2)),
        validUntil: `2026-${String((index % 12) + 1).padStart(2, "0")}-28`,
      }),
    ),
  );

  return json(201, {
    message: "Development-only master data seed completed.",
    tenantId: context.tenantId,
    counts: {
      customers: customers.length,
      materials: materials.length,
      suppliers: suppliers.length,
      accessories: accessories.length,
      products: products.length,
      stockItems: stockItems.length,
      importPresets: importPresets.length,
      supplierOffers: supplierOffers.length,
    },
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
    const decodedPath = decodeURIComponent(path);
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
      decodedPath === `/import-presets/${event.pathParameters.importPresetId}`
    ) {
      const importPreset = await getImportPreset(context, event.pathParameters.importPresetId);
      return importPreset ? json(200, importPreset) : json(404, { message: "Import preset not found." });
    }

    if (
      event.pathParameters?.importPresetId &&
      method === "PUT" &&
      decodedPath === `/import-presets/${event.pathParameters.importPresetId}`
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
      decodedPath === `/import-presets/${event.pathParameters.importPresetId}`
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

    if (event.pathParameters?.supplierId && method === "GET" && decodedPath === `/suppliers/${event.pathParameters.supplierId}`) {
      const supplier = await getSupplier(context, event.pathParameters.supplierId);
      return supplier ? json(200, supplier) : json(404, { message: "Supplier not found." });
    }

    if (event.pathParameters?.supplierId && method === "PUT" && decodedPath === `/suppliers/${event.pathParameters.supplierId}`) {
      return json(
        200,
        await saveSupplier(context, {
          ...parseBody<Partial<Supplier>>(event.body),
          supplierId: event.pathParameters.supplierId,
        }),
      );
    }

    if (event.pathParameters?.supplierId && method === "DELETE" && decodedPath === `/suppliers/${event.pathParameters.supplierId}`) {
      const supplier = await archiveTenantEntity(
        context.tableName,
        context.tenantId,
        `SUPPLIER#${event.pathParameters.supplierId}`,
        sanitizeSupplier,
      );
      return supplier ? json(200, supplier) : json(404, { message: "Supplier not found." });
    }

    if (event.pathParameters?.supplierId && method === "GET" && decodedPath === `/suppliers/${event.pathParameters.supplierId}/offers`) {
      return json(200, await listSupplierOffers(context.tableName, event.pathParameters.supplierId));
    }

    if (event.pathParameters?.supplierId && method === "POST" && decodedPath === `/suppliers/${event.pathParameters.supplierId}/offers`) {
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
      decodedPath === `/suppliers/${event.pathParameters.supplierId}/offers/${event.pathParameters.offerId}`
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
      decodedPath === `/suppliers/${event.pathParameters.supplierId}/offers/${event.pathParameters.offerId}`
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

    if (
      tenderId &&
      method === "GET" &&
      (path === `/tenders/${tenderId}/activities` || path === `/tenders/${tenderId}/audit-log`)
    ) {
      return json(
        200,
        await listTenderAuditLog(context, tenderId, {
          stage: event.queryStringParameters?.stage,
          user: event.queryStringParameters?.user,
          actionType: event.queryStringParameters?.actionType,
          dateFrom: event.queryStringParameters?.dateFrom,
          dateTo: event.queryStringParameters?.dateTo,
        }),
      );
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
      try {
        const deleted = await deleteTender(context, tenderId);
        return deleted ? json(200, deleted) : json(404, { message: "Tender not found." });
      } catch (error) {
        if (error instanceof Error && error.message === "Approved tenders cannot be deleted.") {
          return json(400, { message: error.message });
        }

        throw error;
      }
    }

    if (tenderId && section && method === "GET" && path === `/tenders/${tenderId}/${section}`) {
      if (section === "alternatives") {
        const alternatives = sanitizeScenarioAlternative(
          await getTenderSection(context, tenderId, section),
        );
        return alternatives ? json(200, alternatives) : json(404, { message: "Alternatives not found." });
      }

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

      if (section === "pricing-approval") {
        const approval = sanitizePricingApproval(await getTenderSection(context, tenderId, section));
        return approval ? json(200, approval) : json(404, { message: "Pricing approval not found." });
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
      if (section === "alternatives") {
        return json(
          200,
          await saveAlternatives(
            context,
            tenderId,
            parseBody<ScenarioAlternative>(event.body),
          ),
        );
      }

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
        try {
          return json(
            200,
            await saveMaterialSourcing(
              context,
              tenderId,
              parseBody<Partial<MaterialSourceSelection>>(event.body),
            ),
          );
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("Stock item ")) {
            return json(409, { message: error.message });
          }

          throw error;
        }
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

      if (section === "pricing-approval") {
        try {
          return json(
            200,
            await savePricingApproval(
              context,
              tenderId,
              parseBody<PricingApproval>(event.body),
            ),
          );
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "At least one scenario must be approved before approving the tender."
          ) {
            return json(400, { message: error.message });
          }

          throw error;
        }
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
            | PricingApproval
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

    if (method === "GET" && path === "/access-management/me") {
      return json(200, await getAccessMe(context));
    }

    if (method === "GET" && path === "/access-management/groups") {
      await assertAccessManager(context);
      return json(200, await listSupportedGroups());
    }

    if (method === "GET" && path === "/access-management/users") {
      await assertAccessManager(context);
      return json(200, await listAccessUsers());
    }

    if (
      method === "POST" &&
      event.pathParameters?.username &&
      path === `/access-management/users/${event.pathParameters.username}/groups`
    ) {
      return json(
        200,
        await updateAccessGroups(
          context,
          decodeURIComponent(event.pathParameters.username),
          parseBody<AccessManagementUpdateGroupsRequest>(event.body),
        ),
      );
    }

    if (
      method === "POST" &&
      event.pathParameters?.username &&
      event.pathParameters?.groupName &&
      path === `/access-management/users/${event.pathParameters.username}/groups/${event.pathParameters.groupName}`
    ) {
      return json(
        200,
        await changeAccessGroupMembership(
          context,
          decodeURIComponent(event.pathParameters.username),
          decodeURIComponent(event.pathParameters.groupName),
          "GROUP_ADDED",
        ),
      );
    }

    if (
      method === "DELETE" &&
      event.pathParameters?.username &&
      event.pathParameters?.groupName &&
      path === `/access-management/users/${event.pathParameters.username}/groups/${event.pathParameters.groupName}`
    ) {
      return json(
        200,
        await changeAccessGroupMembership(
          context,
          decodeURIComponent(event.pathParameters.username),
          decodeURIComponent(event.pathParameters.groupName),
          "GROUP_REMOVED",
        ),
      );
    }

    if (method === "POST" && path === "/dev/seed") {
      return seedDevData(context);
    }

    if (method === "POST" && path === "/dev/seed-master-data") {
      return seedDevMasterData(context);
    }

    if (method === "DELETE" && event.pathParameters?.tenantId && path === `/dev/tenant/${event.pathParameters.tenantId}/clear`) {
      return clearTenant({
        ...context,
        tenantId: event.pathParameters.tenantId,
      });
    }

    return json(404, { message: "Route not found." });
  } catch (error) {
    if (error instanceof HttpError) {
      return json(error.statusCode, {
        message: error.message,
      });
    }

    console.error("Tender pricing API failed", error);

    return json(500, {
      message: error instanceof Error ? error.message : "Unhandled API error.",
    });
  }
};

export const setHandlerClientsForTesting = (client: DynamoDBDocumentClient) => {
  documentClient = client;
};

export const setCognitoClientForTesting = (client: CognitoIdentityProviderClient) => {
  cognitoClient = client;
};

export const resetHandlerClientsForTesting = () => {
  documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  cognitoClient = new CognitoIdentityProviderClient({});
};

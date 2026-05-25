import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import {
  handler,
  resetHandlerClientsForTesting,
  setCognitoClientForTesting,
  setHandlerClientsForTesting,
} from "../amplify/functions/tender-pricing-api/handler.js";

type MockCommand = {
  constructor: { name: string };
  input?: Record<string, unknown>;
};

const createMockClient = (
  resolver: (command: MockCommand) => Promise<Record<string, unknown>> | Record<string, unknown>,
) => ({
  send: async (command: unknown) => resolver(command as MockCommand),
});

const asHttpResponse = (value: Awaited<ReturnType<typeof handler>>) =>
  value as {
    statusCode: number;
    body?: string;
  };

beforeEach(() => {
  process.env.TENDER_PRICING_TABLE = "TenderPricingTable";
  process.env.ENABLE_DEV_ENDPOINTS = "true";
  process.env.COGNITO_USER_POOL_ID = "us-east-1_example";
});

afterEach(() => {
  resetHandlerClientsForTesting();
});

test("returns dashboard summary counts", async () => {
  setHandlerClientsForTesting(
    createMockClient((command) => {
      assert.equal(command.constructor.name, "QueryCommand");

      return {
        Items: [
          { entityType: "TENDER_REQUEST" },
          { entityType: "TENDER_REQUEST" },
          { entityType: "PricingScenario" },
          { entityType: "PricingApproval" },
          { entityType: "MaterialSourceSelection" },
        ],
      };
    }) as DynamoDBDocumentClient,
  );

  const response = asHttpResponse(
    await handler(
    {
      rawPath: "/dashboard/summary",
      queryStringParameters: { tenantId: "tenant-a" },
      requestContext: { http: { method: "GET" } },
    } as never,
    {} as never,
    {} as never,
    ),
  );

  assert.equal(response?.statusCode, 200);
  assert.ok(response?.body);

  const body = JSON.parse(response.body) as {
    tenantId: string;
    tenderCount: number;
    scenarioCount: number;
    approvalCount: number;
    supplierCount: number;
  };

  assert.equal(body.tenantId, "tenant-a");
  assert.equal(body.tenderCount, 2);
  assert.equal(body.scenarioCount, 1);
  assert.equal(body.approvalCount, 1);
  assert.equal(body.supplierCount, 1);
});

test("blocks dev seed endpoint when disabled", async () => {
  process.env.ENABLE_DEV_ENDPOINTS = "false";

  const response = asHttpResponse(
    await handler(
    {
      rawPath: "/dev/seed",
      requestContext: { http: { method: "POST" } },
      queryStringParameters: { tenantId: "tenant-a" },
    } as never,
    {} as never,
    {} as never,
    ),
  );

  assert.equal(response?.statusCode, 403);
  assert.match(response?.body ?? "", /Development-only endpoint disabled/);
});

test("creates a tender with clean JSON and tender GSI attributes", async () => {
  const seenCommands: MockCommand[] = [];

  setHandlerClientsForTesting(
    createMockClient((command) => {
      seenCommands.push(command);

      if (command.constructor.name === "GetCommand") {
        return {};
      }

      assert.equal(command.constructor.name, "PutCommand");
      assert.equal(command.input?.TableName, "TenderPricingTable");

      const item = command.input?.Item as Record<string, unknown>;
      if (item.entityType === "TENDER_REQUEST") {
        assert.equal(item.PK, "TENANT#tenant-a");
        assert.equal(item.SK, "TENDER#TDR-2001");
        assert.equal(item.GSI1PK, "TENANT#tenant-a#TENDERS");
        assert.match(String(item.GSI1SK), /^UPDATED#/);
        assert.equal(item.status, "DRAFT_INTAKE");
      } else {
        assert.equal(item.PK, "TENDER#TDR-2001");
        assert.equal(item.entityType, "TENDER_ACTIVITY");
        assert.equal(item.section, "TENDER");
      }

      return {};
    }) as DynamoDBDocumentClient,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/tenders",
        requestContext: { http: { method: "POST" } },
        queryStringParameters: { tenantId: "tenant-a" },
        body: JSON.stringify({
          tenderId: "TDR-2001",
          customerName: "Acme Plastics",
          tenderNumber: "TEN-44",
          internalInquiryNumber: "INQ-44",
          tenderDueDate: "2026-07-01",
          requestType: "inquiry",
          requestedMaterial: "Foil",
          bagDiameterMm: 250,
          bagLengthMm: 800,
          topDesign: "Open top",
          bottomDesign: "Flat bottom",
          accessoriesMaterial: "Liner",
          knownRequiredPrice: 1500,
          knownCompetitorPrice: 1480,
          customerCommissionPercent: 2,
          priceNegotiationExpected: true,
          requestedDeliveryTime: "14 days",
          deliveryPlace: "factory",
          transportationRequired: false,
          installationRequired: false,
          notes: "New request",
          status: "DRAFT_INTAKE",
        }),
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 201);
  assert.deepEqual(seenCommands.map((entry) => entry.constructor.name), ["GetCommand", "PutCommand", "PutCommand"]);
  assert.ok(response.body);

  const body = JSON.parse(response.body) as Record<string, unknown>;
  assert.equal(body.PK, undefined);
  assert.equal(body.SK, undefined);
  assert.equal(body.GSI1PK, undefined);
  assert.equal(body.entityType, "TENDER_REQUEST");
  assert.equal(body.customerName, "Acme Plastics");
});

test("saves product configuration with tender-based keys and updates tender status", async () => {
  const seenCommands: MockCommand[] = [];

  setHandlerClientsForTesting(
    createMockClient((command) => {
      seenCommands.push(command);

      if (command.constructor.name === "GetCommand") {
        const key = command.input?.Key as Record<string, string>;

        if (key.PK === "TENDER#TDR-3001") {
          return {};
        }

        return {
          Item: {
            PK: "TENANT#tenant-a",
            SK: "TENDER#TDR-3001",
            GSI1PK: "TENANT#tenant-a#TENDERS",
            GSI1SK: "UPDATED#2026-05-13T10:00:00.000Z",
            entityType: "TENDER_REQUEST",
            tenderId: "TDR-3001",
            tenantId: "tenant-a",
            customerName: "Acme",
            tenderNumber: "TEN-1",
            internalInquiryNumber: "INQ-1",
            tenderDueDate: "2026-06-01",
            requestType: "inquiry",
            requestedMaterial: "Foil",
            bagDiameterMm: 220,
            bagLengthMm: 700,
            topDesign: "Top A",
            bottomDesign: "Bottom A",
            accessoriesMaterial: "ACC",
            requestedMaterialNotes: "",
            knownRequiredPrice: null,
            knownCompetitorPrice: null,
            customerCommissionPercent: null,
            priceNegotiationExpected: false,
            requestedDeliveryTime: "14 days",
            deliveryPlace: "factory",
            transportationRequired: false,
            installationRequired: false,
            notes: "",
            status: "TECHNICAL_REVIEW",
            createdAt: "2026-05-13T10:00:00.000Z",
            updatedAt: "2026-05-13T10:00:00.000Z",
          },
        };
      }

      assert.equal(command.constructor.name, "PutCommand");
      return {};
    }) as DynamoDBDocumentClient,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/tenders/TDR-3001/product-configuration",
        pathParameters: { tenderId: "TDR-3001", section: "product-configuration" },
        queryStringParameters: { tenantId: "tenant-a" },
        requestContext: { http: { method: "PUT" } },
        body: JSON.stringify({
          productType: "Filter Bag",
          quantity: 100,
          bagDiameterMm: 220,
          bagLengthMm: 700,
          seamAllowanceMm: 10,
          topBottomAllowanceMm: 16,
          topDesign: "Top A",
          bottomDesign: "Bottom A",
          seamType: "Overlock",
          includeWearStrip: true,
          wearStripHeightMm: 80,
          mainFabricMaterialId: "FAB-1",
          accessoriesMaterialId: "ACC-1",
          threadMaterialId: "THR-1",
          packagingType: "carton",
          bagsPerCarton: 20,
          packagingNotes: "Handle carefully",
        }),
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 200);
  assert.ok(response.body);

  const putCommands = seenCommands.filter((command) => command.constructor.name === "PutCommand");
  assert.equal(putCommands.length, 4);

  const configItem = putCommands.find((command) => (command.input?.Item as Record<string, unknown>)?.SK === "PRODUCT_CONFIG#base")
    ?.input?.Item as Record<string, unknown>;
  assert.equal(configItem.PK, "TENDER#TDR-3001");
  assert.equal(configItem.SK, "PRODUCT_CONFIG#base");
  assert.equal(configItem.entityType, "PRODUCT_CONFIGURATION");

  const activityItem = putCommands.find(
    (command) =>
      (command.input?.Item as Record<string, unknown>)?.entityType === "TENDER_ACTIVITY" &&
      (command.input?.Item as Record<string, unknown>)?.section === "PRODUCT_CONFIGURATION",
  )?.input?.Item as Record<string, unknown>;
  assert.equal(activityItem.PK, "TENDER#TDR-3001");
  assert.equal(activityItem.actorId, "anonymous");

  const tenderItem = putCommands.find((command) => (command.input?.Item as Record<string, unknown>)?.SK === "TENDER#TDR-3001")
    ?.input?.Item as Record<string, unknown>;
  assert.equal(tenderItem.PK, "TENANT#tenant-a");
  assert.equal(tenderItem.status, "PRODUCT_CONFIGURATION");

  const body = JSON.parse(response.body) as Record<string, unknown>;
  assert.equal(body.PK, undefined);
  assert.equal(body.SK, undefined);
  assert.equal(body.entityType, "PRODUCT_CONFIGURATION");
  assert.equal(body.packagingType, "carton");
});

test("saves roll calculation with tender-based keys and updates tender status", async () => {
  const seenCommands: MockCommand[] = [];

  setHandlerClientsForTesting(
    createMockClient((command) => {
      seenCommands.push(command);

      if (command.constructor.name === "GetCommand") {
        const key = command.input?.Key as Record<string, string>;

        if (key.PK === "TENDER#TDR-4001") {
          return {};
        }

        return {
          Item: {
            PK: "TENANT#tenant-a",
            SK: "TENDER#TDR-4001",
            GSI1PK: "TENANT#tenant-a#TENDERS",
            GSI1SK: "UPDATED#2026-05-13T10:00:00.000Z",
            entityType: "TENDER_REQUEST",
            tenderId: "TDR-4001",
            tenantId: "tenant-a",
            customerName: "Acme",
            tenderNumber: "TEN-1",
            internalInquiryNumber: "INQ-1",
            tenderDueDate: "2026-06-01",
            requestType: "inquiry",
            requestedMaterial: "Foil",
            bagDiameterMm: 220,
            bagLengthMm: 700,
            topDesign: "Top A",
            bottomDesign: "Bottom A",
            accessoriesMaterial: "ACC",
            requestedMaterialNotes: "",
            knownRequiredPrice: null,
            knownCompetitorPrice: null,
            customerCommissionPercent: null,
            priceNegotiationExpected: false,
            requestedDeliveryTime: "14 days",
            deliveryPlace: "factory",
            transportationRequired: false,
            installationRequired: false,
            notes: "",
            status: "PRODUCT_CONFIGURATION",
            createdAt: "2026-05-13T10:00:00.000Z",
            updatedAt: "2026-05-13T10:00:00.000Z",
          },
        };
      }

      assert.equal(command.constructor.name, "PutCommand");
      return {};
    }) as DynamoDBDocumentClient,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/tenders/TDR-4001/roll-calculation",
        pathParameters: { tenderId: "TDR-4001" },
        queryStringParameters: { tenantId: "tenant-a" },
        requestContext: { http: { method: "PUT" } },
        body: JSON.stringify({
          productConfigId: "base",
          bagDiameterMm: 220,
          bagLengthMm: 700,
          seamAllowanceMm: 10,
          topBottomAllowanceMm: 18,
          bagWidthMm: 701.15,
          bagCuttingAreaM2: 0.503,
          rollWidthM: 1.5,
          rollLengthM: 100,
          rollAreaM2: 150,
          wastePercent: 5,
          usableRollAreaM2: 142.5,
          theoreticalBagsPerRoll: 283.3,
          actualBagsPerRoll: 283,
          actualAreaPerBagM2: 0.53,
          totalFabricRequiredM2: 53,
        }),
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 200);
  assert.ok(response.body);

  const putCommands = seenCommands.filter((command) => command.constructor.name === "PutCommand");
  assert.equal(putCommands.length, 4);

  const rollItem = putCommands.find((command) => (command.input?.Item as Record<string, unknown>)?.SK === "ROLL_CALC#base")
    ?.input?.Item as Record<string, unknown>;
  assert.equal(rollItem.PK, "TENDER#TDR-4001");
  assert.equal(rollItem.SK, "ROLL_CALC#base");
  assert.equal(rollItem.entityType, "ROLL_CALCULATION");

  const activityItem = putCommands.find(
    (command) =>
      (command.input?.Item as Record<string, unknown>)?.entityType === "TENDER_ACTIVITY" &&
      (command.input?.Item as Record<string, unknown>)?.section === "ROLL_CALCULATION",
  )?.input?.Item as Record<string, unknown>;
  assert.equal(activityItem.PK, "TENDER#TDR-4001");

  const tenderItem = putCommands.find((command) => (command.input?.Item as Record<string, unknown>)?.SK === "TENDER#TDR-4001")
    ?.input?.Item as Record<string, unknown>;
  assert.equal(tenderItem.PK, "TENANT#tenant-a");
  assert.equal(tenderItem.status, "MATERIAL_ROLL_CALCULATION");

  const body = JSON.parse(response.body) as Record<string, unknown>;
  assert.equal(body.PK, undefined);
  assert.equal(body.SK, undefined);
  assert.equal(body.entityType, "ROLL_CALCULATION");
  assert.equal(body.productConfigId, "base");
});

test("saves material sourcing with tender-based keys and updates tender status", async () => {
  const seenCommands: MockCommand[] = [];

  setHandlerClientsForTesting(
    createMockClient((command) => {
      seenCommands.push(command);

      if (command.constructor.name === "GetCommand") {
        const key = command.input?.Key as Record<string, string>;

        if (key.PK === "TENDER#TDR-5001") {
          return {};
        }

        return {
          Item: {
            PK: "TENANT#tenant-a",
            SK: "TENDER#TDR-5001",
            GSI1PK: "TENANT#tenant-a#TENDERS",
            GSI1SK: "UPDATED#2026-05-13T10:00:00.000Z",
            entityType: "TENDER_REQUEST",
            tenderId: "TDR-5001",
            tenantId: "tenant-a",
            customerName: "Acme",
            tenderNumber: "TEN-3",
            internalInquiryNumber: "INQ-3",
            tenderDueDate: "2026-06-03",
            requestType: "inquiry",
            requestedMaterial: "Foil",
            bagDiameterMm: 220,
            bagLengthMm: 700,
            topDesign: "Top A",
            bottomDesign: "Bottom A",
            accessoriesMaterial: "ACC",
            requestedMaterialNotes: "",
            knownRequiredPrice: null,
            knownCompetitorPrice: null,
            customerCommissionPercent: null,
            priceNegotiationExpected: false,
            requestedDeliveryTime: "14 days",
            deliveryPlace: "factory",
            transportationRequired: false,
            installationRequired: false,
            notes: "",
            status: "MATERIAL_ROLL_CALCULATION",
            createdAt: "2026-05-13T10:00:00.000Z",
            updatedAt: "2026-05-13T10:00:00.000Z",
          },
        };
      }

      assert.equal(command.constructor.name, "PutCommand");
      return {};
    }) as DynamoDBDocumentClient,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/tenders/TDR-5001/material-sourcing",
        pathParameters: { tenderId: "TDR-5001", section: "material-sourcing" },
        queryStringParameters: { tenantId: "tenant-a" },
        requestContext: { http: { method: "PUT" } },
        body: JSON.stringify({
          productConfigId: "base",
          materialId: "FAB-1",
          sourcingStrategy: "combine-sources",
          selectedSources: [
            {
              sourceId: "stock-FAB-1",
              sourceName: "Stock Lot POL-001",
              sourceType: "stock",
              qtyUsedM2: 500,
              unitCostUsdPerM2: 1.2,
              totalCostUsd: 600,
              leadTimeDays: 0,
            },
            {
              sourceId: "offer-1",
              sourceName: "Supplier A",
              sourceType: "import",
              qtyUsedM2: 15125,
              unitCostUsdPerM2: 1.45,
              totalCostUsd: 21931.25,
              leadTimeDays: 21,
            },
          ],
          totalAllocatedQtyM2: 15625,
          weightedAverageUnitCostUsdPerM2: 1.442,
          exchangeRate: 49.5,
          currencySafetyFactorPercent: 3,
          effectiveExchangeRate: 50.985,
          freightCostPerM2Egp: 4.2,
          customsCostPerM2Egp: 1.8,
          otherChargesPerM2Egp: 0.5,
          landedCostEgpPerM2: 80.01,
          materialCostPerBagEgp: 14.2,
          totalMaterialCostEgp: 14200,
          totalLeadTimeDays: 21,
        }),
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 200);
  assert.ok(response.body);

  const putCommands = seenCommands.filter((command) => command.constructor.name === "PutCommand");
  assert.equal(putCommands.length, 4);

  const deleteCommands = seenCommands.filter((command) => command.constructor.name === "DeleteCommand");
  assert.equal(deleteCommands.length, 0);

  const sourcingItem = putCommands.find((command) => (command.input?.Item as Record<string, unknown>)?.SK === "MATERIAL_SOURCE#base")
    ?.input?.Item as Record<string, unknown>;
  assert.equal(sourcingItem.PK, "TENDER#TDR-5001");
  assert.equal(sourcingItem.SK, "MATERIAL_SOURCE#base");
  assert.equal(sourcingItem.entityType, "MATERIAL_SOURCE_SELECTION");

  const activityItem = putCommands.find(
    (command) =>
      (command.input?.Item as Record<string, unknown>)?.entityType === "TENDER_ACTIVITY" &&
      (command.input?.Item as Record<string, unknown>)?.section === "MATERIAL_SOURCE_SELECTION",
  )?.input?.Item as Record<string, unknown>;
  assert.equal(activityItem.PK, "TENDER#TDR-5001");

  const tenderItem = putCommands.find((command) => (command.input?.Item as Record<string, unknown>)?.SK === "TENDER#TDR-5001")
    ?.input?.Item as Record<string, unknown>;
  assert.equal(tenderItem.PK, "TENANT#tenant-a");
  assert.equal(tenderItem.status, "MATERIAL_SOURCING");

  const body = JSON.parse(response.body) as Record<string, unknown>;
  assert.equal(body.PK, undefined);
  assert.equal(body.SK, undefined);
  assert.equal(body.entityType, "MATERIAL_SOURCE_SELECTION");
});

test("saves cost build-up with tender-based keys and updates tender status", async () => {
  const seenCommands: MockCommand[] = [];

  setHandlerClientsForTesting(
    createMockClient((command) => {
      seenCommands.push(command);

      if (command.constructor.name === "GetCommand") {
        const key = command.input?.Key as Record<string, string>;

        if (key.PK === "TENDER#TDR-6001") {
          return {};
        }

        return {
          Item: {
            PK: "TENANT#tenant-a",
            SK: "TENDER#TDR-6001",
            GSI1PK: "TENANT#tenant-a#TENDERS",
            GSI1SK: "UPDATED#2026-05-13T10:00:00.000Z",
            entityType: "TENDER_REQUEST",
            tenderId: "TDR-6001",
            tenantId: "tenant-a",
            customerName: "Acme",
            tenderNumber: "TEN-6",
            internalInquiryNumber: "INQ-6",
            tenderDueDate: "2026-06-05",
            requestType: "inquiry",
            requestedMaterial: "Foil",
            bagDiameterMm: 220,
            bagLengthMm: 700,
            topDesign: "Top A",
            bottomDesign: "Bottom A",
            accessoriesMaterial: "ACC",
            requestedMaterialNotes: "",
            knownRequiredPrice: null,
            knownCompetitorPrice: null,
            customerCommissionPercent: null,
            priceNegotiationExpected: false,
            requestedDeliveryTime: "14 days",
            deliveryPlace: "factory",
            transportationRequired: false,
            installationRequired: false,
            notes: "",
            status: "MATERIAL_SOURCING",
            createdAt: "2026-05-13T10:00:00.000Z",
            updatedAt: "2026-05-13T10:00:00.000Z",
          },
        };
      }

      assert.equal(command.constructor.name, "PutCommand");
      return {};
    }) as DynamoDBDocumentClient,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/tenders/TDR-6001/cost-build-up",
        pathParameters: { tenderId: "TDR-6001", section: "cost-build-up" },
        queryStringParameters: { tenantId: "tenant-a" },
        requestContext: { http: { method: "PUT" } },
        body: JSON.stringify({
          productConfigId: "base",
          alternativeId: "base",
          quantity: 1000,
          currency: "EGP",
          exchangeRate: 50,
          currencySafetyFactorPercent: 3,
          effectiveExchangeRate: 51.5,
          costLines: [
            {
              code: "A",
              category: "Material - Fabric",
              description: "Loaded from sourcing",
              calculationBasis: "Material sourcing material cost per bag",
              costPerBag: 14.2,
              editable: false,
            },
          ],
          totalMaterialCostPerBag: 18.4,
          totalOperatingCostPerBag: 5.1,
          totalAdditionalCostPerBag: 1.6,
          totalCostPricePerBag: 25.1,
          totalCostPriceForOrder: 25100,
        }),
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 200);
  assert.ok(response.body);

  const putCommands = seenCommands.filter((command) => command.constructor.name === "PutCommand");
  assert.equal(putCommands.length, 4);

  const costItem = putCommands.find((command) => (command.input?.Item as Record<string, unknown>)?.SK === "COST_BUILDUP#base")
    ?.input?.Item as Record<string, unknown>;
  assert.equal(costItem.PK, "TENDER#TDR-6001");
  assert.equal(costItem.SK, "COST_BUILDUP#base");
  assert.equal(costItem.entityType, "COST_BUILDUP");
  assert.equal(costItem.exchangeRate, 50);
  assert.equal(costItem.currencySafetyFactorPercent, 3);
  assert.equal(costItem.effectiveExchangeRate, 51.5);

  const activityItem = putCommands.find(
    (command) =>
      (command.input?.Item as Record<string, unknown>)?.entityType === "TENDER_ACTIVITY" &&
      (command.input?.Item as Record<string, unknown>)?.section === "COST_BUILDUP",
  )?.input?.Item as Record<string, unknown>;
  assert.equal(activityItem.PK, "TENDER#TDR-6001");

  const tenderItem = putCommands.find((command) => (command.input?.Item as Record<string, unknown>)?.SK === "TENDER#TDR-6001")
    ?.input?.Item as Record<string, unknown>;
  assert.equal(tenderItem.PK, "TENANT#tenant-a");
  assert.equal(tenderItem.status, "COST_BUILDUP");

  const body = JSON.parse(response.body) as Record<string, unknown>;
  assert.equal(body.PK, undefined);
  assert.equal(body.SK, undefined);
  assert.equal(body.entityType, "COST_BUILDUP");
  assert.equal(body.exchangeRate, 50);
  assert.equal(body.currencySafetyFactorPercent, 3);
  assert.equal(body.effectiveExchangeRate, 51.5);
});

test("lists tender activities with actor and field-level changes", async () => {
  setHandlerClientsForTesting(
    createMockClient((command) => {
      assert.equal(command.constructor.name, "QueryCommand");
      return {
        Items: [
          {
            PK: "TENDER#TDR-6101",
            SK: "ACTIVITY#2026-05-15T12:00:00.000Z#ACT-2",
            entityType: "TENDER_ACTIVITY",
            tenantId: "tenant-a",
            tenderId: "TDR-6101",
            activityId: "ACT-2",
            activityType: "UPDATED",
            section: "PRODUCT_CONFIGURATION",
            actorId: "user-1",
            actorName: "Sally Samuel",
            actorEmail: "sally@alimex.test",
            message: "PRODUCT_CONFIGURATION updated by Sally Samuel.",
            changeCount: 2,
            changes: [
              { fieldPath: "productSnapshots[0].productName", previousValue: "Old", nextValue: "New" },
              { fieldPath: "quantity", previousValue: 10, nextValue: 15 },
            ],
            createdAt: "2026-05-15T12:00:00.000Z",
            updatedAt: "2026-05-15T12:00:00.000Z",
          },
          {
            PK: "TENDER#TDR-6101",
            SK: "ACTIVITY#2026-05-15T11:00:00.000Z#ACT-1",
            entityType: "TENDER_ACTIVITY",
            tenantId: "tenant-a",
            tenderId: "TDR-6101",
            activityId: "ACT-1",
            activityType: "CREATED",
            section: "TENDER",
            actorId: "user-1",
            actorName: "Sally Samuel",
            actorEmail: "sally@alimex.test",
            message: "TENDER created by Sally Samuel.",
            changeCount: 1,
            changes: [{ fieldPath: "customerName", previousValue: null, nextValue: "Acme" }],
            createdAt: "2026-05-15T11:00:00.000Z",
            updatedAt: "2026-05-15T11:00:00.000Z",
          },
        ],
      };
    }) as DynamoDBDocumentClient,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/tenders/TDR-6101/activities",
        pathParameters: { tenderId: "TDR-6101" },
        queryStringParameters: { tenantId: "tenant-a" },
        requestContext: { http: { method: "GET" } },
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body ?? "[]") as Array<Record<string, unknown>>;
  assert.equal(body.length, 2);
  assert.equal(body[0]?.activityId, "ACT-2");
  assert.equal(body[0]?.actorName, "Sally Samuel");
  assert.equal(body[0]?.changeCount, 2);
  assert.deepEqual(body[0]?.changes, [
    { fieldPath: "productSnapshots[0].productName", previousValue: "Old", nextValue: "New" },
    { fieldPath: "quantity", previousValue: 10, nextValue: 15 },
  ]);
});

test("creates customer with tenant keys and clean json response", async () => {
  const seenCommands: MockCommand[] = [];

  setHandlerClientsForTesting(
    createMockClient((command) => {
      seenCommands.push(command);
      if (command.constructor.name === "GetCommand") {
        return {};
      }
      return {};
    }) as DynamoDBDocumentClient,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/customers",
        requestContext: { http: { method: "POST" } },
        queryStringParameters: { tenantId: "tenant-a" },
        body: JSON.stringify({
          customerId: "CUS-1",
          customerName: "Acme Industries",
          country: "Egypt",
          contactName: "Nadia Hassan",
          email: "nadia@acme.test",
          phone: "+20-100-000-0000",
          active: true,
        }),
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 201);
  const putCommand = seenCommands.find((entry) => entry.constructor.name === "PutCommand");
  assert.ok(putCommand);
  const item = putCommand?.input?.Item as Record<string, unknown>;
  assert.equal(item.PK, "TENANT#tenant-a");
  assert.equal(item.SK, "CUSTOMER#CUS-1");
  assert.equal(item.entityType, "CUSTOMER");
  const body = JSON.parse(response.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.PK, undefined);
  assert.equal(body.customerName, "Acme Industries");
});

test("creates material with tenant keys and clean json response", async () => {
  const seenCommands: MockCommand[] = [];

  setHandlerClientsForTesting(
    createMockClient((command) => {
      seenCommands.push(command);
      if (command.constructor.name === "GetCommand") {
        return {};
      }
      return {};
    }) as DynamoDBDocumentClient,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/materials",
        requestContext: { http: { method: "POST" } },
        queryStringParameters: { tenantId: "tenant-a" },
        body: JSON.stringify({
          materialId: "MAT-1",
          materialName: "PTFE",
          category: "Fabric Material",
          description: "PTFE fabric",
          baseMaterial: "PTFE",
          defaultWastePercent: 5,
          rollWidthM: 1.6,
          rollLengthM: 100,
          active: true,
        }),
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 201);
  const putCommand = seenCommands.find((entry) => entry.constructor.name === "PutCommand");
  assert.ok(putCommand);
  const item = putCommand?.input?.Item as Record<string, unknown>;
  assert.equal(item.PK, "TENANT#tenant-a");
  assert.equal(item.SK, "MATERIAL#MAT-1");
  assert.equal(item.entityType, "MATERIAL");
  assert.equal(item.category, "Fabric Material");
  assert.equal(item.rollWidthM, 1.6);
  assert.equal(item.rollLengthM, 100);
  const body = JSON.parse(response.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.PK, undefined);
  assert.equal(body.materialName, "PTFE");
});

test("creates stock item with tenant keys and clean json response", async () => {
  const seenCommands: MockCommand[] = [];

  setHandlerClientsForTesting(
    createMockClient((command) => {
      seenCommands.push(command);
      if (command.constructor.name === "GetCommand") {
        return {};
      }
      return {};
    }) as DynamoDBDocumentClient,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/stock",
        requestContext: { http: { method: "POST" } },
        queryStringParameters: { tenantId: "tenant-a" },
        body: JSON.stringify({
          stockId: "STK-1",
          supplierId: "SUP-1",
          materialId: "MAT-1",
          unitCount: 500,
          active: true,
        }),
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 201);
  const putCommand = seenCommands.find((entry) => entry.constructor.name === "PutCommand");
  assert.ok(putCommand);
  const item = putCommand?.input?.Item as Record<string, unknown>;
  assert.equal(item.PK, "TENANT#tenant-a");
  assert.equal(item.SK, "STOCK#STK-1");
  assert.equal(item.entityType, "STOCK_ITEM");
  assert.equal(item.unitCount, 500);
  const body = JSON.parse(response.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.PK, undefined);
  assert.equal(body.stockId, "STK-1");
});

test("creates import preset with tenant keys and clean json response", async () => {
  const seenCommands: MockCommand[] = [];

  setHandlerClientsForTesting(
    createMockClient((command) => {
      seenCommands.push(command);
      if (command.constructor.name === "GetCommand") {
        return {};
      }
      return {};
    }) as DynamoDBDocumentClient,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/import-presets",
        requestContext: { http: { method: "POST" } },
        queryStringParameters: { tenantId: "tenant-a" },
        body: JSON.stringify({
          importPresetId: "IMP-1",
          supplierId: "SUP-1",
          materialId: "MAT-1",
          leadTimeDays: 21,
          unitCostUsdPerM2: 4.75,
          active: true,
        }),
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 201);
  const putCommand = seenCommands.find((entry) => entry.constructor.name === "PutCommand");
  assert.ok(putCommand);
  const item = putCommand?.input?.Item as Record<string, unknown>;
  assert.equal(item.PK, "TENANT#tenant-a");
  assert.equal(item.SK, "IMPORT_PRESET#IMP-1");
  assert.equal(item.entityType, "IMPORT_PRESET");
  assert.equal(item.unitCostUsdPerM2, 4.75);
  const body = JSON.parse(response.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.PK, undefined);
  assert.equal(body.importPresetId, "IMP-1");
});

test("creates product with structured product components", async () => {
  const seenCommands: MockCommand[] = [];

  setHandlerClientsForTesting(
    createMockClient((command) => {
      seenCommands.push(command);
      if (command.constructor.name === "GetCommand") {
        return {};
      }
      return {};
    }) as DynamoDBDocumentClient,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/products",
        requestContext: { http: { method: "POST" } },
        queryStringParameters: { tenantId: "tenant-a" },
        body: JSON.stringify({
          productId: "PRD-1",
          productName: "Pulse Jet Filter Bag",
          productType: "Filter Bag",
          components: [
            {
              componentId: "CMP-1",
              componentName: "Main Body",
              componentType: "Main Body",
              material: "PTFE",
              specifications: {
                diameter: 160,
                length: 3000,
              },
            },
            {
              componentId: "CMP-2",
              componentName: "Ring",
              componentType: "Top Assembly",
              material: "Steel",
              specifications: {
                finish: "Galvanized",
              },
            },
          ],
          active: true,
        }),
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 201);
  const putCommand = seenCommands.find((entry) => entry.constructor.name === "PutCommand");
  assert.ok(putCommand);
  const item = putCommand?.input?.Item as Record<string, unknown>;
  assert.equal(item.PK, "TENANT#tenant-a");
  assert.equal(item.SK, "PRODUCT#PRD-1");
  assert.equal(item.entityType, "PRODUCT");
  assert.equal((item.components as Array<Record<string, unknown>>).length, 2);
  const body = JSON.parse(response.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.PK, undefined);
  assert.equal(body.productType, "Filter Bag");
});

test("duplicates tender with related workflow snapshots", async () => {
  const seenCommands: MockCommand[] = [];
  const duplicatedTenderId = "11111111-1111-4111-8111-111111111111";
  let putTenderCount = 0;

  const originalRandomUuid = crypto.randomUUID;
  crypto.randomUUID = () => duplicatedTenderId;

  try {
    setHandlerClientsForTesting(
      createMockClient((command) => {
        seenCommands.push(command);

        if (command.constructor.name === "GetCommand") {
          const key = command.input?.Key as Record<string, string>;

          if (key.PK === "TENANT#tenant-a" && key.SK === "TENDER#TDR-7001") {
            return {
              Item: {
                PK: "TENANT#tenant-a",
                SK: "TENDER#TDR-7001",
                GSI1PK: "TENANT#tenant-a#TENDERS",
                GSI1SK: "UPDATED#2026-05-13T10:00:00.000Z",
                GSI2PK: "TENANT#tenant-a#STATUS#COST_BUILDUP",
                GSI2SK: "DUE#2026-07-01",
                entityType: "TENDER_REQUEST",
                tenderId: "TDR-7001",
                tenantId: "tenant-a",
                customerName: "Acme",
                selectedProductIds: ["PROD-1"],
                productSnapshots: [
                  {
                    entityType: "PRODUCT",
                    tenantId: "tenant-a",
                    productId: "PROD-1",
                    productName: "Filter Bag A",
                    productType: "Filter Bag",
                    requestedQuantity: 60,
                    components: [],
                    active: true,
                    createdAt: "2026-05-13T10:00:00.000Z",
                    updatedAt: "2026-05-13T10:00:00.000Z",
                  },
                ],
                tenderNumber: "TEN-7001",
                internalInquiryNumber: "INQ-7001",
                tenderDueDate: "2026-07-01",
                requestType: "inquiry",
                requestedMaterial: "FAB-1",
                bagDiameterMm: 0.3,
                bagLengthMm: 1.2,
                topDesign: "Top A",
                bottomDesign: "Bottom A",
                accessoriesMaterial: "ACC-1",
                requestedMaterialNotes: "",
                knownRequiredPrice: null,
                knownCompetitorPrice: null,
                customerCommissionPercent: null,
                priceNegotiationExpected: false,
                requestedDeliveryTime: "2026-07-15",
                deliveryPlace: "factory",
                transportationRequired: false,
                installationRequired: false,
                notes: "Original",
                status: "COST_BUILDUP",
                createdAt: "2026-05-13T10:00:00.000Z",
                updatedAt: "2026-05-13T10:00:00.000Z",
              },
            };
          }

          if (key.PK === "TENDER#TDR-7001" && key.SK === "PRODUCT_CONFIG#base") {
            return {
              Item: {
                PK: "TENDER#TDR-7001",
                SK: "PRODUCT_CONFIG#base",
                entityType: "PRODUCT_CONFIGURATION",
                tenantId: "tenant-a",
                tenderId: "TDR-7001",
                productConfigId: "base",
                selectedProductIds: ["PROD-1"],
                productSnapshots: [
                  {
                    entityType: "PRODUCT",
                    tenantId: "tenant-a",
                    productId: "PROD-1",
                    productName: "Filter Bag A",
                    productType: "Filter Bag",
                    requestedQuantity: 60,
                    components: [],
                    active: true,
                    createdAt: "2026-05-13T10:00:00.000Z",
                    updatedAt: "2026-05-13T10:00:00.000Z",
                  },
                ],
                productType: "Filter Bag",
                quantity: 60,
                bagDiameterMm: 0.3,
                bagLengthMm: 1.2,
                seamAllowanceMm: 0.01,
                topBottomAllowanceMm: 0.02,
                topDesign: "Top A",
                bottomDesign: "Bottom A",
                seamType: "Overlock",
                includeWearStrip: false,
                wearStripHeightMm: null,
                mainFabricMaterialId: "FAB-1",
                accessoriesMaterialId: "ACC-1",
                threadMaterialId: "THR-1",
                packagingType: "carton",
                bagsPerCarton: 20,
                packagingNotes: "",
                createdAt: "2026-05-13T10:00:00.000Z",
                updatedAt: "2026-05-13T10:00:00.000Z",
              },
            };
          }

          if (key.PK === "TENDER#TDR-7001" && key.SK === "ROLL_CALC#base") {
            return {
              Item: {
                PK: "TENDER#TDR-7001",
                SK: "ROLL_CALC#base",
                entityType: "ROLL_CALCULATION",
                tenantId: "tenant-a",
                tenderId: "TDR-7001",
                productConfigId: "base",
                bagDiameterMm: 0.3,
                bagLengthMm: 1.2,
                seamAllowanceMm: 0.01,
                topBottomAllowanceMm: 0.02,
                bagWidthMm: 0.95,
                bagCuttingAreaM2: 1.159,
                rollWidthM: 2,
                rollLengthM: 100,
                rollAreaM2: 200,
                wastePercent: 3,
                usableRollAreaM2: 194,
                theoreticalBagsPerRoll: 167,
                actualBagsPerRoll: 167,
                actualAreaPerBagM2: 1.197,
                totalFabricRequiredM2: 71.82,
                createdAt: "2026-05-13T10:00:00.000Z",
                updatedAt: "2026-05-13T10:00:00.000Z",
              },
            };
          }

          if (key.PK === "TENDER#TDR-7001" && key.SK === "MATERIAL_SOURCE#base") {
            return {
              Item: {
                PK: "TENDER#TDR-7001",
                SK: "MATERIAL_SOURCE#base",
                entityType: "MATERIAL_SOURCE_SELECTION",
                tenantId: "tenant-a",
                tenderId: "TDR-7001",
                productConfigId: "base",
                materialId: "FAB-1",
                sourcingStrategy: "single-source",
                selectedSources: [],
                componentSelections: [],
                actualAreaPerBagM2: 1.197,
                totalRequiredBags: 60,
                totalAllocatedQtyM2: 71.82,
                weightedAverageUnitCostUsdPerM2: 3.2,
                exchangeRate: 50,
                currencySafetyFactorPercent: 3,
                effectiveExchangeRate: 51.5,
                freightCostPerM2Egp: 4,
                customsCostPerM2Egp: 2,
                otherChargesPerM2Egp: 1,
                landedCostEgpPerM2: 171.8,
                materialCostPerBagEgp: 205.67,
                totalMaterialCostEgp: 12340.2,
                totalLeadTimeDays: 21,
                createdAt: "2026-05-13T10:00:00.000Z",
                updatedAt: "2026-05-13T10:00:00.000Z",
              },
            };
          }

          if (key.PK === "TENDER#TDR-7001" && key.SK === "COST_BUILDUP#base") {
            return {
              Item: {
                PK: "TENDER#TDR-7001",
                SK: "COST_BUILDUP#base",
                entityType: "COST_BUILDUP",
                tenantId: "tenant-a",
                tenderId: "TDR-7001",
                productConfigId: "base",
                alternativeId: "base",
                quantity: 60,
                currency: "EGP",
                exchangeRate: 50,
                currencySafetyFactorPercent: 3,
                effectiveExchangeRate: 51.5,
                costLines: [],
                totalMaterialCostPerBag: 205.67,
                totalOperatingCostPerBag: 12.5,
                totalAdditionalCostPerBag: 2,
                totalCostPricePerBag: 220.17,
                totalCostPriceForOrder: 13210.2,
                createdAt: "2026-05-13T10:00:00.000Z",
                updatedAt: "2026-05-13T10:00:00.000Z",
              },
            };
          }

          if (key.PK === "TENANT#tenant-a" && key.SK === `TENDER#${duplicatedTenderId}`) {
            return putTenderCount > 0
              ? {
                  Item: {
                    PK: "TENANT#tenant-a",
                    SK: `TENDER#${duplicatedTenderId}`,
                    GSI1PK: "TENANT#tenant-a#TENDERS",
                    GSI1SK: "UPDATED#2026-05-13T10:00:00.000Z",
                    GSI2PK: "TENANT#tenant-a#STATUS#COST_BUILDUP",
                    GSI2SK: "DUE#2026-07-01",
                    entityType: "TENDER_REQUEST",
                    tenderId: duplicatedTenderId,
                    tenantId: "tenant-a",
                    customerName: "Acme",
                    selectedProductIds: ["PROD-1"],
                    productSnapshots: [],
                    tenderNumber: "TEN-7001",
                    internalInquiryNumber: "INQ-7001",
                    tenderDueDate: "2026-07-01",
                    requestType: "inquiry",
                    requestedMaterial: "FAB-1",
                    bagDiameterMm: 0.3,
                    bagLengthMm: 1.2,
                    topDesign: "Top A",
                    bottomDesign: "Bottom A",
                    accessoriesMaterial: "ACC-1",
                    requestedMaterialNotes: "",
                    knownRequiredPrice: null,
                    knownCompetitorPrice: null,
                    customerCommissionPercent: null,
                    priceNegotiationExpected: false,
                    requestedDeliveryTime: "2026-07-15",
                    deliveryPlace: "factory",
                    transportationRequired: false,
                    installationRequired: false,
                    notes: "Copy of TEN-7001. Original",
                    status: "COST_BUILDUP",
                    createdAt: "2026-05-13T10:00:00.000Z",
                    updatedAt: "2026-05-13T10:00:00.000Z",
                  },
                }
              : {};
          }

          return {};
        }

        if (command.constructor.name === "DeleteCommand") {
          return {};
        }

        assert.equal(command.constructor.name, "PutCommand");
        const item = command.input?.Item as Record<string, unknown>;
        if (item.PK === "TENANT#tenant-a" && item.SK === `TENDER#${duplicatedTenderId}`) {
          putTenderCount += 1;
        }

        return {};
      }) as DynamoDBDocumentClient,
    );

    const response = asHttpResponse(
      await handler(
        {
          rawPath: "/tenders/TDR-7001/duplicate",
          pathParameters: { tenderId: "TDR-7001" },
          queryStringParameters: { tenantId: "tenant-a" },
          requestContext: { http: { method: "POST" } },
        } as never,
        {} as never,
        {} as never,
      ),
    );

    assert.equal(response.statusCode, 201);
    const putItems = seenCommands
      .filter((command) => command.constructor.name === "PutCommand")
      .map((command) => command.input?.Item as Record<string, unknown>);

    assert.ok(putItems.some((item) => item.PK === `TENDER#${duplicatedTenderId}` && item.SK === "PRODUCT_CONFIG#base"));
    assert.ok(putItems.some((item) => item.PK === `TENDER#${duplicatedTenderId}` && item.SK === "ROLL_CALC#base"));
    assert.ok(putItems.some((item) => item.PK === `TENDER#${duplicatedTenderId}` && item.SK === "MATERIAL_SOURCE#base"));
    assert.ok(putItems.some((item) => item.PK === `TENDER#${duplicatedTenderId}` && item.SK === "COST_BUILDUP#base"));
    assert.ok(putItems.some((item) => item.PK === `TENDER#${duplicatedTenderId}` && String(item.SK).startsWith("ACTIVITY#")));

    assert.ok(response.body);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    assert.equal(body.tenderId, duplicatedTenderId);
    assert.equal(body.status, "COST_BUILDUP");
  } finally {
    crypto.randomUUID = originalRandomUuid;
  }
});

test("deletes non-approved tender with related workflow snapshots", async () => {
  const seenCommands: MockCommand[] = [];

  setHandlerClientsForTesting(
    createMockClient((command) => {
      seenCommands.push(command);

      if (command.constructor.name === "GetCommand") {
        const key = command.input?.Key as Record<string, string>;

        if (key.PK === "TENANT#tenant-a" && key.SK === "TENDER#TDR-8001") {
          return {
            Item: {
              PK: "TENANT#tenant-a",
              SK: "TENDER#TDR-8001",
              GSI1PK: "TENANT#tenant-a#TENDERS",
              GSI1SK: "UPDATED#2026-05-13T10:00:00.000Z",
              entityType: "TENDER_REQUEST",
              tenderId: "TDR-8001",
              tenantId: "tenant-a",
              customerName: "Acme",
              selectedProductIds: ["PROD-1"],
              productSnapshots: [],
              tenderNumber: "TEN-8001",
              internalInquiryNumber: "INQ-8001",
              tenderDueDate: "2026-07-10",
              requestType: "inquiry",
              requestedMaterial: "FAB-1",
              bagDiameterMm: 0.3,
              bagLengthMm: 1.2,
              topDesign: "Top A",
              bottomDesign: "Bottom A",
              accessoriesMaterial: "ACC-1",
              requestedMaterialNotes: "",
              knownRequiredPrice: null,
              knownCompetitorPrice: null,
              customerCommissionPercent: null,
              priceNegotiationExpected: false,
              requestedDeliveryTime: "2026-07-15",
              deliveryPlace: "factory",
              transportationRequired: false,
              installationRequired: false,
              notes: "",
              status: "COST_BUILDUP",
              createdAt: "2026-05-13T10:00:00.000Z",
              updatedAt: "2026-05-13T10:00:00.000Z",
            },
          };
        }

        return {};
      }

      if (command.constructor.name === "QueryCommand") {
        return {
          Items: [
            { PK: "TENDER#TDR-8001", SK: "PRODUCT_CONFIG#base" },
            { PK: "TENDER#TDR-8001", SK: "ROLL_CALC#base" },
            { PK: "TENDER#TDR-8001", SK: "MATERIAL_SOURCE#base" },
            { PK: "TENDER#TDR-8001", SK: "COST_BUILDUP#base" },
          ],
        };
      }

      return {};
    }) as DynamoDBDocumentClient,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/tenders/TDR-8001",
        pathParameters: { tenderId: "TDR-8001" },
        queryStringParameters: { tenantId: "tenant-a" },
        requestContext: { http: { method: "DELETE" } },
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 200);

  const batchDelete = seenCommands.find((command) => command.constructor.name === "BatchWriteCommand");
  assert.ok(batchDelete);
  const deleteRequests = (
    batchDelete?.input?.RequestItems as Record<string, Array<{ DeleteRequest: { Key: Record<string, string> } }>>
  ).TenderPricingTable;
  assert.equal(deleteRequests.length, 4);
  assert.deepEqual(
    deleteRequests.map((entry) => entry.DeleteRequest.Key.SK).sort(),
    ["COST_BUILDUP#base", "MATERIAL_SOURCE#base", "PRODUCT_CONFIG#base", "ROLL_CALC#base"],
  );

  const deleteCommand = seenCommands.find((command) => command.constructor.name === "DeleteCommand");
  assert.ok(deleteCommand);
  const deletedTenderKey = deleteCommand?.input?.Key as Record<string, string>;
  assert.deepEqual(deletedTenderKey, {
    PK: "TENANT#tenant-a",
    SK: "TENDER#TDR-8001",
  });
});

test("blocks deleting approved tender", async () => {
  setHandlerClientsForTesting(
    createMockClient((command) => {
      if (command.constructor.name === "GetCommand") {
        return {
          Item: {
            PK: "TENANT#tenant-a",
            SK: "TENDER#TDR-9001",
            GSI1PK: "TENANT#tenant-a#TENDERS",
            GSI1SK: "UPDATED#2026-05-13T10:00:00.000Z",
            entityType: "TENDER_REQUEST",
            tenderId: "TDR-9001",
            tenantId: "tenant-a",
            customerName: "Acme",
            selectedProductIds: [],
            productSnapshots: [],
            tenderNumber: "TEN-9001",
            internalInquiryNumber: "INQ-9001",
            tenderDueDate: "2026-07-10",
            requestType: "inquiry",
            requestedMaterial: "FAB-1",
            bagDiameterMm: 0.3,
            bagLengthMm: 1.2,
            topDesign: "Top A",
            bottomDesign: "Bottom A",
            accessoriesMaterial: "ACC-1",
            requestedMaterialNotes: "",
            knownRequiredPrice: null,
            knownCompetitorPrice: null,
            customerCommissionPercent: null,
            priceNegotiationExpected: false,
            requestedDeliveryTime: "2026-07-15",
            deliveryPlace: "factory",
            transportationRequired: false,
            installationRequired: false,
            notes: "",
            status: "APPROVED",
            createdAt: "2026-05-13T10:00:00.000Z",
            updatedAt: "2026-05-13T10:00:00.000Z",
          },
        };
      }

      return {};
    }) as DynamoDBDocumentClient,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/tenders/TDR-9001",
        pathParameters: { tenderId: "TDR-9001" },
        queryStringParameters: { tenantId: "tenant-a" },
        requestContext: { http: { method: "DELETE" } },
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 400);
  assert.match(response.body ?? "", /Approved tenders cannot be deleted/);
});

test("creates supplier offer with material partition and supplier offer gsi", async () => {
  const seenCommands: MockCommand[] = [];

  setHandlerClientsForTesting(
    createMockClient((command) => {
      seenCommands.push(command);
      if (command.constructor.name === "QueryCommand") {
        return { Items: [] };
      }
      return {};
    }) as DynamoDBDocumentClient,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/suppliers/SUP-1/offers",
        pathParameters: { supplierId: "SUP-1" },
        requestContext: { http: { method: "POST" } },
        queryStringParameters: { tenantId: "tenant-a" },
        body: JSON.stringify({
          offerId: "OFF-1",
          materialId: "MAT-1",
          unitCostUsdPerM2: 4.5,
          minOrderQty: 100,
          leadTimeDays: 21,
          freightCost: 45,
          customsEstimate: 12,
          validUntil: "2026-12-31",
        }),
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 201);
  const putCommand = seenCommands.find((entry) => entry.constructor.name === "PutCommand");
  assert.ok(putCommand);
  const item = putCommand?.input?.Item as Record<string, unknown>;
  assert.equal(item.PK, "MATERIAL#MAT-1");
  assert.equal(item.SK, "SUPPLIER#SUP-1#OFFER#OFF-1");
  assert.equal(item.GSI3PK, "SUPPLIER#SUP-1#OFFERS");
  assert.equal(item.GSI3SK, "OFFER#OFF-1");
  assert.equal(item.entityType, "SUPPLIER_OFFER");
});

test("blocks non-admin users from access management endpoints", async () => {
  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/access-management/users",
        requestContext: {
          http: { method: "GET" },
          authorizer: {
            jwt: {
              claims: {
                sub: "user-1",
                email: "user@example.com",
                name: "Regular User",
                "cognito:username": "regular-user",
                "cognito:groups": ["sales_engineer"],
              },
            },
          },
        },
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 403);
  assert.match(response.body ?? "", /permission to manage access/i);
});

test("allows admin users to update group membership and logs audit entries", async () => {
  const seenDynamoCommands: MockCommand[] = [];
  const seenCognitoCommands: MockCommand[] = [];

  setHandlerClientsForTesting(
    createMockClient((command) => {
      seenDynamoCommands.push(command);
      if (command.constructor.name === "PutCommand") {
        return {};
      }

      throw new Error(`Unexpected DynamoDB command: ${command.constructor.name}`);
    }) as DynamoDBDocumentClient,
  );

  setCognitoClientForTesting(
    createMockClient((command) => {
      seenCognitoCommands.push(command);

      if (command.constructor.name === "AdminListGroupsForUserCommand") {
        const username = String(command.input?.Username ?? "");
        return {
          Groups:
            username === "target-user"
              ? [{ GroupName: "sales_engineer" }]
              : [{ GroupName: "admin" }],
        };
      }

      if (command.constructor.name === "AdminAddUserToGroupCommand") {
        return {};
      }

      if (command.constructor.name === "ListUsersCommand") {
        return {
          Users: [
            {
              Username: "target-user",
              Enabled: true,
              UserStatus: "CONFIRMED",
              Attributes: [
                { Name: "email", Value: "target@example.com" },
                { Name: "name", Value: "Target User" },
              ],
            },
          ],
        };
      }

      throw new Error(`Unexpected Cognito command: ${command.constructor.name}`);
    }) as never,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/access-management/users/target-user/groups",
        pathParameters: { username: "target-user" },
        requestContext: {
          http: { method: "POST" },
          authorizer: {
            jwt: {
              claims: {
                sub: "admin-1",
                email: "admin@example.com",
                name: "Admin User",
                "cognito:username": "admin-user",
                "cognito:groups": ["admin"],
              },
            },
          },
        },
        body: JSON.stringify({
          groups: ["sales_engineer", "pricing_engineer"],
        }),
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 200);
  assert.ok(
    seenCognitoCommands.some(
      (command) =>
        command.constructor.name === "AdminAddUserToGroupCommand" &&
        command.input?.GroupName === "pricing_engineer",
    ),
  );
  const auditCommand = seenDynamoCommands.find(
    (command) =>
      command.constructor.name === "PutCommand" &&
      (command.input?.Item as Record<string, unknown>)?.entityType === "ACCESS_MANAGEMENT_AUDIT",
  );
  assert.ok(auditCommand);
  assert.equal((auditCommand?.input?.Item as Record<string, unknown>)?.targetUsername, "target-user");
  assert.equal((auditCommand?.input?.Item as Record<string, unknown>)?.groupName, "pricing_engineer");
  assert.equal((auditCommand?.input?.Item as Record<string, unknown>)?.actionType, "GROUP_ADDED");
});

test("allows access management when Cognito shows admin even if token groups are stale", async () => {
  setCognitoClientForTesting(
    createMockClient((command) => {
      if (command.constructor.name === "AdminListGroupsForUserCommand") {
        const username = String(command.input?.Username ?? "");
        return {
          Groups: username === "admin-user" ? [{ GroupName: "admin" }] : [],
        };
      }

      if (command.constructor.name === "ListGroupsCommand") {
        return {
          Groups: [{ GroupName: "admin" }, { GroupName: "super_user" }],
        };
      }

      throw new Error(`Unexpected Cognito command: ${command.constructor.name}`);
    }) as never,
  );

  const response = asHttpResponse(
    await handler(
      {
        rawPath: "/access-management/groups",
        requestContext: {
          http: { method: "GET" },
          authorizer: {
            jwt: {
              claims: {
                sub: "admin-1",
                email: "admin@example.com",
                name: "Admin User",
                "cognito:username": "admin-user",
                "cognito:groups": [],
              },
            },
          },
        },
      } as never,
      {} as never,
      {} as never,
    ),
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.body ?? "", /admin/);
});

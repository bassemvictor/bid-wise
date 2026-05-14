import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import {
  handler,
  resetHandlerClientsForTesting,
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
          { entityType: "TenderRequest" },
          { entityType: "TenderRequest" },
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

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";

import type {
  CostBuildUp,
  MaterialSourceSelection,
  PricingScenario,
  ProductConfiguration,
  RollCalculation,
  ScenarioAlternative,
  TenderRequest,
} from "../../../shared/types.js";

type StoredEntity = {
  PK: string;
  SK: string;
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

const listTenders = async ({ tableName, tenantId }: RequestContext) => {
  const records = await queryTenant<StoredEntity>(tableName, tenantId, "TENDER#");
  return records.filter((record): record is StoredEntity & TenderRequest => record.entityType === "TenderRequest");
};

const saveTender = async (context: RequestContext, payload: TenderRequest) => {
  const existing = await getRecord<StoredEntity>(
    context.tableName,
    context.tenantId,
    `TENDER#${payload.tenderId}`,
  );

  const item = {
    PK: tenantPk(context.tenantId),
    SK: `TENDER#${payload.tenderId}`,
    ...baseEnvelope(
      {
        ...payload,
        tenantId: context.tenantId,
      },
      "TenderRequest",
      existing?.createdAt as string | undefined,
    ),
  } satisfies StoredEntity;

  await putRecord(context.tableName, item);
  return item as TenderRequest;
};

const getTender = async (context: RequestContext, tenderId: string) => {
  return getRecord<TenderRequest>(context.tableName, context.tenantId, `TENDER#${tenderId}`);
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
    tenderCount: items.filter((item) => item.entityType === "TenderRequest").length,
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
    entityType: "TenderRequest",
    tenderId: "TDR-1001",
    tenantId: context.tenantId,
    title: "Aluminum foil tender",
    customerName: "Sample Customer",
    status: "in-review",
    dueDate: "2026-06-15",
    currency: "USD",
    owner: "Pricing Team",
    notes: "Development-only seeded record.",
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
    entityType: "ProductConfiguration",
    tenantId: context.tenantId,
    tenderId: tender.tenderId,
    configurationId: "CFG-1001",
    productFamily: "Foil",
    productCode: "ALM-001",
    quantity: 1000,
    uom: "ROLL",
    assumptions: ["Development-only seeded record."],
    createdAt,
    updatedAt: createdAt,
  };

  const approval: ApprovalSummary = {
    approvalsOpen: 1,
    status: "pending",
  };

  await saveTender(context, tender);
  await saveScenario(context, scenario);
  await saveTenderSection(context, tender.tenderId, "product-configuration", configuration);
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

    if (method === "GET" && path === "/tenders") {
      return json(200, await listTenders(context));
    }

    if (method === "POST" && path === "/tenders") {
      return json(201, await saveTender(context, parseBody<TenderRequest>(event.body)));
    }

    if (tenderId && method === "GET" && path === `/tenders/${tenderId}`) {
      const tender = await getTender(context, tenderId);
      return tender ? json(200, tender) : json(404, { message: "Tender not found." });
    }

    if (tenderId && method === "PUT" && path === `/tenders/${tenderId}`) {
      return json(
        200,
        await saveTender(context, {
          ...parseBody<TenderRequest>(event.body),
          tenderId,
          tenantId: context.tenantId,
        }),
      );
    }

    if (tenderId && section && method === "GET" && path === `/tenders/${tenderId}/${section}`) {
      const payload = await getTenderSection(context, tenderId, section);
      return payload ? json(200, payload) : json(404, { message: "Tender section not found." });
    }

    if (tenderId && section && method === "PUT" && path === `/tenders/${tenderId}/${section}`) {
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

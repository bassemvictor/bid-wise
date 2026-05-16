import { defineBackend } from "@aws-amplify/backend";
import { Stack } from "aws-cdk-lib";
import { CorsHttpMethod, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { AttributeType, BillingMode, ProjectionType, Table } from "aws-cdk-lib/aws-dynamodb";

import { auth } from "./auth/resource.js";
import { tenderPricingApi } from "./functions/tender-pricing-api/resource.js";

const backend = defineBackend({
  auth,
  tenderPricingApi,
});

const apiStack = backend.createStack("alimex-api");
const dataStack = backend.createStack("alimex-data");

const tableName = process.env.TENDER_PRICING_TABLE?.trim();

const tenderPricingTable = new Table(dataStack, "TenderPricingTable", {
  ...(tableName ? { tableName } : {}),
  partitionKey: {
    name: "PK",
    type: AttributeType.STRING,
  },
  sortKey: {
    name: "SK",
    type: AttributeType.STRING,
  },
  billingMode: BillingMode.PAY_PER_REQUEST,
});

tenderPricingTable.addGlobalSecondaryIndex({
  indexName: "GSI1",
  partitionKey: {
    name: "GSI1PK",
    type: AttributeType.STRING,
  },
  sortKey: {
    name: "GSI1SK",
    type: AttributeType.STRING,
  },
  projectionType: ProjectionType.ALL,
});

tenderPricingTable.addGlobalSecondaryIndex({
  indexName: "GSI2",
  partitionKey: {
    name: "GSI2PK",
    type: AttributeType.STRING,
  },
  sortKey: {
    name: "GSI2SK",
    type: AttributeType.STRING,
  },
  projectionType: ProjectionType.ALL,
});

tenderPricingTable.addGlobalSecondaryIndex({
  indexName: "GSI3",
  partitionKey: {
    name: "GSI3PK",
    type: AttributeType.STRING,
  },
  sortKey: {
    name: "GSI3SK",
    type: AttributeType.STRING,
  },
  projectionType: ProjectionType.ALL,
});

backend.tenderPricingApi.addEnvironment("TENDER_PRICING_TABLE", tenderPricingTable.tableName);
backend.tenderPricingApi.addEnvironment("ENABLE_DEV_ENDPOINTS", "true");

tenderPricingTable.grantReadWriteData(backend.tenderPricingApi.resources.lambda);

const httpApi = new HttpApi(apiStack, "TenderPricingHttpApi", {
  apiName: "alimexTenderPricingApi",
  corsPreflight: {
    allowOrigins: ["*"],
    allowHeaders: ["content-type", "authorization", "x-user-id", "x-user-name", "x-user-email"],
    allowMethods: [
      CorsHttpMethod.GET,
      CorsHttpMethod.POST,
      CorsHttpMethod.PUT,
      CorsHttpMethod.DELETE,
      CorsHttpMethod.OPTIONS,
    ],
  },
  createDefaultStage: true,
});

const integration = new HttpLambdaIntegration(
  "TenderPricingApiIntegration",
  backend.tenderPricingApi.resources.lambda,
  {
    scopePermissionToRoute: false,
  },
);

const authorizer = new HttpUserPoolAuthorizer("TenderPricingAuthorizer", backend.auth.resources.userPool, {
  userPoolClients: [backend.auth.resources.userPoolClient],
});

const addProtectedRoutes = (path: string, methods: HttpMethod[]) =>
  httpApi.addRoutes({
    path,
    methods,
    integration,
    authorizer,
  });

addProtectedRoutes("/dashboard/summary", [HttpMethod.GET]);

addProtectedRoutes("/tenders", [HttpMethod.GET, HttpMethod.POST]);

addProtectedRoutes("/tenders/{tenderId}", [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE]);

addProtectedRoutes("/tenders/{tenderId}/duplicate", [HttpMethod.POST]);

addProtectedRoutes("/tenders/{tenderId}/archive", [HttpMethod.POST]);

addProtectedRoutes("/tenders/{tenderId}/{section}", [HttpMethod.GET, HttpMethod.PUT]);

addProtectedRoutes("/tenders/{tenderId}/roll-calculation", [HttpMethod.GET, HttpMethod.PUT]);

addProtectedRoutes("/customers", [HttpMethod.GET, HttpMethod.POST]);

addProtectedRoutes("/customers/{customerId}", [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE]);

addProtectedRoutes("/materials", [HttpMethod.GET, HttpMethod.POST]);

addProtectedRoutes("/materials/{materialId}", [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE]);

addProtectedRoutes("/stock", [HttpMethod.GET, HttpMethod.POST]);

addProtectedRoutes("/stock/{stockId}", [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE]);

addProtectedRoutes("/import-presets", [HttpMethod.GET, HttpMethod.POST]);

addProtectedRoutes("/import-presets/{importPresetId}", [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE]);

addProtectedRoutes("/suppliers", [HttpMethod.GET, HttpMethod.POST]);

addProtectedRoutes("/suppliers/{supplierId}", [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE]);

addProtectedRoutes("/suppliers/{supplierId}/offers", [HttpMethod.GET, HttpMethod.POST]);

addProtectedRoutes("/suppliers/{supplierId}/offers/{offerId}", [HttpMethod.PUT, HttpMethod.DELETE]);

addProtectedRoutes("/products", [HttpMethod.GET, HttpMethod.POST]);

addProtectedRoutes("/products/{productId}", [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE]);

addProtectedRoutes("/accessories", [HttpMethod.GET, HttpMethod.POST]);

addProtectedRoutes("/accessories/{accessoryId}", [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE]);

addProtectedRoutes("/price-scenarios", [HttpMethod.GET, HttpMethod.POST]);

addProtectedRoutes("/price-scenarios/{scenarioId}", [HttpMethod.GET, HttpMethod.PUT]);

addProtectedRoutes("/dev/seed", [HttpMethod.POST]);

addProtectedRoutes("/dev/seed-master-data", [HttpMethod.POST]);

addProtectedRoutes("/dev/tenant/{tenantId}/clear", [HttpMethod.DELETE]);

backend.addOutput({
  custom: {
    API: {
      [httpApi.httpApiName!]: {
        endpoint: httpApi.url,
        region: Stack.of(httpApi).region,
        apiName: httpApi.httpApiName,
      },
    },
    storage: {
      tenderPricingTable: {
        tableName: tenderPricingTable.tableName,
        region: Stack.of(tenderPricingTable).region,
      },
    },
  },
});

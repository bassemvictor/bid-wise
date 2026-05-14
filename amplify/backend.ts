import { defineBackend } from "@aws-amplify/backend";
import { Stack } from "aws-cdk-lib";
import { CorsHttpMethod, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { AttributeType, BillingMode, ProjectionType, Table } from "aws-cdk-lib/aws-dynamodb";

import { tenderPricingApi } from "./functions/tender-pricing-api/resource.js";

const backend = defineBackend({
  tenderPricingApi,
});

const apiStack = backend.createStack("alimex-api");
const dataStack = backend.createStack("alimex-data");

const tableName = process.env.TENDER_PRICING_TABLE ?? "alimex-tender-pricing";

const tenderPricingTable = new Table(dataStack, "TenderPricingTable", {
  tableName,
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
    allowHeaders: ["content-type", "authorization"],
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

httpApi.addRoutes({
  path: "/dashboard/summary",
  methods: [HttpMethod.GET],
  integration,
});

httpApi.addRoutes({
  path: "/tenders",
  methods: [HttpMethod.GET, HttpMethod.POST],
  integration,
});

httpApi.addRoutes({
  path: "/tenders/{tenderId}",
  methods: [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE],
  integration,
});

httpApi.addRoutes({
  path: "/tenders/{tenderId}/duplicate",
  methods: [HttpMethod.POST],
  integration,
});

httpApi.addRoutes({
  path: "/tenders/{tenderId}/archive",
  methods: [HttpMethod.POST],
  integration,
});

httpApi.addRoutes({
  path: "/tenders/{tenderId}/{section}",
  methods: [HttpMethod.GET, HttpMethod.PUT],
  integration,
});

httpApi.addRoutes({
  path: "/tenders/{tenderId}/roll-calculation",
  methods: [HttpMethod.GET, HttpMethod.PUT],
  integration,
});

httpApi.addRoutes({
  path: "/customers",
  methods: [HttpMethod.GET, HttpMethod.POST],
  integration,
});

httpApi.addRoutes({
  path: "/customers/{customerId}",
  methods: [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE],
  integration,
});

httpApi.addRoutes({
  path: "/materials",
  methods: [HttpMethod.GET, HttpMethod.POST],
  integration,
});

httpApi.addRoutes({
  path: "/materials/{materialId}",
  methods: [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE],
  integration,
});

httpApi.addRoutes({
  path: "/stock",
  methods: [HttpMethod.GET, HttpMethod.POST],
  integration,
});

httpApi.addRoutes({
  path: "/stock/{stockId}",
  methods: [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE],
  integration,
});

httpApi.addRoutes({
  path: "/import-presets",
  methods: [HttpMethod.GET, HttpMethod.POST],
  integration,
});

httpApi.addRoutes({
  path: "/import-presets/{importPresetId}",
  methods: [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE],
  integration,
});

httpApi.addRoutes({
  path: "/suppliers",
  methods: [HttpMethod.GET, HttpMethod.POST],
  integration,
});

httpApi.addRoutes({
  path: "/suppliers/{supplierId}",
  methods: [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE],
  integration,
});

httpApi.addRoutes({
  path: "/suppliers/{supplierId}/offers",
  methods: [HttpMethod.GET, HttpMethod.POST],
  integration,
});

httpApi.addRoutes({
  path: "/suppliers/{supplierId}/offers/{offerId}",
  methods: [HttpMethod.PUT, HttpMethod.DELETE],
  integration,
});

httpApi.addRoutes({
  path: "/products",
  methods: [HttpMethod.GET, HttpMethod.POST],
  integration,
});

httpApi.addRoutes({
  path: "/products/{productId}",
  methods: [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE],
  integration,
});

httpApi.addRoutes({
  path: "/accessories",
  methods: [HttpMethod.GET, HttpMethod.POST],
  integration,
});

httpApi.addRoutes({
  path: "/accessories/{accessoryId}",
  methods: [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE],
  integration,
});

httpApi.addRoutes({
  path: "/price-scenarios",
  methods: [HttpMethod.GET, HttpMethod.POST],
  integration,
});

httpApi.addRoutes({
  path: "/price-scenarios/{scenarioId}",
  methods: [HttpMethod.GET, HttpMethod.PUT],
  integration,
});

httpApi.addRoutes({
  path: "/dev/seed",
  methods: [HttpMethod.POST],
  integration,
});

httpApi.addRoutes({
  path: "/dev/tenant/{tenantId}/clear",
  methods: [HttpMethod.DELETE],
  integration,
});

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

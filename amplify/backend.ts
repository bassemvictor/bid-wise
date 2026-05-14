import { defineBackend } from "@aws-amplify/backend";
import { Stack } from "aws-cdk-lib";
import { CorsHttpMethod, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";

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
  methods: [HttpMethod.GET, HttpMethod.PUT],
  integration,
});

httpApi.addRoutes({
  path: "/tenders/{tenderId}/{section}",
  methods: [HttpMethod.GET, HttpMethod.PUT],
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

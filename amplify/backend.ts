import { defineBackend } from "@aws-amplify/backend";
import { Stack } from "aws-cdk-lib";
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  AttributeType,
  BillingMode,
  Table,
} from "aws-cdk-lib/aws-dynamodb";

import { auth } from "./auth/resource.js";
import { congregationMessage } from "./functions/congregation-message/resource.js";

const backend = defineBackend({
  auth,
  congregationMessage,
});

const storageStack = backend.createStack("hello-storage");
const apiStack = backend.createStack("hello-api");

const helloTable = new Table(storageStack, "HelloTable", {
  partitionKey: {
    name: "pk",
    type: AttributeType.STRING,
  },
  sortKey: {
    name: "sk",
    type: AttributeType.STRING,
  },
  billingMode: BillingMode.PAY_PER_REQUEST,
});

backend.congregationMessage.addEnvironment("HELLO_TABLE_NAME", helloTable.tableName);
backend.congregationMessage.addEnvironment("HELLO_ITEM_PK", "CONFIG");
backend.congregationMessage.addEnvironment("HELLO_ITEM_SK", "HELLO");
backend.congregationMessage.addEnvironment(
  "HELLO_STATIC_VALUE",
  "Stored in DynamoDB",
);

helloTable.grantReadWriteData(backend.congregationMessage.resources.lambda);

const userPoolAuthorizer = new HttpUserPoolAuthorizer(
  "HelloUserPoolAuthorizer",
  backend.auth.resources.userPool,
  {
    userPoolClients: [backend.auth.resources.userPoolClient],
  },
);

const helloApi = new HttpApi(apiStack, "HelloApi", {
  apiName: "congregationApi",
  corsPreflight: {
    allowOrigins: ["*"],
    allowHeaders: ["*"],
    allowMethods: [CorsHttpMethod.GET],
  },
  createDefaultStage: true,
  defaultAuthorizer: userPoolAuthorizer,
});

helloApi.addRoutes({
  path: "/hello",
  methods: [HttpMethod.GET],
  integration: new HttpLambdaIntegration(
    "HelloWorldIntegration",
    backend.congregationMessage.resources.lambda,
  ),
});

backend.addOutput({
  custom: {
    API: {
      [helloApi.httpApiName!]: {
        endpoint: helloApi.url,
        region: Stack.of(helloApi).region,
        apiName: helloApi.httpApiName,
      },
    },
    storage: {
      helloTable: {
        tableName: helloTable.tableName,
        region: Stack.of(helloTable).region,
      },
    },
  },
});

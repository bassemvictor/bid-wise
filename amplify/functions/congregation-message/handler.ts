import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";

type HelloItem = {
  pk: string;
  sk: string;
  value: string;
};

type HelloResponse = {
  message: string;
  time: string;
  staticValue: string;
};

let documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const getConfig = () => ({
  tableName: process.env.HELLO_TABLE_NAME ?? "",
  itemPk: process.env.HELLO_ITEM_PK ?? "CONFIG",
  itemSk: process.env.HELLO_ITEM_SK ?? "HELLO",
  defaultStaticValue: process.env.HELLO_STATIC_VALUE ?? "Stored in DynamoDB",
});

const getStaticValue = async () => {
  const { tableName, itemPk, itemSk, defaultStaticValue } = getConfig();

  const response = await documentClient.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        pk: itemPk,
        sk: itemSk,
      },
    }),
  );

  const item = response.Item as HelloItem | undefined;
  if (item?.value) {
    return item.value;
  }

  await documentClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        pk: itemPk,
        sk: itemSk,
        value: defaultStaticValue,
      } satisfies HelloItem,
      ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
    }),
  );

  return defaultStaticValue;
};

const jsonResponse = (statusCode: number, body: HelloResponse | { message: string }) => ({
  statusCode,
  headers: {
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
});

export const handler: APIGatewayProxyHandlerV2 = async () => {
  const { tableName } = getConfig();

  if (!tableName) {
    return jsonResponse(500, {
      message: "Missing HELLO_TABLE_NAME environment variable.",
    });
  }

  try {
    const staticValue = await getStaticValue();

    return jsonResponse(200, {
      message: "Hello world",
      time: new Date().toISOString(),
      staticValue,
    });
  } catch (error) {
    console.error("Failed to load hello data", error);

    return jsonResponse(500, {
      message: "Failed to load hello data.",
    });
  }
};

export const setHandlerClientsForTesting = (client: DynamoDBDocumentClient) => {
  documentClient = client;
};

export const resetHandlerClientsForTesting = () => {
  documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
};

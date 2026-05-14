import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import {
  handler,
  resetHandlerClientsForTesting,
  setHandlerClientsForTesting,
} from "../amplify/functions/congregation-message/handler.js";

type MockCommand = {
  constructor: { name: string };
  input?: Record<string, unknown>;
};

const createMockClient = (
  resolver: (command: MockCommand) => Promise<Record<string, unknown>> | Record<string, unknown>,
) => ({
  send: async (command: unknown) => resolver(command as MockCommand),
});

const invokeHandler = async () =>
  (await handler({} as never, {} as never, {} as never)) as {
    statusCode: number;
    body?: string;
  };

beforeEach(() => {
  process.env.HELLO_TABLE_NAME = "HelloTable";
  process.env.HELLO_ITEM_PK = "CONFIG";
  process.env.HELLO_ITEM_SK = "HELLO";
  process.env.HELLO_STATIC_VALUE = "Stored in DynamoDB";
});

afterEach(() => {
  resetHandlerClientsForTesting();
  process.env.HELLO_TABLE_NAME = "HelloTable";
  process.env.HELLO_ITEM_PK = "CONFIG";
  process.env.HELLO_ITEM_SK = "HELLO";
  process.env.HELLO_STATIC_VALUE = "Stored in DynamoDB";
});

test("returns existing DynamoDB static value", async () => {
  setHandlerClientsForTesting(
    createMockClient((command) => {
      assert.equal(command.constructor.name, "GetCommand");

      return {
        Item: {
          pk: "CONFIG",
          sk: "HELLO",
          value: "Existing value",
        },
      };
    }) as DynamoDBDocumentClient,
  );

  const response = await invokeHandler();

  assert.equal(response.statusCode, 200);
  assert.ok(response.body);

  const body = JSON.parse(response.body) as {
    message: string;
    time: string;
    staticValue: string;
  };

  assert.equal(body.message, "Hello world");
  assert.equal(body.staticValue, "Existing value");
  assert.match(body.time, /^\d{4}-\d{2}-\d{2}T/);
});

test("seeds the default DynamoDB value when missing", async () => {
  const seenCommands: string[] = [];

  setHandlerClientsForTesting(
    createMockClient((command) => {
      seenCommands.push(command.constructor.name);

      if (command.constructor.name === "GetCommand") {
        return {};
      }

      assert.equal(command.constructor.name, "PutCommand");
      assert.equal(command.input?.TableName, "HelloTable");
      assert.deepEqual(command.input?.Item, {
        pk: "CONFIG",
        sk: "HELLO",
        value: "Stored in DynamoDB",
      });

      return {};
    }) as DynamoDBDocumentClient,
  );

  const response = await invokeHandler();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(seenCommands, ["GetCommand", "PutCommand"]);
  assert.ok(response.body);

  const body = JSON.parse(response.body) as { staticValue: string };
  assert.equal(body.staticValue, "Stored in DynamoDB");
});

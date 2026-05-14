import { defineFunction } from "@aws-amplify/backend";

export const congregationMessage = defineFunction({
  name: "hello-world",
  memoryMB: 128,
  runtime: 24,
});

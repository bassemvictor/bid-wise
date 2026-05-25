import { defineFunction } from "@aws-amplify/backend";

export const tenderPricingApi = defineFunction({
  name: "alimex-tender-pricing-api",
  memoryMB: 256,
  runtime: 24,
  timeoutSeconds: 30,
});

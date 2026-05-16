import { defineAuth } from "@aws-amplify/backend";

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ["admin", "sales-manager", "pricing-engineer", "sales-engineer"],
});

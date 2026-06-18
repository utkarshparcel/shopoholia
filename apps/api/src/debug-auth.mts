import { buildServer } from "./index.js";
import { createDefaultDeps } from "./lib/deps.js";

const deps = await createDefaultDeps();
const app = await buildServer({
  logger: true,
  deps,
});
const res = await app.inject({
  method: "POST",
  url: "/auth/otp",
  payload: { phone: "919876543210" },
});
console.log("status", res.statusCode);
console.log("body", res.body);
await app.close();

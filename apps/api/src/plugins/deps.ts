import fp from "fastify-plugin";
import type { AppDeps } from "../lib/deps.js";

declare module "fastify" {
  interface FastifyInstance {
    deps: AppDeps;
  }
}

export function depsPlugin(deps: AppDeps) {
  return fp(
    async (app) => {
      app.decorate("deps", deps);
    },
    { name: "worn-deps" },
  );
}

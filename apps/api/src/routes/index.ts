import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { authRoutes } from "./auth.js";
import { avatarRoutes } from "./avatar.js";
import { cartRoutes } from "./cart.js";
import { coinsRoutes } from "./coins.js";
import { feedRoutes } from "./feed.js";
import { ordersRoutes } from "./orders.js";
import { revealRoutes } from "./reveal.js";
import { sellersRoutes } from "./sellers.js";
import { webhooksRoutes } from "./webhooks.js";

export const apiRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(authRoutes);
  await app.register(avatarRoutes);
  await app.register(feedRoutes);
  await app.register(cartRoutes);
  await app.register(ordersRoutes);
  await app.register(coinsRoutes);
  await app.register(revealRoutes);
  await app.register(sellersRoutes);
  await app.register(webhooksRoutes);
};

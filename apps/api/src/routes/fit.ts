import { randomUUID } from "node:crypto";
import {
  CreateMeasurementBodySchema,
  UpdateMeasurementBodySchema,
  MeasurementHistoryResponseSchema,
  MeasurementListResponseSchema,
  MeasurementProfileSchema,
  TemplatesResponseSchema,
  CreateTailoringOrderBodySchema,
  TailoringOrderResponseSchema,
  TailorsResponseSchema,
  CreateTailorReviewBodySchema,
  TailorReviewSchema,
  TailorReviewsResponseSchema,
  FitPreviewBodySchema,
  FitPreviewResponseSchema,
  FabricUploadResponseSchema,
  parseOptionsSchema,
  defaultSelectionsFromSchema,
  garmentKeyForSelections,
  isFitRegionPackId,
  normalizeFitRegionPack,
  whatChangedNote,
  diffMeasurePoints,
  latestMeasurement,
  tailorStatusTimeline,
  canMarkTailorReceived,
  shouldSendTailorPickupNudge,
  type CreateMeasurementBody,
  type UpdateMeasurementBody,
  type CreateTailoringOrderBody,
  type CreateTailorReviewBody,
  type FitPreviewBody,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { trackServerEvent } from "../lib/analytics.js";
import { audit } from "../lib/audit.js";
import { scheduleTailoringTransitions } from "../lib/tailoring-jobs.js";
import { assignTailorSeller, listTailorMarketplace, tailorRatingAvg } from "../lib/tailor-marketplace.js";
import {
  getRegionPackDefaults,
  listRegionPackDefaults,
} from "../lib/region-pack-defaults.js";
import {
  getMeasureMeta,
  getTailorPickup,
  markTailorPickupNudgeSent,
  setMeasureMeta,
  setTailorPickup,
} from "../lib/closet-ops-prefs.js";
import type {
  CustomizationTemplateRecord,
  MeasurementProfileRecord,
  TailoringOrderRecord,
  TailoringReviewRecord,
} from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function toMeasurementJson(r: MeasurementProfileRecord) {
  const meta = getMeasureMeta(r.id);
  return {
    id: r.id,
    userId: r.userId,
    region: r.region,
    unit: r.unit,
    points: r.points,
    changeNote: r.changeNote ?? meta?.changeNote ?? null,
    previousId: r.previousId ?? meta?.previousId ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toTemplateJson(r: CustomizationTemplateRecord) {
  return {
    id: r.id,
    region: r.region,
    garmentType: r.garmentType,
    name: r.name,
    optionsSchema: parseOptionsSchema(r.optionsSchema),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toTailoringJson(r: TailoringOrderRecord) {
  const pickup = getTailorPickup(r.id);
  return {
    id: r.id,
    userId: r.userId,
    templateId: r.templateId,
    measurementProfileId: r.measurementProfileId,
    selections: r.selections,
    fabricRef: r.fabricRef,
    fabricPhotoKeys: r.fabricPhotoKeys ?? [],
    tailorSellerId: r.tailorSellerId,
    measurementSnapshot: r.measurementSnapshot,
    state: r.state,
    expectedPickupOn: r.expectedPickupOn ?? pickup?.expectedPickupOn ?? null,
    timeline: tailorStatusTimeline(r.state),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toReviewJson(r: TailoringReviewRecord) {
  return {
    id: r.id,
    sellerId: r.sellerId,
    userId: r.userId,
    orderId: r.orderId,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
  };
}

export const fitRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /fit/measurements
  app.get(
    "/fit/measurements",
    {
      preHandler: requireAuth,
      schema: { tags: ["fit"], response: { 200: MeasurementListResponseSchema, 401: ErrorSchema } },
    },
    async (request) => {
      const userId = request.user!.sub;
      const list = await app.deps.repos.listMeasurementProfiles(userId);
      return { measurements: list.map(toMeasurementJson) };
    },
  );

  // POST /fit/measurements
  app.post(
    "/fit/measurements",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        body: CreateMeasurementBodySchema,
        response: { 201: MeasurementProfileSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as CreateMeasurementBody;
      const created = await app.deps.repos.createMeasurementProfile({
        userId,
        region: body.region ?? "IN",
        unit: body.unit ?? "CM",
        points: body.points,
        changeNote: body.changeNote ?? null,
      });
      if (body.changeNote) {
        setMeasureMeta(created.id, {
          changeNote: body.changeNote,
          previousId: null,
          familyId: created.id,
        });
      }
      trackServerEvent("measurement_saved", { userId, measurementId: created.id });
      return reply.code(201).send(toMeasurementJson(created));
    },
  );

  /** U037 — versioned update with change note. */
  app.patch(
    "/fit/measurements/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        params: z.object({ id: z.string().uuid() }),
        body: UpdateMeasurementBodySchema,
        response: { 200: MeasurementProfileSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params as { id: string };
      const body = request.body as UpdateMeasurementBody;
      const prev = await app.deps.repos.findMeasurementProfile(id, userId);
      if (!prev) {
        return reply.code(404).send({ error: "Not Found", message: "Measurement profile not found" });
      }
      const diffs = diffMeasurePoints(prev.points, body.points);
      const note = whatChangedNote(diffs, body.changeNote);
      const created = await app.deps.repos.createMeasurementProfile({
        userId,
        region: body.region ?? prev.region,
        unit: body.unit ?? prev.unit,
        points: body.points,
        changeNote: note,
        previousId: prev.id,
      });
      const prevMeta = getMeasureMeta(prev.id);
      setMeasureMeta(created.id, {
        changeNote: note,
        previousId: prev.id,
        familyId: prevMeta?.familyId ?? prev.id,
      });
      audit(app.log, "fit.measurement.updated", {
        userId,
        previousId: prev.id,
        measurementId: created.id,
        changeNote: note,
      });
      trackServerEvent("measurement_updated", { userId, measurementId: created.id });
      return toMeasurementJson(created);
    },
  );

  app.get(
    "/fit/measurements/history",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        response: { 200: MeasurementHistoryResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const list = await app.deps.repos.listMeasurementProfiles(userId);
      const mapped = list.map(toMeasurementJson);
      const latest = latestMeasurement(mapped);
      return { latest, history: mapped };
    },
  );

  // GET /fit/templates?region=
  app.get(
    "/fit/templates",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        querystring: z.object({ region: z.string().optional() }),
        response: { 200: TemplatesResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const { region } = request.query as { region?: string };
      await app.deps.repos.seedCustomizationTemplates();
      const list = await app.deps.repos.listCustomizationTemplates(region);
      trackServerEvent("template_viewed", { userId, region: region ?? "ALL", count: list.length });
      return { templates: list.map(toTemplateJson) };
    },
  );

  // GET /fit/tailors — tailor marketplace
  app.get(
    "/fit/tailors",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        response: { 200: TailorsResponseSchema, 401: ErrorSchema },
      },
    },
    async () => {
      const tailors = await listTailorMarketplace(app.deps.repos);
      return { tailors };
    },
  );

  // GET /fit/tailors/:sellerId/reviews
  app.get(
    "/fit/tailors/:sellerId/reviews",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        params: z.object({ sellerId: z.string().uuid() }),
        response: { 200: TailorReviewsResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const { sellerId } = request.params;
      const seller = await app.deps.repos.findSellerById(sellerId);
      if (!seller || seller.sellerType !== "TAILOR") {
        return reply.code(404).send({ error: "Not Found", message: "Tailor not found" });
      }
      const reviews = await app.deps.repos.listTailoringReviews(sellerId);
      return {
        reviews: reviews.map(toReviewJson),
        ratingAvg: tailorRatingAvg(reviews),
      };
    },
  );

  // POST /fit/tailors/:sellerId/reviews
  app.post(
    "/fit/tailors/:sellerId/reviews",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        params: z.object({ sellerId: z.string().uuid() }),
        body: CreateTailorReviewBodySchema,
        response: { 201: TailorReviewSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { sellerId } = request.params;
      const body = request.body as CreateTailorReviewBody;
      const seller = await app.deps.repos.findSellerById(sellerId);
      if (!seller || seller.sellerType !== "TAILOR") {
        return reply.code(404).send({ error: "Not Found", message: "Tailor not found" });
      }
      if (body.orderId) {
        const order = await app.deps.repos.findTailoringOrder(body.orderId, userId);
        if (!order) {
          return reply.code(404).send({ error: "Not Found", message: "Order not found" });
        }
      }
      const review = await app.deps.repos.createTailoringReview({
        sellerId,
        userId,
        orderId: body.orderId ?? null,
        rating: body.rating,
        comment: body.comment ?? null,
      });
      trackServerEvent("tailor_reviewed", { userId, sellerId, rating: body.rating });
      return reply.code(201).send(toReviewJson(review));
    },
  );

  // POST /fit/fabric — upload fabric photo to R2
  app.post(
    "/fit/fabric",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        consumes: ["multipart/form-data"],
        response: {
          201: FabricUploadResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const parts = request.parts();
      let key: string | null = null;
      for await (const part of parts) {
        if (part.type !== "file") continue;
        const buffer = await part.toBuffer();
        if (buffer.length === 0) continue;
        key = `fit/fabric/${userId}/${randomUUID()}.jpg`;
        await app.deps.storage.put({
          key,
          body: buffer,
          contentType: part.mimetype || "image/jpeg",
        });
        break;
      }
      if (!key) {
        return reply.code(400).send({ error: "Bad Request", message: "Fabric photo file required" });
      }
      const url = await app.deps.storage.getSignedUrl(key);
      trackServerEvent("fabric_uploaded", { userId, key });
      return reply.code(201).send({ key, url });
    },
  );

  // POST /fit/preview — avatar customization preview before order
  app.post(
    "/fit/preview",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        body: FitPreviewBodySchema,
        response: { 200: FitPreviewResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as FitPreviewBody;
      const template = await app.deps.repos.findCustomizationTemplate(body.templateId);
      if (!template) {
        return reply.code(404).send({ error: "Not Found", message: "Template not found" });
      }
      const schema = parseOptionsSchema(template.optionsSchema);
      const selections =
        Object.keys(body.selections ?? {}).length > 0
          ? body.selections
          : defaultSelectionsFromSchema(schema);
      const summary = Object.entries(selections)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      const garmentKey = garmentKeyForSelections(schema, selections) ?? `fit/preview/${template.id}.jpg`;
      const avatar = await app.deps.repos.findAvatarByUserId(userId);

      if (!avatar?.referenceImageKey) {
        trackServerEvent("tailoring_previewed", { userId, templateId: template.id, status: "NO_AVATAR" });
        return {
          status: "NO_AVATAR" as const,
          previewUrl: null,
          imageKey: garmentKey,
          selections,
          summary: summary || template.name,
        };
      }

      let imageKey = `fit/avatar-preview/${userId}/${template.id}/${randomUUID()}.jpg`;
      let previewUrl: string | null = null;
      try {
        const result = await app.deps.renderProvider.tryOn({
          modelImageKey: avatar.referenceImageKey,
          garmentImageKey: garmentKey,
        });
        imageKey = result.imageKey;
        if (result.imageBytes) {
          await app.deps.storage.put({
            key: imageKey,
            body: Buffer.from(result.imageBytes),
            contentType: "image/jpeg",
          });
        }
        previewUrl = await app.deps.storage.getSignedUrl(imageKey);
      } catch {
        previewUrl = await app.deps.storage.getSignedUrl(avatar.referenceImageKey);
        imageKey = avatar.referenceImageKey;
      }

      trackServerEvent("tailoring_previewed", { userId, templateId: template.id, status: "READY" });
      return {
        status: "READY" as const,
        previewUrl,
        imageKey,
        selections,
        summary: summary || template.name,
      };
    },
  );

  // POST /fit/orders
  app.post(
    "/fit/orders",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        body: CreateTailoringOrderBodySchema,
        response: { 201: TailoringOrderResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as CreateTailoringOrderBody;
      const template = await app.deps.repos.findCustomizationTemplate(body.templateId);
      if (!template) return reply.code(404).send({ error: "Not Found", message: "Template not found" });
      if (body.measurementProfileId) {
        const mp = await app.deps.repos.findMeasurementProfile(body.measurementProfileId, userId);
        if (!mp) return reply.code(404).send({ error: "Not Found", message: "Measurement profile not found" });
      }
      let snapshot: Record<string, unknown> | null = null;
      if (!body.measurementProfileId) {
        const avatar = await app.deps.repos.findAvatarByUserId(userId);
        if (avatar?.bodyMeta) snapshot = avatar.bodyMeta as Record<string, unknown>;
      }
      const tailorSellerId = await assignTailorSeller(app.deps.repos, body.tailorSellerId);
      const order = await app.deps.repos.createTailoringOrder({
        userId,
        templateId: body.templateId,
        measurementProfileId: body.measurementProfileId ?? null,
        selections: body.selections ?? {},
        fabricRef: body.fabricRef ?? null,
        fabricPhotoKeys: body.fabricPhotoKeys ?? [],
        tailorSellerId,
        measurementSnapshot: snapshot,
        expectedPickupOn: body.expectedPickupOn ?? null,
      });
      if (body.expectedPickupOn) {
        setTailorPickup(order.id, body.expectedPickupOn);
      }
      await scheduleTailoringTransitions({ orderId: order.id, userId });
      trackServerEvent("tailoring_ordered", {
        userId,
        orderId: order.id,
        templateId: body.templateId,
        tailorSellerId,
      });
      return reply.code(201).send(toTailoringJson(order));
    },
  );

  // GET /fit/orders/:id
  app.get(
    "/fit/orders/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: TailoringOrderResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const order = await app.deps.repos.findTailoringOrder(id, userId);
      if (!order) return reply.code(404).send({ error: "Not Found", message: "Tailoring order not found" });
      return toTailoringJson(order);
    },
  );

  // GET /fit/orders (list)
  app.get(
    "/fit/orders",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        response: { 200: z.object({ orders: z.array(TailoringOrderResponseSchema) }), 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const orders = await app.deps.repos.listTailoringOrders(userId);
      return { orders: orders.map(toTailoringJson) };
    },
  );

  // POST /fit/orders/:id/fabric — attach fabric photo keys to an order
  app.post(
    "/fit/orders/:id/fabric",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          fabricRef: z.string().optional().nullable(),
          fabricPhotoKeys: z.array(z.string()).min(1),
        }),
        response: { 200: TailoringOrderResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body as { fabricRef?: string | null; fabricPhotoKeys: string[] };
      const existing = await app.deps.repos.findTailoringOrder(id, userId);
      if (!existing) {
        return reply.code(404).send({ error: "Not Found", message: "Tailoring order not found" });
      }
      const merged = [...new Set([...(existing.fabricPhotoKeys ?? []), ...body.fabricPhotoKeys])];
      const updated = await app.deps.repos.updateTailoringOrderFabric(id, userId, {
        fabricRef: body.fabricRef ?? existing.fabricRef,
        fabricPhotoKeys: merged,
      });
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Tailoring order not found" });
      }
      return toTailoringJson(updated);
    },
  );

  // POST /fit/orders/:id/reorder — clone measurements/selections into a new PENDING draft
  app.post(
    "/fit/orders/:id/reorder",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        params: z.object({ id: z.string().uuid() }),
        response: { 201: TailoringOrderResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const source = await app.deps.repos.findTailoringOrder(id, userId);
      if (!source) {
        return reply.code(404).send({ error: "Not Found", message: "Tailoring order not found" });
      }
      if (!source.templateId) {
        return reply.code(404).send({ error: "Not Found", message: "Source order has no template to reorder" });
      }

      let snapshot: Record<string, unknown> | null =
        source.measurementSnapshot != null
          ? { ...source.measurementSnapshot }
          : null;
      // U037 — prefer latest measurement profile for reorder
      const profiles = await app.deps.repos.listMeasurementProfiles(userId);
      const latest = latestMeasurement(profiles);
      let measurementProfileId = source.measurementProfileId;
      if (latest) {
        measurementProfileId = latest.id;
        snapshot = { ...latest.points };
      } else if (!snapshot && source.measurementProfileId) {
        const mp = await app.deps.repos.findMeasurementProfile(source.measurementProfileId, userId);
        if (mp) snapshot = { ...mp.points };
      }

      const tailorSellerId = await assignTailorSeller(app.deps.repos, source.tailorSellerId);

      const order = await app.deps.repos.createTailoringOrder({
        userId,
        templateId: source.templateId,
        measurementProfileId,
        selections: { ...source.selections },
        fabricRef: source.fabricRef,
        fabricPhotoKeys: [...(source.fabricPhotoKeys ?? [])],
        tailorSellerId,
        measurementSnapshot: snapshot,
      });
      await scheduleTailoringTransitions({ orderId: order.id, userId });
      trackServerEvent("tailoring_reordered", {
        userId,
        orderId: order.id,
        sourceOrderId: source.id,
        templateId: source.templateId,
      });
      return reply.code(201).send(toTailoringJson(order));
    },
  );

  /** U038 — mark tailor order received. */
  app.post(
    "/fit/orders/:id/received",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: TailoringOrderResponseSchema, 400: ErrorSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params as { id: string };
      const order = await app.deps.repos.findTailoringOrder(id, userId);
      if (!order) {
        return reply.code(404).send({ error: "Not Found", message: "Tailoring order not found" });
      }
      if (!canMarkTailorReceived(order.state) && order.state !== "DELIVERED") {
        return reply
          .code(400)
          .send({ error: "Bad Request", message: `Cannot mark received from ${order.state}` });
      }
      if (order.state === "DELIVERED") return toTailoringJson(order);
      const updated = await app.deps.repos.updateTailoringOrderState(id, "DELIVERED");
      audit(app.log, "fit.tailor.received", { userId, orderId: id });
      trackServerEvent("tailor_marked_received", { userId, orderId: id });
      return toTailoringJson(updated!);
    },
  );

  /** U038 — T-1d pickup nudge (manual or job trigger). */
  app.post(
    "/fit/orders/:id/pickup-nudge",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          expectedPickupOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        }),
        response: {
          200: z.object({
            sent: z.boolean(),
            reason: z.string().optional(),
            order: TailoringOrderResponseSchema,
          }),
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params as { id: string };
      const body = request.body as { expectedPickupOn?: string; asOf?: string };
      const order = await app.deps.repos.findTailoringOrder(id, userId);
      if (!order) {
        return reply.code(404).send({ error: "Not Found", message: "Tailoring order not found" });
      }
      if (body.expectedPickupOn) setTailorPickup(id, body.expectedPickupOn);
      const pickup = getTailorPickup(id);
      const expected =
        body.expectedPickupOn ?? order.expectedPickupOn ?? pickup?.expectedPickupOn ?? null;
      if (!expected) {
        return {
          sent: false,
          reason: "expectedPickupOn required",
          order: toTailoringJson(order),
        };
      }
      const asOf = body.asOf ?? new Date().toISOString().slice(0, 10);
      const should = shouldSendTailorPickupNudge({
        expectedPickupOn: expected,
        asOf,
        alreadySent: pickup?.nudgeSent,
        state: order.state,
      });
      if (!should) {
        return {
          sent: false,
          reason: "not due or already sent",
          order: toTailoringJson(order),
        };
      }
      try {
        await app.deps.push.send({
          userId,
          eventType: "OUTFIT_READY",
          title: "Tailor pickup tomorrow",
          body: `Pickup expected ${expected} — bring your receipt.`,
          link: { deepLink: "worn://fit", screen: "fit" },
        });
      } catch {
        // best-effort
      }
      markTailorPickupNudgeSent(id);
      audit(app.log, "fit.tailor.pickup_nudge", { userId, orderId: id, expectedPickupOn: expected });
      trackServerEvent("tailor_pickup_nudged", { userId, orderId: id });
      return { sent: true, order: toTailoringJson(order) };
    },
  );

  // U048 — region pack defaults (merchants, festivals, size systems)
  app.get(
    "/fit/region-packs",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["fit"],
        querystring: z.object({ region: z.string().optional() }),
        response: {
          200: z.object({
            packs: z.array(
              z.object({
                region: z.string(),
                merchants: z.array(z.string()),
                festivals: z.array(
                  z.object({
                    occasion: z.string(),
                    label: z.string(),
                    month: z.number().int(),
                    day: z.number().int(),
                  }),
                ),
                sizeSystem: z.object({
                  id: z.string(),
                  label: z.string(),
                  examples: z.array(z.string()),
                }),
                summary: z.string(),
              }),
            ),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const region = request.query.region;
      if (region && isFitRegionPackId(region)) {
        return { packs: [getRegionPackDefaults(normalizeFitRegionPack(region))] };
      }
      return { packs: listRegionPackDefaults() };
    },
  );
};

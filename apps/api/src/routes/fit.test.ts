import { describe, it, expect, vi } from "vitest";
import type {
  MeasurementListResponse,
  MeasurementProfile,
  TailoringOrder,
  TemplatesResponse,
} from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";

function buildMultipart(
  parts: Array<
    | { kind: "file"; name?: string; filename?: string; buffer: Buffer; contentType?: string }
    | { kind: "field"; name: string; value: string }
  >,
) {
  const boundary = "----wornfitboundary";
  const chunks: Buffer[] = [];
  for (const part of parts) {
    if (part.kind === "field") {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`,
          "utf8",
        ),
      );
      continue;
    }
    const name = part.name ?? "file";
    const filename = part.filename ?? "fabric.jpg";
    const contentType = part.contentType ?? "image/jpeg";
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
        "utf8",
      ),
    );
    chunks.push(part.buffer);
    chunks.push(Buffer.from("\r\n", "utf8"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("fit", () => {
  it("creates and lists measurements", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/fit/measurements",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { region: "IN", unit: "CM", points: { bust: 34, waist: 28, hip: 36 } },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as MeasurementProfile;
    expect(body.points.bust).toBe(34);
    const list = await app.inject({ method: "GET", url: "/fit/measurements", headers: { authorization: `Bearer ${accessToken}` } });
    expect(list.statusCode).toBe(200);
    expect((list.json() as MeasurementListResponse).measurements.length).toBe(1);
  });

  it("lists templates filtered by region", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const res = await app.inject({ method: "GET", url: "/fit/templates?region=IN", headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(200);
    const j = res.json() as TemplatesResponse;
    expect(j.templates.length).toBeGreaterThan(0);
    expect(j.templates.every((t) => t.region === "IN")).toBe(true);
    expect(j.templates.some((t) => t.garmentType === "BLOUSE")).toBe(true);
    expect(j.templates.some((t) => t.garmentType === "KURTI")).toBe(true);
  });

  it("lists non-IN region packs (US suit/hemming)", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const res = await app.inject({
      method: "GET",
      url: "/fit/templates?region=US",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const j = res.json() as TemplatesResponse;
    expect(j.templates.length).toBeGreaterThanOrEqual(1);
    expect(j.templates.every((t) => t.region === "US")).toBe(true);
    expect(j.templates.some((t) => t.garmentType === "SUIT")).toBe(true);
    expect(j.templates.some((t) => /hem/i.test(t.name))).toBe(true);

    const uk = await app.inject({
      method: "GET",
      url: "/fit/templates?region=UK",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(uk.statusCode).toBe(200);
    const ukBody = uk.json() as TemplatesResponse;
    expect(ukBody.templates.every((t) => t.region === "UK")).toBe(true);
    expect(ukBody.templates.length).toBeGreaterThanOrEqual(1);
  });

  it("creates tailoring order snapshots measurement", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const m = await app.inject({
      method: "POST",
      url: "/fit/measurements",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { points: { bust: 36, waist: 30 } },
    });
    const mId = (m.json() as MeasurementProfile).id;
    const templates = await app.inject({ method: "GET", url: "/fit/templates?region=IN", headers: { authorization: `Bearer ${accessToken}` } });
    const templateId = (templates.json() as TemplatesResponse).templates[0]!.id;
    const order = await app.inject({
      method: "POST",
      url: "/fit/orders",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { templateId, measurementProfileId: mId, selections: { neckline: "Boat", sleeve: "Short" }, fabricRef: "silk-red" },
    });
    expect(order.statusCode).toBe(201);
    const o = order.json() as TailoringOrder;
    expect(o.templateId).toBe(templateId);
    expect(o.measurementSnapshot).toBeTruthy();
    expect(o.state).toBe("PENDING");
    const get = await app.inject({ method: "GET", url: `/fit/orders/${o.id}`, headers: { authorization: `Bearer ${accessToken}` } });
    expect(get.statusCode).toBe(200);
    expect((get.json() as TailoringOrder).id).toBe(o.id);
  });

  it("reorders a past order cloning measurements into a new draft", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const m = await app.inject({
      method: "POST",
      url: "/fit/measurements",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { points: { bust: 36, waist: 30, hip: 38 } },
    });
    const mId = (m.json() as MeasurementProfile).id;
    const templates = await app.inject({
      method: "GET",
      url: "/fit/templates?region=IN",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const templateId = (templates.json() as TemplatesResponse).templates[0]!.id;
    const order = await app.inject({
      method: "POST",
      url: "/fit/orders",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        templateId,
        measurementProfileId: mId,
        selections: { neckline: "Boat", sleeve: "Short" },
        fabricRef: "silk-red",
      },
    });
    expect(order.statusCode).toBe(201);
    const source = order.json() as TailoringOrder;

    const reorder = await app.inject({
      method: "POST",
      url: `/fit/orders/${source.id}/reorder`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(reorder.statusCode).toBe(201);
    const draft = reorder.json() as TailoringOrder;
    expect(draft.id).not.toBe(source.id);
    expect(draft.state).toBe("PENDING");
    expect(draft.templateId).toBe(templateId);
    expect(draft.measurementProfileId).toBe(mId);
    expect(draft.selections).toEqual({ neckline: "Boat", sleeve: "Short" });
    expect(draft.fabricRef).toBe("silk-red");
    expect(draft.measurementSnapshot).toEqual({ bust: 36, waist: 30, hip: 38 });

    const list = await app.inject({
      method: "GET",
      url: "/fit/orders",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect((list.json() as { orders: TailoringOrder[] }).orders.length).toBe(2);
  });

  it("returns 404 when reordering unknown order", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/fit/orders/00000000-0000-4000-8000-000000000099/reorder",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns rich optionsSchema with neckline/sleeve/pattern previews", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const res = await app.inject({
      method: "GET",
      url: "/fit/templates?region=IN",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const blouse = (res.json() as TemplatesResponse).templates.find((t) => t.garmentType === "BLOUSE");
    expect(blouse).toBeTruthy();
    const neckline = blouse!.optionsSchema.neckline as {
      label: string;
      options: Array<{ value: string; imageKey: string; preview: string }>;
    };
    expect(neckline.label).toBe("Neckline");
    expect(neckline.options.length).toBeGreaterThan(1);
    expect(neckline.options[0]?.imageKey).toMatch(/^fit\/neckline\//);
    expect(neckline.options[0]?.preview).toMatch(/^preview:neckline:/);
  });

  it("assigns a tailor seller and accepts fabric photo keys + reviews", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const tailorsRes = await app.inject({
      method: "GET",
      url: "/fit/tailors",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(tailorsRes.statusCode).toBe(200);
    const tailors = (tailorsRes.json() as { tailors: Array<{ id: string }> }).tailors;
    expect(tailors.length).toBeGreaterThan(0);

    const templates = await app.inject({
      method: "GET",
      url: "/fit/templates?region=IN",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const templateId = (templates.json() as TemplatesResponse).templates[0]!.id;
    const order = await app.inject({
      method: "POST",
      url: "/fit/orders",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        templateId,
        selections: { neckline: "Boat" },
        fabricPhotoKeys: [`u/${userId}/fit-fabric/demo.jpg`],
      },
    });
    expect(order.statusCode).toBe(201);
    const o = order.json() as TailoringOrder;
    expect(o.tailorSellerId).toBeTruthy();
    expect(o.fabricPhotoKeys).toContain(`u/${userId}/fit-fabric/demo.jpg`);

    const attach = await app.inject({
      method: "POST",
      url: `/fit/orders/${o.id}/fabric`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { fabricPhotoKeys: [`u/${userId}/fit-fabric/extra.jpg`], fabricRef: "silk-navy" },
    });
    expect(attach.statusCode).toBe(200);
    expect((attach.json() as TailoringOrder).fabricPhotoKeys).toEqual(
      expect.arrayContaining([`u/${userId}/fit-fabric/demo.jpg`, `u/${userId}/fit-fabric/extra.jpg`]),
    );

    const review = await app.inject({
      method: "POST",
      url: `/fit/tailors/${o.tailorSellerId}/reviews`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { orderId: o.id, rating: 5, comment: "Beautiful work" },
    });
    expect(review.statusCode).toBe(201);
    const list = await app.inject({
      method: "GET",
      url: `/fit/tailors/${o.tailorSellerId}/reviews`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { reviews: unknown[]; ratingAvg: number | null };
    expect(body.reviews.length).toBe(1);
    expect(body.ratingAvg).toBe(5);
  });

  it("previews customization on avatar before order", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const templates = await app.inject({
      method: "GET",
      url: "/fit/templates?region=IN",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const templateId = (templates.json() as TemplatesResponse).templates[0]!.id;
    const preview = await app.inject({
      method: "POST",
      url: "/fit/preview",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { templateId, selections: { neckline: "Boat", sleeve: "Short" } },
    });
    expect(preview.statusCode).toBe(200);
    const body = preview.json() as {
      status: string;
      selections: Record<string, string>;
      summary: string;
      imageKey: string | null;
    };
    expect(["READY", "NO_AVATAR", "PROCESSING"]).toContain(body.status);
    expect(body.selections.neckline).toBe("Boat");
    expect(body.summary).toContain("neckline=Boat");
    expect(body.imageKey).toBeTruthy();
  });

  it("clones fabric photos on reorder", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const templates = await app.inject({
      method: "GET",
      url: "/fit/templates?region=IN",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const templateId = (templates.json() as TemplatesResponse).templates[0]!.id;
    const order = await app.inject({
      method: "POST",
      url: "/fit/orders",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        templateId,
        selections: { neckline: "V" },
        fabricPhotoKeys: [`u/${userId}/fit-fabric/clone-me.jpg`],
      },
    });
    const source = order.json() as TailoringOrder;
    const reorder = await app.inject({
      method: "POST",
      url: `/fit/orders/${source.id}/reorder`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(reorder.statusCode).toBe(201);
    const draft = reorder.json() as TailoringOrder;
    expect(draft.fabricPhotoKeys).toEqual([`u/${userId}/fit-fabric/clone-me.jpg`]);
    expect(draft.selections).toEqual({ neckline: "V" });
    expect(draft.tailorSellerId).toBeTruthy();
  });

  it("lists all templates when region omitted", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const res = await app.inject({
      method: "GET",
      url: "/fit/templates",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const j = res.json() as TemplatesResponse;
    expect(j.templates.length).toBeGreaterThan(1);
    const regions = new Set(j.templates.map((t) => t.region));
    expect(regions.size).toBeGreaterThan(1);
  });

  it("uploads fabric photo via multipart and rejects empty uploads", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const ok = buildMultipart([
      { kind: "field", name: "note", value: "silk" },
      { kind: "file", buffer: Buffer.from("fabric-bytes"), filename: "silk.jpg" },
    ]);
    const uploaded = await app.inject({
      method: "POST",
      url: "/fit/fabric",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": ok.contentType },
      payload: ok.payload,
    });
    expect(uploaded.statusCode).toBe(201);
    const body = uploaded.json() as { key: string; url: string | null };
    expect(body.key).toMatch(new RegExp(`^u/${userId}/fit-fabric/`));
    expect(body.url).toBeTruthy();

    const empty = buildMultipart([{ kind: "file", buffer: Buffer.alloc(0), filename: "empty.jpg" }]);
    const emptyRes = await app.inject({
      method: "POST",
      url: "/fit/fabric",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": empty.contentType },
      payload: empty.payload,
    });
    expect(emptyRes.statusCode).toBe(400);

    const fieldOnly = buildMultipart([{ kind: "field", name: "note", value: "no-file" }]);
    const fieldRes = await app.inject({
      method: "POST",
      url: "/fit/fabric",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": fieldOnly.contentType },
      payload: fieldOnly.payload,
    });
    expect(fieldRes.statusCode).toBe(400);
  });

  it("returns 404 for unknown tailor and review order", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const missingSeller = "00000000-0000-4000-8000-000000000011";
    const getMissing = await app.inject({
      method: "GET",
      url: `/fit/tailors/${missingSeller}/reviews`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(getMissing.statusCode).toBe(404);

    const retailer = await repos.registerSeller(userId, "Not A Tailor", "RETAILER");
    const getRetailer = await app.inject({
      method: "GET",
      url: `/fit/tailors/${retailer.id}/reviews`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(getRetailer.statusCode).toBe(404);

    const postRetailer = await app.inject({
      method: "POST",
      url: `/fit/tailors/${retailer.id}/reviews`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { rating: 4 },
    });
    expect(postRetailer.statusCode).toBe(404);

    const tailor = await repos.ensureDefaultTailorSeller("QA Tailor");
    const badOrder = await app.inject({
      method: "POST",
      url: `/fit/tailors/${tailor.id}/reviews`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { orderId: "00000000-0000-4000-8000-000000000022", rating: 3 },
    });
    expect(badOrder.statusCode).toBe(404);

    const noOrder = await app.inject({
      method: "POST",
      url: `/fit/tailors/${tailor.id}/reviews`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { rating: 4, comment: null },
    });
    expect(noOrder.statusCode).toBe(201);
  });

  it("previews READY with avatar, defaults, tryOn failure, and missing template", async () => {
    const { createMockRenderProvider } = await import("../lib/render/provider.js");
    const { createMemoryRepositories } = await import("../lib/repositories/memory.js");
    const { buildServer } = await import("../index.js");
    const base = createMockRenderProvider();
    let failTryOn = false;
    let omitBytes = false;
    const renderProvider = {
      ...base,
      async tryOn(input: { modelImageKey: string; garmentImageKey: string }) {
        if (failTryOn) throw new Error("render failed");
        const result = await base.tryOn(input);
        if (omitBytes) {
          const { imageBytes: _drop, ...rest } = result;
          return rest;
        }
        return result;
      },
    };
    const repos = createMemoryRepositories();
    const app = await buildServer({ logger: false, deps: { repos, renderProvider } });
    const { accessToken, userId } = await login(app);

    const templates = await app.inject({
      method: "GET",
      url: "/fit/templates?region=IN",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const templateId = (templates.json() as TemplatesResponse).templates[0]!.id;

    const missing = await app.inject({
      method: "POST",
      url: "/fit/preview",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { templateId: "00000000-0000-4000-8000-000000000033" },
    });
    expect(missing.statusCode).toBe(404);

    const noAvatar = await app.inject({
      method: "POST",
      url: "/fit/preview",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { templateId },
    });
    expect(noAvatar.statusCode).toBe(200);
    expect((noAvatar.json() as { status: string }).status).toBe("NO_AVATAR");

    await repos.upsertAvatar({
      userId,
      status: "READY",
      referenceImageKey: "references/fit-user.jpg",
      sourceUploadKeys: ["uploads/fit.jpg"],
      bodyMeta: { bust: 34 },
    });

    type PreviewBody = { status: string; previewUrl: string | null; imageKey: string | null; retryAfter?: string | null };
    /** Ask again (as the app does) until the in-process render job has finished. */
    const settle = async (selections: Record<string, string>) => {
      for (let i = 0; i < 100; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/fit/preview",
          headers: { authorization: `Bearer ${accessToken}` },
          payload: { templateId, selections },
        });
        const body = res.json() as PreviewBody;
        if (body.status !== "PROCESSING") return { res, body };
        expect(res.statusCode).toBe(202);
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error("preview still PROCESSING");
    };

    const queued = await app.inject({
      method: "POST",
      url: "/fit/preview",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { templateId, selections: { neckline: "Boat" } },
    });
    expect(queued.statusCode).toBe(202);
    const ready = await settle({ neckline: "Boat" });
    expect(ready.res.statusCode).toBe(200);
    expect(ready.body.status).toBe("READY");
    expect(ready.body.previewUrl).toBeTruthy();
    expect(ready.body.imageKey).toMatch(new RegExp(`^u/${userId}/fit-preview/`));

    // No bytes back from the provider is a failure, never a READY that points at nothing.
    omitBytes = true;
    const noBytes = await settle({ neckline: "V" });
    expect(noBytes.body.status).toBe("FAILED");

    // A provider error is stored FAILED with a retryAfter, not swapped for the avatar photo.
    failTryOn = true;
    const failed = await settle({ neckline: "Round" });
    expect(failed.res.statusCode).toBe(200);
    expect(failed.body.status).toBe("FAILED");
    expect(failed.body.previewUrl).toBeNull();
    expect(failed.body.imageKey).not.toBe("references/fit-user.jpg");
    expect(failed.body.retryAfter).toBeTruthy();

    // Empty optionsSchema → empty summary falls back to template name
    const tmpl = await repos.findCustomizationTemplate(templateId);
    expect(tmpl).toBeTruthy();
    tmpl!.optionsSchema = {};
    failTryOn = false;
    omitBytes = false;
    const emptyOpts = await app.inject({
      method: "POST",
      url: "/fit/preview",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { templateId, selections: {} },
    });
    expect([200, 202]).toContain(emptyOpts.statusCode);
    expect((emptyOpts.json() as { summary: string }).summary).toBe(tmpl!.name);

    await app.close();
  });

  it("returns 404s for missing order/template/measurement and fabric update race", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const getMissing = await app.inject({
      method: "GET",
      url: "/fit/orders/00000000-0000-4000-8000-000000000044",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(getMissing.statusCode).toBe(404);

    const badTemplate = await app.inject({
      method: "POST",
      url: "/fit/orders",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { templateId: "00000000-0000-4000-8000-000000000055", selections: {} },
    });
    expect(badTemplate.statusCode).toBe(404);

    const templates = await app.inject({
      method: "GET",
      url: "/fit/templates?region=IN",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const templateId = (templates.json() as TemplatesResponse).templates[0]!.id;

    const badMp = await app.inject({
      method: "POST",
      url: "/fit/orders",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        templateId,
        measurementProfileId: "00000000-0000-4000-8000-000000000066",
        selections: {},
      },
    });
    expect(badMp.statusCode).toBe(404);

    await repos.upsertAvatar({
      userId,
      status: "READY",
      referenceImageKey: "references/order-snap.jpg",
      sourceUploadKeys: [],
      bodyMeta: { waist: 28, note: "from-avatar" },
    });
    const withSnap = await app.inject({
      method: "POST",
      url: "/fit/orders",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { templateId, selections: { neckline: "Boat" } },
    });
    expect(withSnap.statusCode).toBe(201);
    expect((withSnap.json() as TailoringOrder).measurementSnapshot).toEqual({
      waist: 28,
      note: "from-avatar",
    });

    const attachMissing = await app.inject({
      method: "POST",
      url: "/fit/orders/00000000-0000-4000-8000-000000000077/fabric",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { fabricPhotoKeys: [`u/${userId}/fit-fabric/x.jpg`] },
    });
    expect(attachMissing.statusCode).toBe(404);

    const orderId = (withSnap.json() as TailoringOrder).id;
    const origUpdate = repos.updateTailoringOrderFabric.bind(repos);
    repos.updateTailoringOrderFabric = vi.fn(async () => null) as typeof repos.updateTailoringOrderFabric;
    const race = await app.inject({
      method: "POST",
      url: `/fit/orders/${orderId}/fabric`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { fabricPhotoKeys: [`u/${userId}/fit-fabric/race.jpg`] },
    });
    expect(race.statusCode).toBe(404);
    repos.updateTailoringOrderFabric = origUpdate;

    // null fabricPhotoKeys on record → toTailoringJson coalesces to []
    const stored = await repos.findTailoringOrder(orderId, userId);
    expect(stored).toBeTruthy();
    (stored as { fabricPhotoKeys: string[] | null }).fabricPhotoKeys = null;
    const getNullKeys = await app.inject({
      method: "GET",
      url: `/fit/orders/${orderId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(getNullKeys.statusCode).toBe(200);
    expect((getNullKeys.json() as TailoringOrder).fabricPhotoKeys).toEqual([]);
  });

  it("reorders from measurement profile when snapshot missing and rejects null template", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const m = await app.inject({
      method: "POST",
      url: "/fit/measurements",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { points: { bust: 38, hip: 40 } },
    });
    const mId = (m.json() as MeasurementProfile).id;
    const templates = await app.inject({
      method: "GET",
      url: "/fit/templates?region=IN",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const templateId = (templates.json() as TemplatesResponse).templates[0]!.id;
    const created = await app.inject({
      method: "POST",
      url: "/fit/orders",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { templateId, measurementProfileId: mId, selections: { sleeve: "Long" } },
    });
    const source = created.json() as TailoringOrder;
    const stored = await repos.findTailoringOrder(source.id, userId);
    expect(stored).toBeTruthy();
    stored!.measurementSnapshot = null;

    const reorder = await app.inject({
      method: "POST",
      url: `/fit/orders/${source.id}/reorder`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(reorder.statusCode).toBe(201);
    expect((reorder.json() as TailoringOrder).measurementSnapshot).toEqual({ bust: 38, hip: 40 });

    stored!.templateId = null;
    const noTemplate = await app.inject({
      method: "POST",
      url: `/fit/orders/${source.id}/reorder`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(noTemplate.statusCode).toBe(404);
    expect((noTemplate.json() as { message: string }).message).toMatch(/no template/i);
  });

  it("attaches fabric without fabricRef keeps existing ref", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const templates = await app.inject({
      method: "GET",
      url: "/fit/templates?region=IN",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const templateId = (templates.json() as TemplatesResponse).templates[0]!.id;
    const order = await app.inject({
      method: "POST",
      url: "/fit/orders",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        templateId,
        fabricRef: "keep-me",
        fabricPhotoKeys: [`u/${userId}/fit-fabric/a.jpg`],
      },
    });
    const id = (order.json() as TailoringOrder).id;
    const attach = await app.inject({
      method: "POST",
      url: `/fit/orders/${id}/fabric`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { fabricPhotoKeys: [`u/${userId}/fit-fabric/b.jpg`] },
    });
    expect(attach.statusCode).toBe(200);
    const body = attach.json() as TailoringOrder;
    expect(body.fabricRef).toBe("keep-me");
    expect(body.fabricPhotoKeys).toEqual(expect.arrayContaining([`u/${userId}/fit-fabric/a.jpg`, `u/${userId}/fit-fabric/b.jpg`]));
  });
});

import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../index.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import type { ListingRecord } from "../lib/repositories/types.js";
import { createMockStorage } from "../lib/storage/r2.js";

type App = Awaited<ReturnType<typeof buildServer>>;
type FeedBody = { items: Array<{ title: string; category: string }>; nextCursor: string | null };

// Titles from the scraped catalog, in catalog (sortOrder) order.
const CATALOG: Array<[title: string, category: string, status?: ListingRecord["status"]]> = [
  ["Red Draped Detail Mini Dress", "dresses"],
  ["Black Solid One Shoulder Top", "tops"],
  ["Yellow Floral A-Line Maxi Dress", "dresses"],
  ["Dark Grey Graphic Printed T-Shirt", "tops"],
  ["Blue High-Rise Bootcut Pants", "bottoms"],
  ["Spiderman Inspired Oversized Zipper Hoodie", "sweaters and sweatshirts"],
  ["Sage Ruched Bodycon Mini Dress", "dresses"],
  ["Beige Leopard Print Maxi Dress", "dresses"],
  ["Pink Floral Sweetheart Tie-Up Crop Top", "tops"],
  ["Blue Pleated Floral Midi Dress", "dresses", "DRAFT"],
];
const ACTIVE_TITLES = CATALOG.filter(([, , status]) => !status).map(([title]) => title);

// Casual vibe, neutrals, under ₹1,000, everyday casual, oversized.
const CASUAL_NEUTRAL_QUIZ = [
  { questionId: "vibe", optionId: "casual" },
  { questionId: "palette", optionId: "neutrals" },
  { questionId: "budget", optionId: "u1000" },
  { questionId: "occasion", optionId: "casual" },
  { questionId: "fit", optionId: "oversized" },
];
// Black and grey (neutral), graphic tee, hoodie (streetwear, oversized), beige (neutral).
const CASUAL_NEUTRAL_MATCHES = [
  "Black Solid One Shoulder Top",
  "Dark Grey Graphic Printed T-Shirt",
  "Spiderman Inspired Oversized Zipper Hoodie",
  "Beige Leopard Print Maxi Dress",
];
const CASUAL_NEUTRAL_ORDER = [
  ...CASUAL_NEUTRAL_MATCHES,
  ...ACTIVE_TITLES.filter((title) => !CASUAL_NEUTRAL_MATCHES.includes(title)),
];

async function buildApp() {
  const repos = createMemoryRepositories();
  await repos.seedListings(
    CATALOG.map(([title, category, status = "ACTIVE"], sortOrder) => ({
      id: randomUUID(),
      sellerId: null,
      title,
      category,
      tags: ["src:newme"],
      coinPrice: 500,
      realPrice: null,
      productImageKeys: [],
      houseModelRenderKey: `https://assets.example.com/${sortOrder}.webp`,
      affiliateUrl: null,
      affiliateLinks: null,
      status,
      sortOrder,
      createdAt: new Date(),
    })),
    [],
  );
  return buildServer({ logger: false, deps: { repos, storage: createMockStorage() } });
}

async function signIn(app: App, phone = "919812345678") {
  await app.inject({ method: "POST", url: "/auth/otp", payload: { phone } });
  const verify = await app.inject({
    method: "POST",
    url: "/auth/verify",
    payload: { phone, otp: "123456" },
  });
  return (verify.json() as { accessToken: string }).accessToken;
}

async function takeQuiz(app: App, token: string, answers: typeof CASUAL_NEUTRAL_QUIZ) {
  const res = await app.inject({
    method: "POST",
    url: "/style-quiz",
    headers: { authorization: `Bearer ${token}` },
    payload: { answers },
  });
  expect(res.statusCode).toBe(200);
}

/** Reads the feed to the end, returning titles in order and the cursors handed out. */
async function readFeed(app: App, query: string, authorization?: string) {
  const titles: string[] = [];
  const cursors: string[] = [];
  let cursor: string | null = null;
  do {
    const url: string = `/feed?${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await app.inject({
      method: "GET",
      url,
      headers: authorization ? { authorization } : {},
    });
    expect(res.statusCode, url).toBe(200);
    const body = res.json() as FeedBody;
    titles.push(...body.items.map((item) => item.title));
    cursor = body.nextCursor;
    if (cursor) cursors.push(cursor);
  } while (cursor && cursors.length < 50);
  return { titles, cursors };
}

describe("feed categories and style ranking", () => {
  let app: App;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("lists categories of active listings with counts, largest first", async () => {
    const res = await app.inject({ method: "GET", url: "/feed/categories" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      categories: [
        { category: "dresses", count: 4 },
        { category: "tops", count: 3 },
        { category: "bottoms", count: 1 },
        { category: "sweaters and sweatshirts", count: 1 },
      ],
    });
  });

  it("filters the whole catalog by category, not just the first page", async () => {
    const { titles } = await readFeed(app, "limit=1&category=dresses");
    expect(titles).toEqual([
      "Red Draped Detail Mini Dress",
      "Yellow Floral A-Line Maxi Dress",
      "Sage Ruched Bodycon Mini Dress",
      "Beige Leopard Print Maxi Dress",
    ]);

    const spaced = await readFeed(app, `limit=5&category=${encodeURIComponent("sweaters and sweatshirts")}`);
    expect(spaced.titles).toEqual(["Spiderman Inspired Oversized Zipper Hoodie"]);
    expect((await readFeed(app, "limit=5&category=Dresses")).titles).toEqual([]);

    const empty = await app.inject({ method: "GET", url: "/feed?category=" });
    expect(empty.statusCode).toBe(400);
  });

  it("keeps catalog order when signed out, or signed in without a style quiz", async () => {
    const anonymous = await readFeed(app, "limit=4");
    expect(anonymous.titles).toEqual(ACTIVE_TITLES);
    expect(anonymous.cursors.every((cursor) => /^\d+:[0-9a-f-]{36}$/.test(cursor))).toBe(true);

    const token = await signIn(app);
    expect((await readFeed(app, "limit=4", `Bearer ${token}`)).titles).toEqual(ACTIVE_TITLES);
  });

  it("shows listings matching the viewer's style quiz first, page after page", async () => {
    const token = await signIn(app);
    await takeQuiz(app, token, CASUAL_NEUTRAL_QUIZ);

    for (const limit of [1, 2, 3, 20]) {
      const { titles, cursors } = await readFeed(app, `limit=${limit}`, `Bearer ${token}`);
      expect(titles, `limit ${limit}`).toEqual(CASUAL_NEUTRAL_ORDER);
      expect(cursors.every((cursor) => /^[01]:\d+:[0-9a-f-]{36}$/.test(cursor))).toBe(true);
    }

    // Everyone else still gets the catalog order.
    expect((await readFeed(app, "limit=20")).titles).toEqual(ACTIVE_TITLES);

    // Retaking the quiz re-ranks on the next request.
    await takeQuiz(app, token, [{ questionId: "palette", optionId: "vivid" }]);
    const vivid = await readFeed(app, "limit=20", `Bearer ${token}`);
    expect(vivid.titles.slice(0, 2)).toEqual([
      "Red Draped Detail Mini Dress",
      "Yellow Floral A-Line Maxi Dress",
    ]);
  });

  it("ranks by style within the chosen category", async () => {
    const token = await signIn(app);
    await takeQuiz(app, token, CASUAL_NEUTRAL_QUIZ);
    const { titles } = await readFeed(app, "limit=2&category=dresses", `Bearer ${token}`);
    expect(titles).toEqual([
      "Beige Leopard Print Maxi Dress",
      "Red Draped Detail Mini Dress",
      "Yellow Floral A-Line Maxi Dress",
      "Sage Ruched Bodycon Mini Dress",
    ]);
  });

  it("treats a missing, malformed, tampered or expired token as signed out", async () => {
    const token = await signIn(app);
    await takeQuiz(app, token, CASUAL_NEUTRAL_QUIZ);
    const [header, , signature] = token.split(".");
    const otherToken = await signIn(app, "919800000001");
    const tampered = `${header}.${otherToken.split(".")[1]}.${signature}`;
    const user = (await app.deps.repos.findUserByPhone("919812345678"))!;
    const expired = await app.jwt.sign({
      sub: user.id,
      phone: "919812345678",
      exp: Math.floor(Date.now() / 1000) - 60,
    } as never);

    for (const bad of ["not-a-jwt", tampered, expired]) {
      // A protected route really does reject it...
      const quiz = await app.inject({
        method: "GET",
        url: "/style-quiz",
        headers: { authorization: `Bearer ${bad}` },
      });
      expect(quiz.statusCode).toBe(401);
      // ...while the feed serves it the anonymous catalog order.
      expect((await readFeed(app, "limit=3", `Bearer ${bad}`)).titles).toEqual(ACTIVE_TITLES);
    }
    expect((await readFeed(app, "limit=3", "Basic d29ybjp3b3Ju")).titles).toEqual(ACTIVE_TITLES);
  });

  it("carries on in catalog order from a cursor issued before signing in", async () => {
    const first = await app.inject({ method: "GET", url: "/feed?limit=3" });
    const { nextCursor } = first.json() as FeedBody;
    expect(nextCursor).toMatch(/^2:/);

    const token = await signIn(app);
    await takeQuiz(app, token, CASUAL_NEUTRAL_QUIZ);
    const rest = await app.inject({
      method: "GET",
      url: `/feed?limit=20&cursor=${encodeURIComponent(nextCursor!)}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect((rest.json() as FeedBody).items.map((item) => item.title)).toEqual(ACTIVE_TITLES.slice(3));
  });
});

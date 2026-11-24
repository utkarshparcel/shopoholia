import { randomInt } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, emiPlans, users } from "@worn/db";
import { createDbEmiAutofillRepos } from "./emi-autofill.js";
import { processIngestJob } from "./index.js";
import type { IngestPersister } from "./persistence.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

const noopPersister: IngestPersister = {
  insertPurchase: async () => "unused",
  markDocument: async () => undefined,
  updateSourceCursor: async () => undefined,
};

describePostgres("EMI-from-SMS autofill against Postgres", () => {
  const db = databaseUrl ? createDb(databaseUrl) : null!;
  afterAll(async () => {
    await db?.$client.end({ timeout: 5 });
  });

  it("an EMI-due SMS creates one ACTIVE emi_plans row, once", async () => {
    const [user] = await db
      .insert(users)
      .values({ phone: `9${randomInt(10 ** 10, 10 ** 11)}`, timeZone: "Asia/Kolkata" })
      .returning({ id: users.id });
    const userId = user!.id;
    const emiRepos = createDbEmiAutofillRepos(db);
    const sms = {
      messageId: "sms-1",
      from: "AD-SIMPL",
      to: "",
      subject: "SMS from AD-SIMPL",
      text: "Your Simpl EMI of Rs 1,500 is due on 2026-11-15 for Myntra purchase. Outstanding Rs 4,500.",
      receivedAt: "2026-11-03T10:00:00.000Z",
    };
    const first = await processIngestJob(sms, { persister: noopPersister, sourceKind: "SMS", userId, emiRepos });
    const again = await processIngestJob(sms, { persister: noopPersister, sourceKind: "SMS", userId, emiRepos });
    expect(first.emiAutofill?.created).toBe(true);
    expect(again.emiAutofill).toEqual({ planId: first.emiAutofill!.planId, created: false });
    const plans = await db.select().from(emiPlans).where(eq(emiPlans.userId, userId));
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      installmentMinor: 150_000,
      nextDueOn: "2026-11-15",
      dueDay: 15,
      status: "ACTIVE",
      currency: "INR",
    });
  });
});

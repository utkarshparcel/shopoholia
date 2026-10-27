import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  APPLE_ROOT_CA_G3_PEM,
  APPLE_ROOT_CA_G3_SHA256,
  AppleJwsError,
  appleEnvironment,
  appleRootCertificates,
  certificateExtensionOids,
  decodeAppStoreNotification,
  toAppleTransaction,
  verifyAppleJws,
} from "./apple.js";
import {
  TEST_BUNDLE_ID,
  appStoreNotification,
  appleTransaction,
  fixtureCert,
  signAppleJws,
  signXcodeJws,
  testAppleTrust,
} from "./test-support.js";

describe("Apple root certificate", () => {
  it("is Apple Root CA - G3, matching Apple's published SHA-256", () => {
    const [root] = appleRootCertificates();
    const der = Buffer.from(
      APPLE_ROOT_CA_G3_PEM.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""),
      "base64",
    );
    expect(createHash("sha256").update(der).digest("hex").toUpperCase()).toBe(APPLE_ROOT_CA_G3_SHA256);
    expect(APPLE_ROOT_CA_G3_SHA256).toBe("63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179");
    expect(root!.subject).toContain("CN=Apple Root CA - G3");
    expect(root!.ca).toBe(true);
  });
});

describe("verifyAppleJws", () => {
  it("accepts a transaction signed through leaf, intermediate and a trusted root", () => {
    const tx = appleTransaction();
    const { payload, xcode } = verifyAppleJws(signAppleJws(tx), testAppleTrust());
    expect(xcode).toBe(false);
    expect(payload.transactionId).toBe(tx.transactionId);
  });

  it("finds the marker OIDs on the test intermediate and leaf", () => {
    expect(certificateExtensionOids(fixtureCert("intermediate.pem"))).toContain("1.2.840.113635.100.6.2.1");
    expect(certificateExtensionOids(fixtureCert("leaf.pem"))).toContain("1.2.840.113635.100.6.11.1");
    expect(certificateExtensionOids(fixtureCert("leaf-no-oid.pem"))).not.toContain("1.2.840.113635.100.6.11.1");
  });

  it("rejects a chain that doesn't end at a trusted root", () => {
    // Production trust: only Apple's root, which didn't sign the test chain.
    expect(() =>
      verifyAppleJws(signAppleJws(appleTransaction()), { roots: appleRootCertificates() }),
    ).toThrow(/trusted root/);
  });

  it("rejects an expired leaf, a leaf without Apple's marker, and short chains", () => {
    const trust = testAppleTrust();
    const tx = appleTransaction();
    expect(() =>
      verifyAppleJws(signAppleJws(tx, { chain: ["leaf-expired.pem", "intermediate.pem", "root.pem"] }), trust),
    ).toThrow(/not valid when signed/);
    expect(() =>
      verifyAppleJws(signAppleJws(tx, { chain: ["leaf-no-oid.pem", "intermediate.pem", "root.pem"] }), trust),
    ).toThrow(/marker/);
    expect(() => verifyAppleJws(signAppleJws(tx, { chain: ["leaf.pem", "root.pem"] }), trust)).toThrow(
      /leaf, intermediate and root/,
    );
    // The intermediate in the root's place: not a trusted root.
    expect(() =>
      verifyAppleJws(signAppleJws(tx, { chain: ["leaf.pem", "intermediate.pem", "intermediate.pem"] }), trust),
    ).toThrow(AppleJwsError);
  });

  it("rejects a tampered payload, a foreign signature, another alg and junk", () => {
    const trust = testAppleTrust();
    const jws = signAppleJws(appleTransaction({ productId: "worn.coins.100" }));
    const [header, , signature] = jws.split(".");
    const forged = Buffer.from(JSON.stringify(appleTransaction({ productId: "worn.coins.1500" }))).toString(
      "base64url",
    );
    expect(() => verifyAppleJws(`${header}.${forged}.${signature}`, trust)).toThrow(/signature is invalid/);
    // Signed by a key that isn't the leaf's.
    expect(() => verifyAppleJws(signAppleJws(appleTransaction(), { key: "xcode-key.pem" }), trust)).toThrow(
      /signature is invalid/,
    );
    expect(() => verifyAppleJws(signAppleJws(appleTransaction(), { alg: "HS256" }), trust)).toThrow(/ES256/);
    expect(() => verifyAppleJws("a.b", trust)).toThrow(/compact JWS/);
    expect(() => verifyAppleJws("!!.!!.!!", trust)).toThrow(AppleJwsError);
  });

  it("rejects a signedDate in the future", () => {
    expect(() =>
      verifyAppleJws(signAppleJws(appleTransaction({ signedDate: Date.now() + 3_600_000 })), testAppleTrust()),
    ).toThrow(/future/);
  });

  it("checks validity at signedDate, so an old transaction stays verifiable", () => {
    const signedDate = Date.UTC(2020, 6, 1);
    const old = signAppleJws(appleTransaction({ signedDate }), {
      chain: ["leaf-expired.pem", "intermediate.pem", "root.pem"],
    });
    expect(verifyAppleJws(old, testAppleTrust()).payload.signedDate).toBe(signedDate);
  });

  it("accepts the Xcode certificate only when it's configured", () => {
    const jws = signXcodeJws(appleTransaction());
    expect(() => verifyAppleJws(jws, testAppleTrust())).toThrow(AppleJwsError);
    expect(verifyAppleJws(jws, testAppleTrust({ xcode: true })).xcode).toBe(true);
  });
});

describe("appleEnvironment", () => {
  it("accepts Production always, Sandbox outside production, Xcode only from the Xcode cert", () => {
    expect(appleEnvironment("Production", false, true)).toBe("production");
    expect(appleEnvironment("Sandbox", false, true)).toBeNull();
    expect(appleEnvironment("Sandbox", false, false)).toBe("sandbox");
    expect(appleEnvironment("Xcode", false, false)).toBeNull();
    expect(appleEnvironment("Xcode", true, false)).toBe("xcode");
    expect(appleEnvironment("Xcode", true, true)).toBeNull();
    expect(appleEnvironment("Production", true, false)).toBeNull();
  });
});

describe("toAppleTransaction", () => {
  it("lowercases appAccountToken and requires the core fields", () => {
    const tx = toAppleTransaction(appleTransaction({ appAccountToken: "3F2504E0-4F89-41D3-9A0C-0305E82C3301" }));
    expect(tx.appAccountToken).toBe("3f2504e0-4f89-41d3-9a0c-0305e82c3301");
    expect(() => toAppleTransaction({ transactionId: "1" })).toThrow(/required fields/);
  });
});

describe("decodeAppStoreNotification", () => {
  const opts = { bundleId: TEST_BUNDLE_ID, production: false, trust: testAppleTrust() };

  it("verifies the notification and the transaction and renewal info inside it", () => {
    const tx = appleTransaction({ type: "Auto-Renewable Subscription", productId: "worn.closet.premium.monthly" });
    const decoded = decodeAppStoreNotification(
      appStoreNotification({
        notificationType: "DID_FAIL_TO_RENEW",
        subtype: "GRACE_PERIOD",
        notificationUUID: "n-1",
        transaction: tx,
        renewal: { originalTransactionId: tx.originalTransactionId, gracePeriodExpiresDate: 1_900_000_000_000 },
      }),
      opts,
    );
    expect(decoded).toMatchObject({
      notificationType: "DID_FAIL_TO_RENEW",
      subtype: "GRACE_PERIOD",
      notificationUUID: "n-1",
      environment: "sandbox",
      transaction: { transactionId: tx.transactionId },
      renewal: { gracePeriodExpiresDate: 1_900_000_000_000 },
    });
  });

  it("ignores another app and Sandbox in production; rejects bad signatures", () => {
    const body = { notificationType: "TEST", notificationUUID: "n-2" };
    expect(decodeAppStoreNotification(appStoreNotification({ ...body, bundleId: "com.other.app" }), opts)).toBeNull();
    expect(decodeAppStoreNotification(appStoreNotification(body), { ...opts, production: true })).toBeNull();
    const signed = appStoreNotification(body);
    expect(() => decodeAppStoreNotification(`${signed.slice(0, -4)}AAAA`, opts)).toThrow(AppleJwsError);
  });
});

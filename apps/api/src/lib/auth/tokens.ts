import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ONBOARDING_COIN_GRANT } from "@worn/shared";
import type { Repositories } from "../repositories/types.js";
import type { OtpService } from "./otp.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60_000;

export async function issueTokens(
  app: FastifyInstance,
  repos: Repositories,
  userId: string,
  phone: string,
) {
  const accessToken = await app.jwt.sign({ sub: userId, phone }, { expiresIn: "15m" });
  const refreshToken = randomUUID();
  await repos.saveRefreshToken({
    token: refreshToken,
    userId,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { accessToken, refreshToken };
}

export async function verifyAndLogin(
  app: FastifyInstance,
  repos: Repositories,
  otp: OtpService,
  phone: string,
  code: string,
) {
  const valid = await otp.verifyOtp(phone, code);
  if (!valid) return null;

  const { user, isNew } = await repos.createUser(phone);
  let coinBalance = await repos.getCoinBalance(user.id);

  if (isNew) {
    const grant = await repos.grantCoins({
      userId: user.id,
      delta: ONBOARDING_COIN_GRANT,
      type: "GRANT",
      refType: "onboarding",
    });
    coinBalance = grant.balanceAfter;
  }

  const tokens = await issueTokens(app, repos, user.id, phone);
  return { ...tokens, isNewUser: isNew, coinBalance };
}

export async function refreshAccessToken(
  app: FastifyInstance,
  repos: Repositories,
  refreshToken: string,
) {
  const record = await repos.findRefreshToken(refreshToken);
  if (!record) return null;

  const user = await repos.findUserById(record.userId);
  if (!user) return null;

  await repos.deleteRefreshToken(refreshToken);
  return issueTokens(app, repos, user.id, user.phone);
}

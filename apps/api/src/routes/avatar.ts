import { randomUUID } from "node:crypto";
import {
  AvatarResponseSchema,
  AvatarUploadResponseSchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { newJobId } from "../lib/jobs/avatar-processing.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const avatarRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/avatar",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["avatar"],
        consumes: ["multipart/form-data"],
        response: {
          202: AvatarUploadResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const parts = request.files();
      const uploadKeys: string[] = [];

      for await (const part of parts) {
        if (part.type !== "file") continue;
        const buffer = await part.toBuffer();
        if (buffer.length === 0) continue;

        const key = `uploads/${userId}/${randomUUID()}.jpg`;
        await app.deps.storage.put({
          key,
          body: buffer,
          contentType: part.mimetype || "image/jpeg",
        });
        uploadKeys.push(key);
      }

      if (uploadKeys.length === 0) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "At least one image file is required",
        });
      }

      const avatarId = randomUUID();
      const jobId = newJobId();

      await app.deps.repos.upsertAvatar({
        id: avatarId,
        userId,
        referenceImageKey: null,
        sourceUploadKeys: uploadKeys,
        bodyMeta: {},
        status: "PROCESSING",
      });
      await app.deps.repos.updateUser(userId, { avatarStatus: "PROCESSING" });

      await app.deps.jobQueue.enqueueAvatarProcessing({
        jobId,
        userId,
        avatarId,
        uploadKeys: [...uploadKeys],
      });

      return reply.code(202).send({ status: "PROCESSING" as const, jobId });
    },
  );

  app.get(
    "/avatar",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["avatar"],
        response: {
          200: AvatarResponseSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const user = await app.deps.repos.findUserById(userId);
      const avatar = await app.deps.repos.findAvatarByUserId(userId);

      let referencePreviewUrl: string | null = null;
      if (avatar?.referenceImageKey && avatar.status === "READY") {
        referencePreviewUrl = await app.deps.storage.getSignedUrl(avatar.referenceImageKey);
      }

      return {
        status: user?.avatarStatus ?? avatar?.status ?? "NONE",
        referencePreviewUrl,
      };
    },
  );

  app.delete(
    "/avatar",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["avatar"],
        response: {
          204: z.null(),
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const avatar = await app.deps.repos.findAvatarByUserId(userId);

      if (avatar?.referenceImageKey) {
        await app.deps.storage.delete(avatar.referenceImageKey);
      }
      if (avatar?.sourceUploadKeys.length) {
        await app.deps.storage.deleteMany(avatar.sourceUploadKeys);
      }

      await app.deps.repos.deleteAvatarByUserId(userId);
      return reply.code(204).send(null);
    },
  );
};

import {
  STYLE_QUIZ_QUESTIONS,
  StyleQuizQuestionsResponseSchema,
  StyleQuizSubmitBodySchema,
  StyleQuizSubmitResponseSchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const styleQuizRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/style-quiz",
    {
      schema: {
        tags: ["style-quiz"],
        response: { 200: StyleQuizQuestionsResponseSchema, 401: ErrorSchema },
      },
      preHandler: requireAuth,
    },
    async () => {
      return { questions: STYLE_QUIZ_QUESTIONS };
    },
  );

  app.post(
    "/style-quiz",
    {
      schema: {
        tags: ["style-quiz"],
        body: StyleQuizSubmitBodySchema,
        response: { 200: StyleQuizSubmitResponseSchema, 400: ErrorSchema, 401: ErrorSchema },
      },
      preHandler: requireAuth,
    },
    async (request) => {
      const answerMap = new Map<string, string>();
      for (const a of request.body.answers) {
        answerMap.set(a.questionId, a.optionId);
      }
      const tags = new Set<string>();
      for (const question of STYLE_QUIZ_QUESTIONS) {
        const optionId = answerMap.get(question.id);
        const option = question.options.find((o) => o.id === optionId);
        if (option?.tags) {
          for (const tag of option.tags) tags.add(tag);
        }
      }
      const profileTags = Array.from(tags);
      const answers: Record<string, string> = {};
      for (const [k, v] of answerMap) answers[k] = v;

      await app.deps.repos.saveStyleProfile(request.user.sub, {
        tags: profileTags,
        answers,
      });

      return { saved: true as const, profileTags };
    },
  );
};

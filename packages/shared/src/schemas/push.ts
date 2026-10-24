import { z } from "zod";

/** What getExpoPushTokenAsync returns: `ExponentPushToken[…]`, or the newer `ExpoPushToken[…]`. */
export const EXPO_PUSH_TOKEN_PATTERN = /^Expo(?:nent)?PushToken\[[^[\]\s]+\]$/;

export const ExpoPushTokenSchema = z
  .string()
  .max(256)
  .regex(EXPO_PUSH_TOKEN_PATTERN, "Expected an Expo push token like ExponentPushToken[...]");

export const RegisterPushTokenBodySchema = z.object({
  token: ExpoPushTokenSchema,
});

/**
 * The body is optional (Fastify hands a missing body over as null). With `token`, the saved
 * token is only cleared while it is still that one, so signing out on one device doesn't
 * unregister a device the user signed in on since.
 */
export const ClearPushTokenBodySchema = z
  .object({
    token: ExpoPushTokenSchema.optional(),
  })
  .nullish();

export const PushTokenStatusResponseSchema = z.object({
  registered: z.boolean(),
});

export type RegisterPushTokenBody = z.infer<typeof RegisterPushTokenBodySchema>;
export type ClearPushTokenBody = z.infer<typeof ClearPushTokenBodySchema>;
export type PushTokenStatusResponse = z.infer<typeof PushTokenStatusResponseSchema>;

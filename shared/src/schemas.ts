import { z } from "zod";
import { TOTAL_CELLS } from "./constants.js";

/** Display names: 2–24 visible characters, letters/numbers/spaces and a few symbols. */
export const displayNameSchema = z
  .string({ required_error: "Display name is required" })
  .trim()
  .min(2, "Use at least 2 characters")
  .max(24, "Use at most 24 characters")
  .regex(/^[\p{L}\p{N} _.'-]+$/u, "Letters, numbers, spaces and _ . ' - only");

export const createSessionBodySchema = z
  .object({
    displayName: displayNameSchema,
  })
  .strict();

/** Cell id as it arrives in a URL param: a base-10 integer string in range. */
export const cellIdParamSchema = z
  .string()
  .regex(/^\d{1,4}$/, "Cell id must be a whole number")
  .transform((v) => Number(v))
  .refine((n) => n >= 0 && n < TOTAL_CELLS, `Cell id must be between 0 and ${TOTAL_CELLS - 1}`);

export const leaderboardQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(10),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .strict();

export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

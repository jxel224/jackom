import { z } from 'zod';
import { isValidDisplayName, isValidRoomCodeFormat, normalizeDisplayNameInput, normalizeRoomCodeInput } from '../shared.js';

/**
 * Request validation for the HTTP API. Coarse `z.string().max(...)` bounds reject absurdly large
 * payloads before any normalization runs; the real business rule (post-trim length, character
 * class) is the SAME shared validator (`packages/shared-types`) the frontend uses, via `.refine()`
 * — one rule, checked on both sides, never two competing definitions.
 */

export const CreateRoomRequestSchema = z.object({}).strict();

export const JoinRoomRequestSchema = z
  .object({
    displayName: z
      .string()
      .min(1)
      .max(200)
      .transform(normalizeDisplayNameInput)
      .refine(isValidDisplayName, { message: 'invalid display name' }),
    requestId: z.string().min(1).max(128).optional(),
  })
  .strict();

/** Not part of a JSON body — validates the `:roomCode` URL path segment the same way `RoomCodeInput` does. */
export const RoomCodeParamSchema = z
  .string()
  .transform(normalizeRoomCodeInput)
  .refine(isValidRoomCodeFormat, { message: 'invalid room code format' });

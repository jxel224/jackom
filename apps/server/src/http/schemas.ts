import { z } from 'zod';
import { isValidDisplayName, isValidRoomCodeFormat, normalizeDisplayNameInput, normalizeRoomCodeInput } from '../shared.js';

/**
 * Request validation for the HTTP API. Coarse `z.string().max(...)` bounds reject absurdly large
 * payloads before any normalization runs; the real business rule (post-trim length, character
 * class) is the SAME shared validator (`packages/shared-types`) the frontend uses, via `.refine()`
 * — one rule, checked on both sides, never two competing definitions.
 */

export const CreateRoomRequestSchema = z
  .object({
    gameSlug: z.string().min(1).max(64),
  })
  .strict();

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

// ---- Permanent Business Backend: auth request bodies -------------------------------------------
// Coarse shape/bounds only, same discipline as above — the real business rules (email normalization,
// password strength, duplicate-email/credential checks) live in db/services/auth-service.ts, the
// one place that actually knows about the database.

const EmailSchema = z.string().min(3).max(254).email();
/** A floor, not a full policy — real strength scoring is a separate, later concern this phase doesn't own. */
const PasswordSchema = z.string().min(8).max(200);
const DisplayNameSchema = z
  .string()
  .min(1)
  .max(200)
  .transform(normalizeDisplayNameInput)
  .refine(isValidDisplayName, { message: 'invalid display name' });

export const RegisterRequestSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
    displayName: DisplayNameSchema,
  })
  .strict();

export const LoginRequestSchema = z
  .object({
    email: EmailSchema,
    password: z.string().min(1).max(200),
  })
  .strict();

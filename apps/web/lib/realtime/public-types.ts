export type { TvView, PlayerView, PrivatePlayerPayload } from '../shared';

/** A sanitized, UI-safe error shape — never a raw thrown `Error`/exception or a server-internal message. */
export interface DisplayError {
  code: string;
  message: string;
}

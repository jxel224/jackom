# Permanent Business Backend Foundation Report

Scope: PostgreSQL + Prisma + User accounts + Authentication + Sessions + Game ownership + Host
authorization for room creation. Gameplay itself was frozen for this phase (see
`FINAL_GAMEPLAY_CLOSURE_REPORT.md`) and was not redesigned. Stripe/payments, final visual design,
and Match History are explicitly out of scope and were not built.

## 1. Verdict

**YES — the permanent business backend is ready.** Every item in the Definition of Done (§15) is
true today, verified by real-Postgres integration tests, the full existing test suite (820/820),
clean typecheck, clean production build, and a real-browser Playwright end-to-end run covering
both the host and guest paths plus two negative-authorization cases.

## 2. Architecture — PostgreSQL vs Redis responsibilities

Two data layers, two lifetimes, deliberately never merged:

| | PostgreSQL (via Prisma) | Redis (existing, unchanged) |
|---|---|---|
| Holds | `User`, `Game`, `GameOwnership`, `Session` (login) | `RoomState`, `RoomPrivateState`, `HostSessionRecord`/`PlayerSessionRecord` (per-room reconnect tokens) |
| Identity | **User** — permanent account, owns games, logs in | **Player** — temporary realtime match participant, no account |
| Lifetime | Survives forever (until deleted) | Room TTL / match end |
| Written by | `AuthService`, `OwnershipService`, dev-grant script | `RoomActor`/FSM, gateway, HTTP room routes |
| Never contains | Realtime match state (roles, hacks, timers, answers, votes) | Emails, password hashes, permanent ownership records |

The only bridge between the two layers is a single value: `hostUserId` (nullable string) stored on
the live Redis `RoomState.host`, written once at room-creation time from the authenticated User's
id and never read back from Postgres afterward. `RoomActor`/the FSM never import Prisma, never
query Postgres during a gameplay transition, and never receive a User object — only that one opaque
id string, purely for future auditing/display. This was a deliberate design constraint from the
spec ("do NOT couple RoomActor to Prisma") and is verified by `room-authorization-and-boundary.test.ts`'s
9-step boundary scenario (§8 below).

## 3. Prisma Schema

`apps/server/prisma/schema.prisma`, generator `prisma-client` (Prisma 7, output to
`apps/server/src/generated/prisma/`, gitignored), datasource `postgresql`. Four models:

- **User** — `id` (uuid), `email` (`@unique`, stored lowercased/trimmed by `auth-service.ts` before
  it ever reaches the DB), `passwordHash`, `displayName`, `createdAt`, `updatedAt`. Relations:
  `ownerships GameOwnership[]`, `sessions Session[]`.
- **Game** — `id`, `slug` (`@unique`), `name`, `isActive` (default `true`), `createdAt`,
  `updatedAt`. Relation: `ownerships GameOwnership[]`. Seeded today: `hackers` only — the model is
  platform-level (not hardcoded to one game) because the roadmap has more, but only HACKERS is
  built.
- **GameOwnership** — `id`, `userId`, `gameId`, `grantedAt` (default `now()`), `source` (nullable,
  free-form provenance string, e.g. `"dev-grant"`). `user`/`game` relations with
  `onDelete: Cascade`. **`@@unique([userId, gameId])`** — the "cannot own the same game twice"
  invariant enforced at the database level, not just in application code. `@@index([userId])`.
- **Session** (login session, NOT the pre-existing Redis gameplay session of the same generic
  name) — `id`, `tokenHash` (`@unique`, HMAC of the raw bearer token — the raw token is never
  stored), `userId`, `expiresAt`, `createdAt`. `user` relation with `onDelete: Cascade`.
  `@@index([userId])`.

All four tables use `@@map(...)` to plural snake_case table names (`users`, `games`,
`game_ownerships`, `auth_sessions`) independent of the Prisma model names.

## 4. Authentication — exact implementation

- **Register** (`POST /api/auth/register`, `RegisterRequestSchema`: email, password ≥8 chars,
  displayName validated by the existing shared `isValidDisplayName`) — normalizes email
  (trim+lowercase), hashes the password with `bcryptjs` (`bcryptRounds`: 10 in production, 4 in
  test helpers, injectable so hundreds of test assertions stay fast without weakening the
  production path), creates the `User` row, then immediately creates and returns an authenticated
  session (register auto-logs-in, matching the UX flow "Register → land on `/games`").
- **Login** (`POST /api/auth/login`) — looks up by normalized email; if not found, still runs
  `bcrypt.compare` against a hardcoded dummy bcrypt hash so response timing doesn't leak account
  existence; wrong password and unknown account both throw the **identical**
  `ApiErrors.invalidCredentials()` (same HTTP 401, same code, same message) — no account-enumeration
  signal via either the response body or timing.
- **Logout** (`POST /api/auth/logout`) — deletes the `Session` row for the current raw token
  (`deleteByTokenHash`) and clears the cookie (`Max-Age=0`).
- **Current user** (`GET /api/auth/me`) — `authService.requireSession(cookie)` then returns
  `toSafeUser(user)`: `{id, email, displayName}` only — `passwordHash` is never present on the
  returned object (stripped at the service layer, not filtered ad hoc at the route).
- **Password security** — never stored/logged/returned in plaintext; only the bcrypt hash persists.
  Verified by grep: no `console.log`/logger call anywhere in `apps/server/src` references
  `password`, `token`, or `cookie` values, and no request body is ever logged or stringified.

## 5. Session Model — how auth persists

Database-backed sessions (`Session` / `auth_sessions`), deliberately distinct from the pre-existing
Redis-backed `HostSessionRecord`/`PlayerSessionRecord` used for realtime gameplay reconnect —
different table, different repository (`AuthSessionRepository`), different name
(`AuthSessionRepository`/`requireSession`) chosen specifically to avoid any naming collision or
accidental conflation between "logged-in User session" and "in-match Player/host reconnect token."

- Raw token: `crypto.randomBytes(32).toString('hex')` (256 bits of entropy), generated at
  register/login time.
- Only an HMAC-SHA256 hash of the raw token (keyed by `SESSION_TOKEN_SECRET`) is ever persisted in
  `Session.tokenHash` — a stolen database row alone cannot forge a valid session, since the raw
  token half only ever exists in the HttpOnly cookie and the single request that carries it.
- Delivered via cookie: `jackom_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` only when
  `SESSION_COOKIE_SECURE=true` (env-configured; `false` in dev, intended `true` in production over
  HTTPS). Never stored in `localStorage`, never sent in a URL or a gameplay WebSocket payload.
- Expiration: `SESSION_TTL_SECONDS` (default 30 days), checked server-side on every lookup
  (`findValidByTokenHash` filters `expiresAt > now`); an expired or unknown token is treated
  identically to "not authenticated."
- **Frontend/API origin reality**: the Next.js frontend (`localhost:3000`) and the HTTP API
  (`localhost:4000`) are different *origins* but the same *site* (both `localhost`), so
  `SameSite=Lax` cookies are sent on the cross-port `fetch` as long as the request sets
  `credentials: 'include'` (now the default in `apps/web/lib/api/client.ts`'s `apiRequest`) and the
  server reflects a matching `Access-Control-Allow-Origin` + `Access-Control-Allow-Credentials:
  true` for an exact-allowlisted origin (never a wildcard). This generalizes to a real deployment
  where the frontend and API are typically subdomains of the same registrable domain.

## 6. Ownership — how checked

`OwnershipService.requireOwnedActiveGame(userId, gameSlug)` in
`apps/server/src/db/services/ownership-service.ts`, checked in this exact order (each failure a
distinct, typed `ApiError`):

1. Game exists (`gameRepo.findBySlug`) → else `ApiErrors.gameNotFound()` (404)
2. Game `isActive` → else `ApiErrors.gameNotActive()` (409)
3. `ownershipRepo.isOwned(userId, game.id)` → else `ApiErrors.gameNotOwned()` (403)

This is a plain domain-service method, not logic embedded in a UI component or scattered across
routes — the single call site is `handleCreateRoom` in `http-api-server.ts`.
`OwnershipService.listOwnedGames(userId)` powers the owned-games endpoint (§8). A third method,
`grantOwnership(userId, gameSlug, source?)`, exists on the same service but is **never** wired to
any HTTP route — its only callers are the seed script's sibling dev-grant CLI and test helpers
(§9).

## 7. Room Authorization — exact create-room flow

`POST /api/rooms` (`handleCreateRoom`), in order:

1. Per-IP rate limit check (pre-existing, unchanged).
2. Parse + `safeParse` the body against `CreateRoomRequestSchema` (`{gameSlug: string}`, now
   required — was an empty object before this phase) → 400 `INVALID_REQUEST` on failure.
3. Parse the `Cookie` header; `authService.requireSession(cookie)` → 401 `UNAUTHENTICATED` if
   missing/invalid/expired session. **No Redis room is created before this point.**
4. `ownershipService.requireOwnedActiveGame(user.id, gameSlug)` → 404/409/403 as in §6. **Still no
   Redis room created.**
5. Only after both checks pass: `roomActorManager.createRoom(config, user.id)` — the existing
   Redis-backed room-creation path, unchanged except for the added `hostUserId` parameter which is
   stored on `RoomState.host.hostUserId` and nowhere else.

A rejected request never touches Redis — proven directly by
`create-room.test.ts`'s `vi.spyOn(manager, 'createRoom')` assertion that the underlying method is
never invoked on any of the rejection paths (unauthenticated, invalid cookie, non-owner,
game-not-found, inactive-game, missing-`gameSlug`).

## 8. Guest Players — proof they remain account-free

`POST /api/rooms/:code/players` (join) was **not modified** by this phase beyond what was already
true — no authentication middleware was added to it, no cookie is required, no User lookup occurs
anywhere on the join path. Proof, not assertion:

- `room-authorization-and-boundary.test.ts`: "guest without account CAN join an authorized existing
  room" — an explicit regression test calling the real join endpoint with zero auth state.
- The PART 14 nine-step Redis/Postgres boundary scenario, run against real Postgres + real Redis:
  (1) create a `User` in Postgres, (2) grant `hackers` ownership, (3) authenticate, (4) create a
  room (the one Postgres-touching step), (5) confirm the room exists in Redis, (6) confirm a
  temporary Player joins via the ordinary account-free join flow, (7) confirm the Player's role and
  live match state are **not** persisted anywhere in Postgres (only `hostUserId`, a bare string, is
  present on the Redis room — no Player record of any kind exists in Postgres), (8) end/expire the
  room, (9) confirm the `User` and `GameOwnership` rows are still present and untouched in Postgres.
- Real-browser E2E (`e2e/scenario-business-flow.mjs`): 4 guests joined a real authorized room and
  every guest page's body text was asserted to never contain login/password-related text at any
  point in the flow.

## 9. Database Migrations

One applied migration: `apps/server/prisma/migrations/20260819141100_init/` (created via
`prisma migrate dev --name init` against the real dev database), containing the four tables above.
`npm run db:migrate` (`prisma migrate dev`) is the normal dev workflow entrypoint; `npm run
db:migrate:deploy` (`prisma migrate deploy`) is the non-interactive apply-only path for CI/prod;
`npm run db:migrate:test` (`scripts/migrate-test-db.mjs`) applies the same migration set to the
separate `jackom_test` database. Verified: a fresh `jackom_test` database was migrated by this
exact script and immediately exercised by the real-Postgres integration test suite — no manual SQL
edits were made at any point.

## 10. Development Setup

`docker-compose.dev.yml` now runs two services:

- `redis` (unchanged) — `npm run dev:redis` / `npm run dev:redis:stop`.
- `postgres` (new) — `postgres:16-alpine`, port `${POSTGRES_PORT:-5432}`, credentials from
  `${POSTGRES_USER:-jackom}` / `${POSTGRES_PASSWORD:-jackom_dev_only}` /
  `${POSTGRES_DB:-jackom_dev}`, a `pg_isready` healthcheck, a persistent named volume
  (`jackom-dev-postgres-data`), and `docker/postgres-init/01-create-test-database.sh` mounted to
  run once on first container startup, creating the separate `jackom_test` database alongside
  `jackom_dev`.
- `apps/server/.env.example` documents every new variable (`DATABASE_URL`, `TEST_DATABASE_URL`,
  `SESSION_TOKEN_SECRET`, `SESSION_COOKIE_SECURE`) with safe placeholder values — no real secret is
  committed anywhere; `apps/server/.env` (gitignored, unchanged status) holds the actual local dev
  values.

Full local setup: `docker compose -f docker-compose.dev.yml up -d redis postgres` → `npm run
db:migrate:deploy` (or `db:migrate` for a fresh schema change) → `npm run db:seed` → `npm run dev`
(existing full local runner from the prior 7C phase, unchanged).

## 11. Test Database — isolation strategy

A dedicated `jackom_test` Postgres database (separate from `jackom_dev`), created by the Docker
init script. Isolation between tests: `apps/server/test/db/test-db.ts`'s `resetTestDatabase(prisma)`
runs a `TRUNCATE ... CASCADE` across all four tables (in FK-safe order) in an `afterEach` hook, so
no test depends on another test's rows — the simplest robust option of the three suggested
(rollback / truncate / per-suite schema), chosen because the schema is small and TRUNCATE is cheap
at this scale.

A real, reproduced isolation bug was found and fixed during this phase: Vitest's default
file-level parallelism ran the `test/db/**` files in separate worker processes against the *same*
physical `jackom_test` database, so one file's `TRUNCATE` raced another file's in-flight
`INSERT`s, producing a real `Foreign key constraint violated` failure. Fixed with the documented
`fileParallelism: false` Vitest option (in `vitest.config.ts`, with an explanatory comment) — this
serializes the whole suite (≈44s instead of ≈8s for `vitest run`) but is correctness-required given
tests share one real database; not a concern for the normal interactive dev loop.

## 12. Tests — exact results

```text
npm test                              # 82 test files, 820 tests — all passed
npm run typecheck                     # shared-types + server + web — zero errors
npm run build:web                     # production build succeeds, 11 routes generated
```

New real-Postgres integration test files (all exercised against the actual `jackom_test`
database, not mocks):

- `apps/server/test/db/users-and-auth.test.ts` — 13 tests: user creation, unique/normalized email,
  timestamps, password never plaintext, safe-user shape; register (valid/duplicate), login
  (correct/wrong password/unknown account), session creation, authenticated/unauthenticated `/me`,
  logout invalidation, expired/invalid session rejection.
- `apps/server/test/db/games-and-ownership.test.ts` — 9 tests: HACKERS seeded, unique slug,
  inactive game cannot be hosted, ownership grant/lookup, duplicate grant blocked at the DB
  constraint, one User owning multiple Games, multiple Users owning the same Game.
- `apps/server/test/db/room-authorization-and-boundary.test.ts` — 10 tests (real Postgres + real
  Redis + a real `HttpApiServer`, `describe.skipIf`-guarded if either is unreachable): the full
  room-creation authorization matrix (owner→ALLOW, non-owner→REJECT, unauthenticated→REJECT,
  inactive-game→REJECT, and confirmation that a rejected attempt never creates Redis state), the
  guest-join regression test, the PART 14 nine-step boundary scenario, and restart-survival checks.

Every pre-existing gameplay/HTTP/gateway/frontend test file continues to pass unmodified in
behavior — the only changes to existing test files were mechanical call-site updates
(`createRoom({gameSlug})` instead of zero-arg, an added auth cookie) required by the new required
parameter, never a change to gameplay assertions themselves.

## 13. E2E — register/login/ownership/create-room/guest-join

`e2e/scenario-business-flow.mjs` (real Chromium via Playwright, isolated browser contexts), full
run passed:

1. Register a fresh host → auto-authenticated, lands on `/games`.
2. Confirmed: before any ownership grant, no functional "أنشئ غرفة" button exists on `/games` for
   HACKERS (screenshot: `business-flow-games-not-owned.png`).
3. Grant `hackers` ownership via the real sanctioned dev script (`npm run db:grant-ownership`, run
   as a subprocess — not a shortcut invented for the test).
4. Create the room from `/games` → real authorized `POST /api/rooms` call → TV opens at a real room
   code (screenshot: `business-flow-tv-lobby.png`).
5. Four separate unauthenticated browser contexts join as guests via `/join` → room code → name;
   confirmed zero login/password text ever appeared for any guest.
6. Host starts the match; all four guests' role reveals read correctly; the match reaches
   `MINIGAME_SELECT` normally (screenshot: `business-flow-role-reveal.png`) — proving gameplay is
   unaffected by an authorized host's room creation.
7. **Negative case**: register a second, separate User who owns nothing. Confirmed no functional
   create-room button appears in their UI (screenshot: `business-flow-not-owned-ui.png`). Then, via
   a **direct HTTP `fetch`** issued from inside that authenticated browser context (bypassing all
   UI), confirmed the server rejects with `403 GAME_NOT_OWNED`.
8. **Negative case**: an entirely unauthenticated direct HTTP `fetch` to `POST /api/rooms` is
   rejected with `401 UNAUTHENTICATED`.

## 14. Security — findings and mitigations

Reviewed against the exact PART 20 checklist:

| Item | Finding |
|---|---|
| Plaintext passwords | Never stored/returned — only a bcrypt hash persists; `toSafeUser` strips `passwordHash` before any response. |
| Password/token/cookie logging | Grepped `apps/server/src` for any logger call referencing password/token/cookie values or raw request bodies — none found. |
| Prisma errors leaking | Fixed during this phase (see below) — `prisma-errors.ts` maps P2002/connection errors to typed `ApiError`s; `handleError`'s catch-all returns a generic Arabic 500 message for anything unrecognized, never the raw error. |
| Session token in URLs | Never — cookie-only delivery, by design; no route accepts a token as a query/path parameter. |
| Auth stored insecurely client-side | `HttpOnly` cookie only; no token in `localStorage`/`sessionStorage`; the pre-existing gameplay host-session token (a separate concept) still travels in body payloads as before, unrelated to login auth. |
| CORS/cookie settings | Exact-origin allowlist (`allowedOrigins`, never a wildcard), `Access-Control-Allow-Credentials: true` and `Vary: Origin` set only when the request's `Origin` is on the allowlist; cookie is `SameSite=Lax` (correct for the same-site, cross-port dev topology) with `Secure` gated on `SESSION_COOKIE_SECURE`. |
| Ownership bypass | Checked server-side only, before any Redis room is created; verified by both the unit-level spy proof (§7) and the E2E direct-HTTP negative case (§13). |
| Direct room endpoint bypass | Verified via E2E direct `fetch` calls (bypassing all UI) for both the non-owner and unauthenticated cases — both correctly rejected. |
| Inactive-game bypass | Covered by `games-and-ownership.test.ts` and `room-authorization-and-boundary.test.ts`. |
| Guest join accidentally auth-gated | Explicitly regression-tested (§8) — no auth middleware was added to the join route. |
| ID enumeration | Login returns the identical error/status for "unknown account" and "wrong password," with a dummy-hash comparison to avoid a timing signal. |
| SQL injection | All Postgres access goes through Prisma's parameterized query builder; the only raw SQL anywhere is the fixed-string `TRUNCATE`/`SELECT 1` in test/infra helpers, never built from user input. |

One real bug was found and fixed during development, not merely during this closing review: the
initial `isUniqueConstraintViolation` check looked for Prisma's classic `meta.target` shape, which
never matched under the `@prisma/adapter-pg` driver adapter this project uses — a real duplicate
email registration would have leaked a raw, unmapped `PrismaClientKnownRequestError` straight to
the HTTP client as an uncaught 500. Found by a real integration test against real Postgres (not a
mock), root-caused with a throwaway debug script that printed the actual error shape
(`meta.driverAdapterError.cause.constraint.fields`), and fixed by checking both shapes. Re-run of
the previously-failing tests confirmed the fix.

Known accepted low-priority item: `e2e/business-flow-lib.mjs`'s `grantOwnershipViaDevScript` uses
`execFileSync('npm', [...], {shell:true})`, which Node flags with a `DEP0190` deprecation warning
since args aren't shell-escaped under `shell:true`. Not a real injection risk here — the arguments
are program-controlled test data (a freshly-generated test email, a hardcoded game slug), never
user input — and this script only ever runs in a local/test/dev context, never in a production
request path. Left as-is; noted for future cleanup.

## 15. Remaining Business Backend Gaps

Honest list — explicitly not gameplay or visual-design gaps, all deliberately out of scope for this
phase per the closure spec:

- **Payments** — no Stripe/checkout/subscriptions/refunds/invoices. `GameOwnership.source` exists
  specifically so a future Stripe webhook can call the same `grantOwnership` used by the dev script
  today, without any ownership-model change.
- **Password reset / email verification** — no "forgot password" flow, no email-confirmation step.
  Registration is immediate and unverified.
- **Account management** — no change-password, change-email, change-displayName, or
  delete-account endpoints. `/account` shows real identity/logout only; profile-settings and
  purchase-history sections remain honest "قريبًا" (coming soon) placeholders.
- **Match history** — not modeled; deliberately avoided per the spec ("do NOT implement Match
  History yet... avoid speculative schema").
- **Multi-game catalog** — only HACKERS is seeded; the schema supports more games but the other
  three roadmap games are not built.
- **Rate limiting on auth endpoints specifically** — `/api/auth/register` and `/api/auth/login`
  share the same generic per-IP rate limiter as the rest of the HTTP API; no dedicated
  brute-force/credential-stuffing protection (e.g. per-account lockout) exists yet.
- **`SESSION_TOKEN_SECRET` rotation** — no key-rotation mechanism; a secret change invalidates all
  existing sessions (log-everyone-out), which is acceptable but unautomated.

---

## Definition of Done — checklist

- [x] PostgreSQL runs locally (Docker Compose `postgres` service, healthcheck, persistent volume)
- [x] Prisma schema/migration works from a clean DB (`20260819141100_init`, applied to both `jackom_dev` and `jackom_test`)
- [x] HACKERS Game exists (seeded, idempotent `upsert`)
- [x] User can register
- [x] User can login
- [x] Session is secure (HttpOnly, SameSite=Lax, hashed token, server-verified, TTL-bound)
- [x] User can logout
- [x] `/me` works (authenticated → safe fields; unauthenticated → 401)
- [x] Ownership exists and is checked server-side
- [x] Duplicate ownership impossible (DB-level `@@unique([userId, gameId])`)
- [x] Non-owner cannot create a HACKERS room (403, no Redis room created)
- [x] Anonymous User cannot create a HACKERS room (401, no Redis room created)
- [x] Owner can create a HACKERS room (real E2E pass)
- [x] Guest players can still join without accounts (regression-tested + E2E-confirmed)
- [x] PostgreSQL/Redis boundaries remain clean (no Prisma in RoomActor/FSM; 9-step boundary test)
- [x] Real PostgreSQL integration tests pass (32 tests across 3 files)
- [x] Redis tests still pass (unchanged, pre-existing suite)
- [x] Business E2E passes (`scenario-business-flow.mjs`, full run, both positive and negative cases)
- [x] Existing gameplay tests still pass (820/820 total, no gameplay assertion changed)
- [x] Typecheck passes (shared-types + server + web)
- [x] Build passes (`build:web`, 11 routes)

**All items true.**

---

**JACKOM PERMANENT BUSINESS BACKEND FOUNDATION CLOSED.**

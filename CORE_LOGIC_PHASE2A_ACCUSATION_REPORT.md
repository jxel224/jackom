# Core Logic Phase 2A — Final Accusation System ("Push the Button") Report

Scope: implement the missing Crew final-accusation business logic on top of the already-hardened
Core Logic Phase 1/1.1 foundation. Server/business-logic only — no visual design, no RANK_IT, no
Bomb Protocol redesign, no `/quiz` changes.

---

## 1. Previous Behaviour

Before this phase, there was no accusation/"push the button" mechanic of any kind. The only
existing voting-related code was a completely different, older feature: a per-cycle **elimination
vote** (`GameState.VOTING` → `ELIMINATION_RESULT`, `RoomState.currentVote`, `player:submitVote`,
`config.rules.tieBreakRule`). That mechanic has every player vote FOR one other player to
eliminate (or skip), tallies via `apps/server/src/voting/tally.ts` with tie-break rules
(`no_elimination`/`random`/`revote`), and checks a win condition afterward via
`apps/server/src/fsm/win-condition.ts` — explicitly commented `"Placeholder ratio pending real
balancing"`. It fires automatically every `roundsPerCycle` rounds via `FINAL_DISCUSSION`, not on
player initiative.

This was audited before writing any new code (Part 41/42 of the task spec). Conclusion: **reusable
patterns, not reusable code, and definitely not the same feature.** The old mechanic's private
vote storage (`currentPhaseSubmissions`-backed dedup), phase validation, and duplicate-vote
protection patterns directly informed the new accusation system's design, but the two remain
**separate, coexisting mechanics** — see §13 (Legacy Configuration) for why the old one was left
completely untouched rather than merged or removed.

---

## 2. Final Rule

- **Who**: any eligible player (same population as `getEligibleVoters()`) may push the button, from
  `DISCUSSION` or `MINIGAME_SELECT` only. Crew and Hackers are both allowed, indistinguishably —
  the server never exposes the initiator's role anywhere.
- **Suspect count**: exactly `RoomState.hackerCount` — a field set once at role assignment and
  public from that moment (identities are never public; only the count is).
- **Selection**: only the initiator submits, during `ACCUSATION_SELECT`, within
  `accusationSelectionTimeoutMs` (default 20s) or the accusation is cancelled with no penalty
  beyond the match time that elapsed.
- **Voting**: every eligible player (frozen snapshot at vote start) votes APPROVE/REJECT during
  `ACCUSATION_VOTE`, one vote each, within `accusationVotingTimeoutMs` (default 20s). Strict
  majority (`APPROVE > total/2`) approves; a tie always rejects.
- **Resolution**: approved + exact Hacker set → **Crew wins**. Approved + anything else (missing a
  Hacker, an extra Crew player, or a same-count wrong set) → **Hackers win**. Rejected → nobody is
  eliminated, no roles revealed, a cooldown (`accusationCooldownMs`, default 20s) starts, and play
  returns to gameplay.
- **Match clock**: never paused for any part of this — reaching zero during either accusation phase
  ends the match as a Hacker win exactly like it would during any other unpaused phase.

Full authoritative rule text: `GAMEPLAY_RULES_V1.md` §12 (new section this phase) and the
accusation-specific bullet added to §11 (private view contracts).

---

## 3. FSM Changes

**Before:** `GameState` had 20 values; `handleEvent()`'s per-state switch had no accusation-related
cases; `player:pushButton`/`player:submitAccusation`/`player:submitAccusationVote` did not exist.

**After:**
- Two new `GameState` values: `ACCUSATION_SELECT`, `ACCUSATION_VOTE` — deliberately distinct from
  the pre-existing `VOTING` (see §1/§13).
- `transitions.ts`'s `transition()` was refactored (behavior-preserving for every existing call
  site) into `setPhase()` (the raw phase-mutation half) + `transition() = setPhase() +
  autoAdvance()`. This exists for exactly one new caller: returning to `MINIGAME_SELECT` after a
  rejected/cancelled accusation that started FROM `MINIGAME_SELECT` must NOT re-run
  `autoAdvance()`'s `assignNextAdmin()` — the interrupted Admin turn has to resume untouched, not
  get reassigned.
- New handlers: `handlePushButton` (centralized, intercepted once in `handleEvent()` right after
  the `isStalePhase` check, before the per-state switch — not scattered per state handler),
  `handleAccusationSelect`, `handleAccusationVote`, plus the private helpers
  `resolveAccusationVote`, `maybeResolveAccusationVote`, `returnToGameplayAfterAccusation`.
- `performRoleAssignment` now also sets `room.hackerCount`.
- `resetMatchScopedState` (rematch) now also resets `hackerCount`, `currentAccusation`,
  `accusationCooldownUntil`, `accusationHistory`.
- The cross-cutting `matchClock:expired` handler (unchanged in every other respect) now also nulls
  `currentAccusation` and logs an `accusation_abandoned_by_clock` matchLog entry when one was active.
- New shared policy constant: `apps/server/src/rules/accusation.ts`'s
  `ACCUSATION_ALLOWED_STATES` — imported by both the FSM handler and the player-view builder's
  advisory `canPushButton` flag, so "which states allow pushing the button" lives in exactly one
  place.

**State diagram** (as implemented):

```
MINIGAME_SELECT --push--> ACCUSATION_SELECT --lock--> ACCUSATION_VOTE --reject--> MINIGAME_SELECT (same Admin, unconsumed turn)
DISCUSSION      --push--> ACCUSATION_SELECT                                  \--approve+correct--> FINAL_RESULTS (crew)
                                     \--selection timeout--> MINIGAME_SELECT   \--approve+incorrect--> FINAL_RESULTS (hackers)
                                          (same-origin return rule applies)
ACCUSATION_SELECT / ACCUSATION_VOTE --matchClock:expired--> FINAL_RESULTS (hackers), accusation abandoned
```

A rejected/cancelled accusation always lands on `MINIGAME_SELECT`, but the path there differs by
where it started (§8 below) — this is the one piece of behavior not visible in the diagram above.

---

## 4. State Model

**Public (shared-types, `packages/shared-types/src/`):**
- `enums.ts`: `AccusationVoteChoice = 'APPROVE' | 'REJECT'`; two new `GameState` values.
- `config.ts`: `TimerConfig` += `accusationSelectionTimeoutMs`, `accusationVotingTimeoutMs`;
  `MatchRulesConfig` += `accusationCooldownMs`.
- `round-state.ts`: new `CurrentAccusationState` — `{initiatorId, requiredSuspectCount, suspectIds
  (null until locked), eligibleVoterIds (frozen at vote start), votes, originState: 'DISCUSSION' |
  'MINIGAME_SELECT', startedAt}`.
- `history.ts`: new `AccusationRecord` — `{initiatorId, suspectIds, votes, approved, correct
  (null unless approved), startedAt, endedAt}`.
- `events.ts`: `PlayerPushButtonEvent`, `PlayerSubmitAccusationEvent`,
  `PlayerSubmitAccusationVoteEvent`; `RejectionCode` += `ACCUSATION_ON_COOLDOWN`, `NOT_INITIATOR`,
  `INVALID_SUSPECTS`.
- `views.ts`: `AccusationPublicView` (TV-safe: `initiatorId`, `requiredSuspectCount`, `suspectIds`,
  `votedCount`, `totalEligible` — never individual votes); `PlayerAccusationInfo` extends it with
  `isInitiator`, `eligibleSuspectIds` (initiator-only, selection-phase-only), `hasVoted`
  (own status only). `TvView`/`PlayerView` += `hackerCount`, `accusation`,
  `accusationCooldownUntil`; `PlayerView` += `canPushButton` (advisory only — the server
  re-validates every rule authoritatively regardless of what this flag says).

**Server-internal (`apps/server/src/types/room-state.ts`):** `RoomState` += `hackerCount`,
`currentAccusation`, `accusationCooldownUntil`, `accusationHistory`. Mirrored in
`persistence/schemas.ts` (Zod) exactly, including the new `CurrentAccusationStateSchema`/
`AccusationRecordSchema`.

---

## 5. Voting Threshold

**Formula:** `approved = totalEligible > 0 && approveCount > totalEligible / 2` — a strict integer
majority; a tie (`approveCount === totalEligible / 2` for an even total) always evaluates false
(rejected), never approved. `totalEligible` is the frozen `eligibleVoterIds.length`, never
recalculated live.

**Verified thresholds** (`accusation.test.ts`, one test per row, using real vote submissions
against a real driven room — not a unit test of the formula in isolation):

| Players | Approve | Result |
|---|---|---|
| 4 | 2 (of 4) | rejected (tie) |
| 4 | 3 | approved |
| 5 | 3 | approved |
| 6 | 3 (of 6) | rejected (tie) |
| 6 | 4 | approved |
| 10 | 5 (of 10) | rejected (tie) |
| 10 | 6 | approved |

Missing votes on a vote-timeout are proven to never count toward approval (a separate test: 1 of 4
approves, the rest never vote, timer fires → rejected, `winner` stays null).

---

## 6. Win Resolution

The approved-suspect-set-vs-real-Hacker-set comparison happens in exactly one place
(`resolveAccusationVote`), reading `priv.players[...].role` — **never** sent to any client. Three
outcomes, each with a dedicated test using a real, seed-derived Hacker/Crew composition (never
hardcoded ids, via `hackerIdsOf()`/`crewIdsOf()`):

| Approved suspect set | Outcome |
|---|---|
| Exactly the real Hacker set (order-independent) | **Crew wins** |
| Correct count, but missing a real Hacker (extra Crew player instead) | **Hackers win** |
| Correct count, one real Hacker swapped for one Crew player | **Hackers win** |

Both outcomes stop the match clock and transition straight to `FINAL_RESULTS`; the
`AccusationRecord` pushed to `accusationHistory` records `approved`/`correct` for both cases (and
`correct: null` for a rejected vote, which never reaches the comparison at all).

**Note on role reveal:** the codebase has no existing "reveal roles at FINAL_RESULTS" view field
anywhere — `TvView`/`PlayerView` structurally have no field capable of holding a `role` at all, by
the same design guarantee that already protects the Hacker system. Per the task's explicit
instruction ("if existing final-result infrastructure already supports role reveal, preserve it" —
none exists), this phase did not invent one. A test (`roles are never exposed in any view before
an accusation resolves`) confirms no role leak at any point up to and including a resolved
accusation; a client currently has no way to learn who the Hackers actually were after the match
ends, which is a pre-existing display gap, not something this phase introduced or was asked to fix.

---

## 7. Timer Interaction

- **Phase timers**: `ACCUSATION_SELECT` uses `accusationSelectionTimeoutMs`, `ACCUSATION_VOTE` uses
  `accusationVotingTimeoutMs` — both wired into `durations.ts`'s existing `durationFor()` switch,
  scheduled/expired through the same `PhaseTimerService` every other timed phase already uses. No
  new timer infrastructure was added.
- **Match clock**: explicitly never paused, at any point, by any accusation-related code path —
  verified directly (`matchClock.status` stays `'running'` through push → lock → vote → resolve).
  If `MatchClockService` fires `matchClock:expired` while either accusation phase is active, the
  existing cross-cutting handler in `handleEvent()` (now also nulling `currentAccusation`) ends the
  match as a Hacker win exactly as it already does for any other phase, and any subsequent
  accusation message is rejected via the normal stale-phase/wrong-state path — no accusation-
  specific bypass exists that could let a late message slip through after the match already ended.

---

## 8. Admin Interaction

A rejected or selection-timeout-cancelled accusation always returns to `MINIGAME_SELECT`, but the
Admin-rotation behavior differs by where the accusation began (`CurrentAccusationState.originState`,
set once when the button is pushed and never recomputed):

- **Began at `MINIGAME_SELECT`**: the interrupted Admin turn resumes exactly as it was — same
  `adminId`, unchanged `adminQueue`, no auto-selected minigame. Implemented via the new `setPhase()`
  helper called directly (bypassing `autoAdvance()`'s `assignNextAdmin()` entirely) rather than
  `transition()`. Verified by a test that pushes from `MINIGAME_SELECT`, rejects the vote, and
  confirms `adminId`/`adminQueue` are byte-identical to before, AND that the same Admin can still
  act normally afterward.
- **Began at `DISCUSSION`**: the round was already fully resolved before the accusation started, so
  play proceeds normally into the next round's `MINIGAME_SELECT`, fresh Admin rotation included —
  exactly as `DISCUSSION`'s own timer/host-advance would have done, just delayed by the detour.
  Verified by a separate test confirming a real (non-null, valid-participant) Admin assignment
  happens, without asserting it must differ from the previous Admin (a genuine repeat across the
  cycle boundary is not itself a bug).
- **Approved (either outcome)**: transitions straight to `FINAL_RESULTS`; Admin state becomes
  irrelevant there, and a test confirms `buildTvView` doesn't crash reading it.

This distinction was the one non-obvious design call this phase had to resolve on its own — the
spec's plain-English "return to MINIGAME_SELECT" phrasing reads the same for both origins, but §28
("preserve the SAME Admin, do not consume turn, do not reshuffle") and §29 ("proceed... rather than
recreate partially elapsed discussion time") only make sense together under this reading. Recorded
here explicitly rather than left implicit, per the task's own instruction to surface non-obvious
judgment calls.

---

## 9. Firewall Interaction

Confirmed by omission and by test: no accusation-related code path anywhere touches
`room.firewallActive`. Two dedicated tests: (1) an accusation never sets `firewallActive` to `true`
regardless of outcome; (2) a Firewall already pending (white-box set to `true` before the
accusation, since driving a real Bomb Protocol round to a deterministic `SUCCESS` state would add
unrelated complexity to a test whose actual subject is the accusation path's effect on this flag)
survives a full push → lock → reject cycle completely untouched.

---

## 10. Security

Every rule is enforced server-side, never merely by omitting client UI:

- **Identity**: `playerId` is never trusted from any accusation event payload — the gateway injects
  it from the authenticated socket exactly like every other player-prefixed event (no
  accusation-specific gateway code was needed; the existing generic `{type, ...payload, playerId:
  meta.playerId!}` construction already covers the three new event types).
- **State/phase gating**: centralized in `ACCUSATION_ALLOWED_STATES` (§3); a crafted `pushButton`
  from any other state (a minigame, the hack window, the special game, an already-active
  accusation, post-match) is rejected `INVALID_EVENT_FOR_STATE`, tested for each case individually.
- **Non-initiator submitting suspects**: rejected `NOT_INITIATOR`, tested with a crafted payload
  from a real second player, not just structurally implied.
- **Suspect validation**: wrong count, duplicate ids, and unknown/non-existent ids are each
  rejected `INVALID_SUSPECTS` with their own dedicated test.
- **Vote replay/duplicate**: rejected `DUPLICATE_ACTION` via the same `currentPhaseSubmissions`
  mechanism already proven correct elsewhere in this codebase; a replayed identical vote is also
  proven to never double-count in the tally.
- **Stale phaseId**: a `submitAccusation`/`submitAccusationVote` carrying a phaseId from before a
  timeout already resolved/cancelled the phase is rejected `STALE_PHASE` — tested explicitly with a
  captured stale phaseId, not merely assumed from the generic `isStalePhase()` mechanism.
- **Voter-snapshot manipulation**: a dedicated test sets `eliminatedPlayerPolicy.canVote: false`
  and then simulates a snapshotted voter becoming `alive: false` mid-vote (white-box), confirming
  their vote is still accepted — proving the eligible-voter list is genuinely frozen at vote start,
  not live-recalculated on every submission.
- **Cooldown**: enforced server-side (`ACCUSATION_ON_COOLDOWN`), persisted on `RoomState`, survives
  disconnect/reconnect (tested).
- **Non-existent playerId**: rejected `NOT_ELIGIBLE_VOTER` (a fabricated id can never appear in
  `getEligibleVoters()`).

---

## 11. Reconnect / Rehydration

**Reconnect** (pure-FSM level, `accusation.test.ts`): initiator disconnect-then-reconnect before
the selection timeout preserves ownership (never transfers) and allows a normal submission
afterward. A voter who reconnects before voting can still vote; a voter who votes, then
disconnects, then reconnects cannot vote again and their original choice is unchanged. The
cooldown deadline survives a disconnect/reconnect cycle unchanged.

**Rehydration** (actor + real repository level, two dedicated tests using the same
`RoomActor`/`RoomActorManager`/`buildRepos()` pattern established in Core Logic Phase 1.1's
`hack-secrecy-integration.test.ts` and `room-actor-manager.test.ts` — not bare `handleEvent()`):
1. A room evicted mid-`ACCUSATION_SELECT` (via `evictIdle(0)`, the real idle-sweep path) reloads
   with `currentAccusation` — initiator, `requiredSuspectCount` — fully intact, and the initiator
   can immediately continue by submitting a real suspect set through the reloaded actor.
2. A room evicted mid-`ACCUSATION_VOTE` reloads with already-cast votes, the frozen
   `eligibleVoterIds` snapshot, AND `currentPhaseSubmissions` all intact — proven by confirming a
   duplicate vote after reload is still rejected `DUPLICATE_ACTION`, not silently re-accepted.

No new persistence system was introduced — `currentAccusation`/`accusationCooldownUntil`/
`accusationHistory` are ordinary `RoomState` fields, validated by the same Zod schema layer, saved
and loaded through the same repository classes every other field already uses.

---

## 12. Tests

One new file, `apps/server/test/accusation.test.ts` — **53 tests**, all new regression coverage
(there was no prior accusation-related test file to update). Classification by the task's own
scheme:

| Group | Count | Classification | Why |
|---|---|---|---|
| Availability | 8 | New regression coverage | No accusation availability policy existed before. |
| Suspect selection | 9 | New regression coverage | — |
| Voting (incl. 7 threshold cases) | 11 | New regression coverage | Includes every explicit threshold example from the spec, each as its own test, not a single parameterized "trust me" case. |
| Resolution | 4 | New regression coverage | — |
| Concurrency | 2 | New regression coverage | — |
| Match timer interaction | 3 | New regression coverage | — |
| Admin interaction | 3 | New regression coverage | Covers the non-obvious origin-dependent return behavior from §8 explicitly. |
| Firewall interaction | 2 | New regression coverage | — |
| Reconnect | 3 | New regression coverage | — |
| Crafted/adversarial actions | 4 | New regression coverage | — |
| Actor/persistence rehydration | 2 | New regression coverage | Real `RoomActor`, not bare `handleEvent()`, per the established Phase 1.1 pattern. |

**Pre-existing files touched, all mechanically, for the same reason** — a new required config
field (`MatchRulesConfig.accusationCooldownMs`) was added, so every test fixture that constructs a
full `RoomConfig.rules`/`MatchRulesConfig` object literal needed the new field added to keep
typechecking: `admin-selection.test.ts` (2 sites), `match-clock.test.ts` (1 site). Classification:
**test fixture hardened (mechanical)** — no behavioral assertion changed.

**Web-side, same reason, one level up the stack** — `TvView`/`PlayerView` gained new required
fields (`hackerCount`, `accusation`, `accusationCooldownUntil`, `canPushButton`), so every
TypeScript-typed or Zod-validated fixture needed them added:
`create-room-button.test.tsx`, `gameplay-foundation.test.tsx`, `join-room-form.test.tsx`,
`lib/realtime/realtime-hooks.test.tsx`. Classification: **test fixture hardened (mechanical)**. The
`realtime-hooks.test.tsx` failures specifically surfaced a real Zod v4 behavior (declared-but-
unset `z.unknown()` object keys are non-optional by default in v4, unlike v3) — worth noting since
it means every future new `z.unknown()` wire field will require the same fixture updates, not a bug
in this phase's code.

**False-positive review** (Part 40): no `if (...) return` early-exit pattern was used anywhere in
`accusation.test.ts`. Every scenario requiring specific role composition uses
`hackerIdsOf()`/`crewIdsOf()` read from the actually-assigned (seed-derived, but never silently
skipped) roles, never a hardcoded assumption. **One test was caught and rewritten during self-review**:
an initial version of the "pending Firewall survives a rejected accusation" test drove a real Bomb
Protocol round and force-ended it, assuming the result would be a success that sets
`firewallActive`. Checking `bomb-protocol.ts`'s `resolve()` (`success: state.status === 'SUCCESS'`)
showed a force-ended, never-played round is deterministically a *failure*, meaning the test's
"survives while true" branch would never actually execute — exactly the coverage-gap-disguised-as-
conditional pattern the task warned against. Rewritten to set `firewallActive: true` directly
(white-box) before the accusation, since the test's actual subject is the accusation path's
non-effect on that flag, not how a Firewall is legitimately earned (already covered elsewhere).

**Mutation sanity check** (not part of the required suite, done as self-verification): temporarily
reverted the Admin-preserving `setPhase()` call back to a plain `transition()` call and confirmed
exactly the two tests that should catch it — "selection timeout cancels..." and "rejected
accusation... SAME Admin..." — failed, while everything else stayed green. Reverted immediately
after confirming.

---

## 13. Remaining Risks

1. **Whether the old per-cycle elimination vote should be retired is a genuine open product
   question, left open.** `win-condition.ts` is explicitly commented as a placeholder pending real
   balancing, and the new accusation system is now the "real," high-stakes win path. This phase
   deliberately did not touch, disable, or merge the two — removing a working, tested mechanic was
   judged out of scope ("do not perform broad risky cleanup unrelated to the accusation flow") and
   not requested. Both mechanics are fully functional and can currently both end a match
   independently; whether that's the intended long-term design is a founder-level call, not an
   engineering one.
2. **No role-reveal-at-FINAL_RESULTS view field exists anywhere in the codebase** (§6) — a
   pre-existing gap this phase did not introduce or fix, since no existing infrastructure to
   preserve was found. A client currently cannot show "here's who the Hackers actually were" after
   any match ends, accusation-triggered or otherwise.
3. **Zero frontend UI for the accusation system** — by design/scope for this phase (server/business
   logic only). The generic `GameplayFallback` panel renders for both new phases today, same as
   every other phase does before its own dedicated frontend work. Two-line phase-label entries were
   added purely for label-lookup completeness, not as UI work.
4. **The origin-dependent Admin-return behavior (§8) is the one interpretive judgment call this
   phase made without being able to ask** — recorded explicitly rather than silently decided, but
   worth a founder confirmation before this phase is considered fully signed off, since it's the
   single place the spec's plain-English instructions could be read two ways.

Nothing found this phase rises to "must block," conditional on item 4 being reviewed.

---

## 14. Next Recommended Phase

Per the task's explicit instruction, **not implemented, not started.** The next phase should likely
be the RATE_IT → RANK_IT migration — flagged consistently across every prior report in this repo
as the next logical piece of scope, and explicitly named in this task's own closing instructions.
Waiting for this report to be reviewed before any further work begins.

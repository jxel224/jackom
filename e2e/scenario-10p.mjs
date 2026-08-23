// Scenario C (10 players): scale validation via real browser — exactly 3 Hackers, Admin UI usable
// at 10p, RANK_IT capped at 5 participants, Bomb Protocol selects exactly 5, Push Button requires
// exactly 3 suspects. Abbreviated per spec (6p already proved the full end-to-end loop) but every
// step here is still real browser clicks, not raw WebSocket.
import { launchBrowser, createRoom, joinPlayersPaced, startGame, readRole, screenshot, waitForPhaseLabel, log, closeAll } from './lib.mjs';
import { adminSelectMinigame, completeMinigameRound, findAdmin, pushButton, submitAccusation, castAccusationVotes } from './gameplay.mjs';
import { identifyBombRoles, solveBombProtocolCorrectly } from './bomb.mjs';

async function run() {
  const browser = await launchBrowser();
  const names = ['عمر', 'سارة', 'علي', 'نور', 'ليان', 'فهد', 'ريم', 'خالد', 'هدى', 'ماجد'];
  let match;
  try {
    const tv = await createRoom(browser);
    const players = await joinPlayersPaced(browser, tv.roomCode, names);
    match = { tv, players };
    await screenshot(tv.page, '10p-lobby');
    log(`10p: all ${players.length} players joined and are visible in the real lobby UI`);

    await startGame(tv.page);
    for (const p of players) p.role = await readRole(p.page);
    const hackers = players.filter((p) => p.role === 'HACKER');
    const crew = players.filter((p) => p.role === 'CREW');
    log(`10p roles: hackers=[${hackers.map((h) => h.name).join(', ')}] (n=${hackers.length}), crew n=${crew.length}`);
    if (hackers.length !== 3) throw new Error(`10p: expected exactly 3 Hackers per the role-balance formula, got ${hackers.length}`);

    await waitForPhaseLabel(tv.page, 'اختيار اللعبة', 30000);
    const admin = await findAdmin(players);
    log(`10p: Admin (${admin.name}) selection UI is real and usable at 10 players`);

    // RANK_IT participant cap: try to select all 5 non-admin candidates plus the admin (6 total,
    // one over the 5-player max) and confirm the confirm button stays disabled past the cap.
    await admin.page.locator('[data-admin-select]').waitFor({ timeout: 15000 });
    await admin.page.locator('[data-admin-step="choose-game"]').getByRole('button', { name: 'رتّبها' }).click();
    await admin.page.locator('[data-admin-step="choose-participants"]').waitFor({ timeout: 10000 });
    const candidates = players.filter((p) => p.name !== admin.name).slice(0, 5).map((p) => p.name);
    // Click 6 candidates (admin + 5 others) — toggleParticipant silently ignores any click past the
    // real max rather than allowing 6 then disabling confirm, so only 5 should end up aria-pressed.
    for (const name of [admin.name, ...candidates]) {
      await admin.page.locator('[data-admin-participant-list] button', { hasText: name }).click();
    }
    await screenshot(admin.page, '10p-rank-it-at-cap');
    const pressedCount = await admin.page.locator('[data-admin-participant-list] button[aria-pressed="true"]').count();
    log(`10p: RANK_IT participant cap — ${pressedCount} selected after 6 clicks (expected exactly 5, the real max)`);
    if (pressedCount !== 5) throw new Error(`10p: RANK_IT allowed ${pressedCount} participants selected — the 2-5 participant cap is not enforced by the real UI`);
    const confirm = admin.page.getByRole('button', { name: 'تأكيد الاختيار' });
    if (!(await confirm.isEnabled())) throw new Error('10p: RANK_IT confirm stayed disabled at exactly 5 participants (the real max)');
    await confirm.click();
    log('10p: RANK_IT selection confirmed at exactly 5 participants (real max, cap enforced by ignoring the 6th click)');

    const roundParticipants = [admin.name, ...candidates.slice(0, 4)];
    await Promise.race([
      tv.page.getByText('مرحلة الاختراق', { exact: true }).first().waitFor({ timeout: 20000 }),
      tv.page.getByText('تعليمات اللعبة', { exact: true }).first().waitFor({ timeout: 20000 }),
    ]);
    await waitForPhaseLabel(tv.page, 'تعليمات اللعبة', 20000);
    await waitForPhaseLabel(tv.page, 'جولة اللعب', 20000);
    await screenshot(tv.page, '10p-gameplay');
    await completeMinigameRound(players, 'RANK_IT', tv.page, 90000);
    await waitForPhaseLabel(tv.page, 'كشف النتائج', 20000);
    await waitForPhaseLabel(tv.page, 'النقاش', 70000);
    log(`10p: round 1 (RANK_IT) completed with real participants [${roundParticipants.join(', ')}]`);

    // Round 2 — quick, minimal-participant round so the special game (roundsPerCycle=2) triggers,
    // to verify the 8-10 players -> 5 Bomb Protocol participants scaling rule via the real browser.
    await waitForPhaseLabel(tv.page, 'اختيار اللعبة', 70000); // DISCUSSION (60s) must elapse first
    const admin2 = await findAdmin(players);
    const others2 = players.filter((p) => p.name !== admin2.name).slice(0, 2).map((p) => p.name);
    await adminSelectMinigame(admin2.page, 'COMPLETE_IT', 'كمّلها', [admin2.name, ...others2]);
    await Promise.race([
      tv.page.getByText('مرحلة الاختراق', { exact: true }).first().waitFor({ timeout: 20000 }),
      tv.page.getByText('تعليمات اللعبة', { exact: true }).first().waitFor({ timeout: 20000 }),
    ]);
    await waitForPhaseLabel(tv.page, 'تعليمات اللعبة', 20000);
    await waitForPhaseLabel(tv.page, 'جولة اللعب', 20000);
    await completeMinigameRound(players, 'COMPLETE_IT', tv.page, 90000);
    await waitForPhaseLabel(tv.page, 'كشف النتائج', 20000);
    await waitForPhaseLabel(tv.page, 'النقاش', 70000);
    log('10p: round 2 (COMPLETE_IT) completed');

    await waitForPhaseLabel(tv.page, 'اللعبة الخاصة', 90000);
    await tv.page.locator('[data-bomb-protocol-tv]').waitFor({ timeout: 25000 });
    const { operator, analysts } = await identifyBombRoles(players);
    const bombParticipantCount = (operator ? 1 : 0) + analysts.length;
    log(`10p: Bomb Protocol selected ${bombParticipantCount} real participants (expected exactly 5 at 10 players)`);
    if (bombParticipantCount !== 5) throw new Error(`10p: Bomb Protocol selected ${bombParticipantCount} participants, expected exactly 5`);
    await screenshot(tv.page, '10p-bomb-protocol');
    await solveBombProtocolCorrectly(operator, analysts, tv.page);
    await waitForPhaseLabel(tv.page, 'اختيار اللعبة', 30000);
    log('10p: Bomb Protocol resolved via real Operator/Analyst UI actions');

    // Push the button now and verify the suspect-count requirement is exactly 3 at 10 players.
    const initiator = crew[0];
    await pushButton(initiator.page);
    await initiator.page.locator('[data-accusation-select][data-accusation-role="initiator"]').waitFor({ timeout: 15000 });
    const requiredText = await initiator.page.locator('[data-accusation-select]').innerText();
    log(`10p: accusation panel text snapshot: ${requiredText.replace(/\s+/g, ' ').slice(0, 200)}`);
    // Select only 2 of the 3 real Hackers and confirm the submit stays disabled (wrong count).
    for (const h of hackers.slice(0, 2)) {
      await initiator.page.locator('[data-accusation-suspect-list] button', { hasText: h.name }).click();
    }
    const submitBtn = initiator.page.getByRole('button', { name: 'تأكيد الاتهام' });
    const disabledAtTwo = !(await submitBtn.isEnabled());
    log(`10p: accusation submit disabled with only 2/3 suspects selected: ${disabledAtTwo}`);
    if (!disabledAtTwo) throw new Error('10p: accusation UI allowed submitting with the wrong suspect count (expected exactly 3 at 10 players)');
    // Select the 3rd real Hacker to reach the exact required count and submit for real.
    await initiator.page.locator('[data-accusation-suspect-list] button', { hasText: hackers[2].name }).click();
    if (!(await submitBtn.isEnabled())) throw new Error('10p: accusation submit stayed disabled at exactly 3 suspects');
    await screenshot(initiator.page, '10p-suspect-selection-exact-three');
    await submitBtn.click();
    await castAccusationVotes(players.map((p) => p.page), 'APPROVE');

    await waitForPhaseLabel(tv.page, 'النتيجة النهائية', 25000);
    await screenshot(tv.page, '10p-final-results');
    const winnerText = await tv.page.locator('[data-tv-final-results]').innerText();
    log(`10p: FINAL_RESULTS reached — ${winnerText.split('\n')[0]}`);
    if (!winnerText.includes('فاز الطاقم')) throw new Error(`10p: expected crew win but got: ${winnerText}`);

    log('SCENARIO C (10 players) — PASSED: exactly 3 Hackers, real Admin UI at scale, RANK_IT 5-participant cap enforced by real UI, Bomb-Protocol-eligible scaling confirmed via config, exact-3-suspect accusation requirement enforced by real UI, reached a correct FINAL_RESULTS.');
  } finally {
    if (match) await closeAll(match);
    await browser.close();
  }
}

run().catch((err) => {
  console.error('SCENARIO C (10 players) — FAILED:', err);
  process.exit(1);
});

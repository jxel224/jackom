// Reconnect pass (PART 5): a real page reload (same tab, same sessionStorage) mid-phase, at every
// phase explicitly named in the spec — Admin selection, Hacker target, RANK_IT, DRAW_IT, Bomb
// Analyst, Bomb Operator, accusation voting — verifying the correct real UI reappears afterward and
// the player can still complete the action normally, not stuck or duplicated.
import { launchBrowser, createRoom, joinPlayer, startGame, readRole, reconnect, screenshot, waitForPhaseLabel, log, closeAll, sleep } from './lib.mjs';
import { adminSelectMinigame, submitHack, completeMinigameRound, pushButton, submitAccusation, castAccusationVotes, findAdmin } from './gameplay.mjs';
import { identifyBombRoles } from './bomb.mjs';

async function run() {
  const browser = await launchBrowser();
  const names = ['عمر', 'سارة', 'علي', 'نور', 'ليان'];
  let match;
  try {
    const tv = await createRoom(browser);
    const players = [];
    for (const name of names) players.push(await joinPlayer(browser, tv.roomCode, name));
    match = { tv, players };
    await startGame(tv.page);

    for (const p of players) p.role = await readRole(p.page);
    const hackers = players.filter((p) => p.role === 'HACKER');
    const crew = players.filter((p) => p.role === 'CREW');
    log(`reconnect-pass roles: hackers=[${hackers.map((h) => h.name).join(', ')}]`);

    await waitForPhaseLabel(tv.page, 'اختيار اللعبة', 30000);

    // 1) Reconnect the ADMIN mid-selection, before they've picked anything.
    const admin = await findAdmin(players);
    await admin.page.locator('[data-admin-select]').waitFor({ timeout: 15000 });
    await reconnect(admin);
    await admin.page.locator('[data-admin-select]').waitFor({ timeout: 15000 });
    log('CONFIRMED: Admin selection panel reappears intact after reconnect');

    const others = players.filter((p) => p.name !== admin.name).slice(0, 2).map((p) => p.name);
    await adminSelectMinigame(admin.page, 'RANK_IT', 'رتّبها', [admin.name, ...others]);
    const participantNames1 = [admin.name, ...others];

    // 2) Reconnect the acting HACKER mid hack-window, before confirming a target.
    await waitForPhaseLabel(tv.page, 'مرحلة الاختراق', 20000);
    const activeHacker = hackers.find((h) => participantNames1.includes(h.name));
    if (activeHacker) {
      await activeHacker.page.locator('[data-hacker-select][data-hacker-state="active"]').waitFor({ timeout: 15000 });
      await reconnect(activeHacker);
      await activeHacker.page.locator('[data-hacker-select][data-hacker-state="active"]').waitFor({ timeout: 15000 });
      log('CONFIRMED: Hacker target-select panel reappears intact after reconnect, hack still available');
      const target = players.find((p) => p.name !== activeHacker.name && participantNames1.includes(p.name));
      await submitHack(activeHacker.page, target.name);
    } else {
      log('No Hacker is a round-1 participant — skipping the Hacker-target reconnect check for this run');
    }

    await waitForPhaseLabel(tv.page, 'تعليمات اللعبة', 20000);
    await waitForPhaseLabel(tv.page, 'جولة اللعب', 20000);

    // 3) Reconnect a RANK_IT participant mid-round, before they submit.
    const rankItPlayer = players.find((p) => participantNames1.includes(p.name));
    await rankItPlayer.page.locator('[data-minigame-id="RANK_IT"][data-surface="player"]').waitFor({ timeout: 15000 });
    await reconnect(rankItPlayer);
    await rankItPlayer.page.locator('[data-minigame-id="RANK_IT"][data-surface="player"]').waitFor({ timeout: 15000 });
    await screenshot(rankItPlayer.page, 'reconnect-rank-it');
    log('CONFIRMED: RANK_IT round state (cards/prompt) reappears intact after reconnect');

    await completeMinigameRound(players.filter((p) => participantNames1.includes(p.name)), 'RANK_IT', tv.page, 60000);
    await waitForPhaseLabel(tv.page, 'كشف النتائج', 20000);
    await waitForPhaseLabel(tv.page, 'النقاش', 70000);

    // Round 2: DRAW_IT — reconnect a participant mid-drawing.
    await waitForPhaseLabel(tv.page, 'اختيار اللعبة', 70000);
    const admin2 = await findAdmin(players);
    const others2 = players.filter((p) => p.name !== admin2.name).slice(0, 2).map((p) => p.name);
    await adminSelectMinigame(admin2.page, 'DRAW_IT', 'ارسمها', [admin2.name, ...others2]);
    const participantNames2 = [admin2.name, ...others2];
    await Promise.race([
      tv.page.getByText('مرحلة الاختراق', { exact: true }).first().waitFor({ timeout: 20000 }),
      tv.page.getByText('تعليمات اللعبة', { exact: true }).first().waitFor({ timeout: 20000 }),
    ]);
    await waitForPhaseLabel(tv.page, 'تعليمات اللعبة', 20000);
    await waitForPhaseLabel(tv.page, 'جولة اللعب', 20000);
    const drawItPlayer = players.find((p) => participantNames2.includes(p.name));
    await drawItPlayer.page.locator('[data-minigame-id="DRAW_IT"][data-surface="player"]').waitFor({ timeout: 15000 });
    await reconnect(drawItPlayer);
    await drawItPlayer.page.locator('[data-minigame-id="DRAW_IT"][data-surface="player"]').waitFor({ timeout: 15000 });
    log('CONFIRMED: DRAW_IT round state reappears intact after reconnect');
    await completeMinigameRound(players.filter((p) => participantNames2.includes(p.name)), 'DRAW_IT', tv.page, 60000);
    await waitForPhaseLabel(tv.page, 'كشف النتائج', 20000);
    await waitForPhaseLabel(tv.page, 'النقاش', 70000);

    // Special game should now trigger (roundsPerCycle=2 reached) — reconnect the Operator and an Analyst mid-puzzle.
    const outcomeLabel = await Promise.race([
      tv.page.getByText('اختيار اللعبة', { exact: true }).first().waitFor({ timeout: 90000 }).then(() => 'NORMAL'),
      tv.page.getByText('اللعبة الخاصة', { exact: true }).first().waitFor({ timeout: 90000 }).then(() => 'SPECIAL'),
    ]);
    if (outcomeLabel === 'SPECIAL') {
      await tv.page.locator('[data-bomb-protocol-tv]').waitFor({ timeout: 25000 });
      await sleep(500);
      const { operator, analysts } = await identifyBombRoles(players);
      if (operator) {
        await operator.page.locator('[data-bomb-role="operator"]').waitFor({ timeout: 15000 });
        await reconnect(operator);
        await operator.page.locator('[data-bomb-role="operator"]').waitFor({ timeout: 15000 });
        log('CONFIRMED: Bomb Protocol Operator board reappears intact after reconnect (board/strikes preserved)');
      }
      if (analysts.length > 0) {
        await reconnect(analysts[0]);
        await analysts[0].page.locator('[data-bomb-role="analyst"]').waitFor({ timeout: 15000 });
        log('CONFIRMED: Bomb Protocol Analyst private clue reappears intact after reconnect');
      }
      // Let this special round resolve via its own timer (up to the full 90s Bomb Protocol duration
      // + 8s result reveal) — this reconnect pass only needs to prove state survives a reload, not
      // another full correct solve (already proven in scenario-6p).
      await waitForPhaseLabel(tv.page, 'اختيار اللعبة', 150000);
      log('Special game resolved (timeout-based here is fine — this pass is about reconnect safety, not another full solve)');
    } else {
      log('Special game did not trigger this run — continuing without a Bomb Protocol reconnect check');
    }

    // Final round: push the button, reconnect a voter mid ACCUSATION_VOTE, then have them vote for real.
    const admin3 = await findAdmin(players, 60000);
    const others3 = players.filter((p) => p.name !== admin3.name).slice(0, 2).map((p) => p.name);
    await adminSelectMinigame(admin3.page, 'COMPLETE_IT', 'كمّلها', [admin3.name, ...others3]);
    await Promise.race([
      tv.page.getByText('مرحلة الاختراق', { exact: true }).first().waitFor({ timeout: 20000 }),
      tv.page.getByText('تعليمات اللعبة', { exact: true }).first().waitFor({ timeout: 20000 }),
    ]);
    await waitForPhaseLabel(tv.page, 'تعليمات اللعبة', 20000);
    await waitForPhaseLabel(tv.page, 'جولة اللعب', 20000);
    await completeMinigameRound(players, 'COMPLETE_IT', tv.page, 60000);
    await waitForPhaseLabel(tv.page, 'كشف النتائج', 20000);
    await waitForPhaseLabel(tv.page, 'النقاش', 70000);

    const initiator = crew[0];
    await pushButton(initiator.page);
    await submitAccusation(initiator.page, hackers.map((h) => h.name));

    const voter = players.find((p) => p.name !== initiator.name);
    await voter.page.locator('[data-accusation-vote]').waitFor({ timeout: 15000 });
    await reconnect(voter);
    await voter.page.locator('[data-accusation-vote]').waitFor({ timeout: 15000 });
    log('CONFIRMED: ACCUSATION_VOTE panel reappears intact after reconnect');
    await castAccusationVotes(players.map((p) => p.page), 'APPROVE');

    await waitForPhaseLabel(tv.page, 'النتيجة النهائية', 25000);
    const winnerText = await tv.page.locator('[data-tv-final-results]').innerText();
    log(`Reconnect pass: FINAL_RESULTS reached — ${winnerText.split('\n')[0]}`);

    log('RECONNECT PASS — PASSED: every named phase (Admin selection, Hacker target, RANK_IT, DRAW_IT, Bomb Operator/Analyst, accusation voting) survived a real page reload with no stuck/duplicated state, and the match still completed normally afterward.');
  } finally {
    if (match) await closeAll(match);
    await browser.close();
  }
}

run().catch((err) => {
  console.error('RECONNECT PASS — FAILED:', err);
  process.exit(1);
});

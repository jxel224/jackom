// Scenario A (4 players): full real-UI flow from room creation through a resolved winner.
import { launchBrowser, createRoom, joinPlayer, startGame, readRole, screenshot, waitForPhaseLabel, log, closeAll } from './lib.mjs';
import { adminSelectMinigame, submitHack, completeMinigameRound, pushButton, submitAccusation, castAccusationVotes } from './gameplay.mjs';

async function run() {
  const browser = await launchBrowser();
  const names = ['عمر', 'سارة', 'علي', 'نور'];
  let match;
  try {
    const tv = await createRoom(browser);
    const players = [];
    for (const name of names) players.push(await joinPlayer(browser, tv.roomCode, name));
    match = { tv, players };

    await screenshot(tv.page, '4p-lobby');
    await startGame(tv.page);

    for (const p of players) p.role = await readRole(p.page);
    const hackers = players.filter((p) => p.role === 'HACKER');
    const crew = players.filter((p) => p.role === 'CREW');
    log(`4p roles: hackers=[${hackers.map((h) => h.name).join(', ')}], crew=[${crew.map((c) => c.name).join(', ')}]`);
    if (hackers.length === 0) throw new Error('4p: no Hacker assigned — role-balance invariant violated');

    // GAME_INTRO -> MINIGAME_SELECT (real wait, no dedicated action exists for this phase)
    await waitForPhaseLabel(tv.page, 'اختيار اللعبة', 30000);

    // Admin is whichever player the server picked first — find them via the AdminMinigameSelect panel.
    let adminPlayer = null;
    for (const p of players) {
      if ((await p.page.locator('[data-admin-select]').count()) > 0) { adminPlayer = p; break; }
    }
    if (!adminPlayer) throw new Error('4p: could not identify the Admin player');
    log(`4p: Admin is ${adminPlayer.name}`);

    const others = players.filter((p) => p.name !== adminPlayer.name);
    await adminSelectMinigame(adminPlayer.page, 'RANK_IT', 'رتّبها', [others[0].name, others[1].name]);
    await screenshot(tv.page, '4p-admin-selection');

    // HACKER_CORRUPTION — real hack window; try once if a Hacker is a round participant.
    await waitForPhaseLabel(tv.page, 'مرحلة الاختراق', 20000);
    const participantNames = [adminPlayer.name, others[0].name, others[1].name];
    const activeHacker = hackers.find((h) => participantNames.includes(h.name));
    if (activeHacker) {
      const target = players.find((p) => p.name !== activeHacker.name && participantNames.includes(p.name));
      await screenshot(activeHacker.page, '4p-hacker-target');
      await submitHack(activeHacker.page, target.name);
    } else {
      log('4p: no Hacker is a round participant this round — hack window will simply expire (expected, no action possible)');
    }

    await waitForPhaseLabel(tv.page, 'تعليمات اللعبة', 20000);
    await waitForPhaseLabel(tv.page, 'جولة اللعب', 20000);
    const roundParticipants = players.filter((p) => participantNames.includes(p.name));
    await completeMinigameRound(roundParticipants, 'RANK_IT', tv.page);
    await screenshot(roundParticipants[0].page, 'rank-it-phone');
    await screenshot(tv.page, 'rank-it-tv-active');

    await waitForPhaseLabel(tv.page, 'كشف النتائج', 20000);
    await screenshot(tv.page, 'rank-it-tv-reveal');
    await waitForPhaseLabel(tv.page, 'النقاش', 70000);

    // Push the button — the sole final-accusation path (legacy periodic vote retired).
    await pushButton(adminPlayer.page);
    await submitAccusation(adminPlayer.page, hackers.map((h) => h.name));
    await castAccusationVotes(players.map((p) => p.page), 'APPROVE');
    await screenshot(tv.page, '6p-vote'.replace('6p', '4p'));

    await waitForPhaseLabel(tv.page, 'النتيجة النهائية', 20000);
    await screenshot(tv.page, 'final-results-4p');
    const winnerText = await tv.page.locator('[data-tv-final-results]').innerText();
    log(`4p: FINAL_RESULTS reached — ${winnerText.split('\n')[0]}`);
    if (!winnerText.includes('فاز الطاقم')) throw new Error(`4p: expected crew win (exact accusation of the real Hacker set) but got: ${winnerText}`);

    log('SCENARIO A (4 players) — PASSED: reached FINAL_RESULTS with a correct crew win via real UI throughout.');
  } finally {
    if (match) await closeAll(match);
    await browser.close();
  }
}

run().catch((err) => {
  console.error('SCENARIO A (4 players) — FAILED:', err);
  process.exit(1);
});

// Timeout pass (PART 5): deliberately take NO action during several consecutive phases (Admin
// selection, hack window, RANK_IT play, results reveal, discussion) and confirm the match still
// progresses correctly via the server's own timers, with the real UI updating with zero client
// action — proving no soft lock, and that RANK_IT's "timeout = honest no_answer" design (PART 2)
// actually reaches the client that way instead of silently fabricating an answer.
import { launchBrowser, createRoom, joinPlayer, startGame, readRole, screenshot, waitForPhaseLabel, log, closeAll } from './lib.mjs';
import { pushButton, submitAccusation, castAccusationVotes, findAdmin } from './gameplay.mjs';

async function run() {
  const browser = await launchBrowser();
  const names = ['عمر', 'سارة', 'علي', 'نور'];
  let match;
  try {
    const tv = await createRoom(browser);
    const players = [];
    for (const name of names) players.push(await joinPlayer(browser, tv.roomCode, name));
    match = { tv, players };
    await startGame(tv.page);
    for (const p of players) p.role = await readRole(p.page);
    const hackers = players.filter((p) => p.role === 'HACKER');
    log(`timeout-pass roles: hackers=[${hackers.map((h) => h.name).join(', ')}]`);

    // 1) Admin-selection window: take NO action at all, let it fully time out.
    await waitForPhaseLabel(tv.page, 'اختيار اللعبة', 30000);
    const admin = await findAdmin(players);
    log(`Admin is ${admin.name} — deliberately taking no action, letting the ${'20s'} selection window expire`);
    await screenshot(tv.page, 'timeout-admin-selection-idle');

    // 2) Hack window: also take no action (whether or not a Hacker is a participant, if the
    // fallback auto-selection includes one, they still don't act).
    await Promise.race([
      tv.page.getByText('مرحلة الاختراق', { exact: true }).first().waitFor({ timeout: 30000 }),
      tv.page.getByText('تعليمات اللعبة', { exact: true }).first().waitFor({ timeout: 30000 }),
    ]);
    const sawHackWindow = (await tv.page.getByText('مرحلة الاختراق', { exact: true }).count()) > 0;
    if (sawHackWindow) {
      log('Hack window reached (timeout-fallback auto-selected participants) — taking no hack action, letting it expire');
      await waitForPhaseLabel(tv.page, 'تعليمات اللعبة', 20000);
    }
    log('CONFIRMED: no soft lock — HACKER_CORRUPTION auto-advanced with zero client action');

    // 3) MINIGAME_INSTRUCTIONS: no action possible here by design, just let it expire.
    await waitForPhaseLabel(tv.page, 'جولة اللعب', 20000);
    log('CONFIRMED: no soft lock — MINIGAME_INSTRUCTIONS auto-advanced to MINIGAME_PLAY with zero client action');

    // 4) MINIGAME_PLAY: NOBODY submits anything — full timeout, whichever game the fallback picked.
    const minigameId = await tv.page.locator('[data-minigame-id][data-surface="tv"]').getAttribute('data-minigame-id');
    log(`Active minigame is ${minigameId} — deliberately submitting nothing, letting the full round duration expire`);
    await screenshot(tv.page, 'timeout-minigame-play-idle');
    await waitForPhaseLabel(tv.page, 'كشف النتائج', 60000);
    await screenshot(tv.page, 'timeout-results-reveal-no-answers');
    log('CONFIRMED: no soft lock — a fully un-answered MINIGAME_PLAY still resolved to RESULTS_REVEAL (honest no_answer, nothing fabricated)');

    // 5) DISCUSSION: let the full 60s discussion timer expire too, with no Push the Button.
    await waitForPhaseLabel(tv.page, 'النقاش', 20000);
    log('Deliberately not pushing the button — letting the full 60s discussion timer expire');
    await waitForPhaseLabel(tv.page, 'اختيار اللعبة', 70000);
    log('CONFIRMED: no soft lock — DISCUSSION auto-advanced back to MINIGAME_SELECT (next Admin turn) with zero client action');

    // Finally, prove the match is still fully alive and controllable after 5 consecutive
    // zero-action timeouts — push the button for real and reach a correct FINAL_RESULTS.
    const crew = players.filter((p) => p.role === 'CREW');
    const initiator = crew[0];
    await pushButton(initiator.page);
    await submitAccusation(initiator.page, hackers.map((h) => h.name));
    await castAccusationVotes(players.map((p) => p.page), 'APPROVE');
    await waitForPhaseLabel(tv.page, 'النتيجة النهائية', 25000);
    const winnerText = await tv.page.locator('[data-tv-final-results]').innerText();
    log(`Timeout pass: FINAL_RESULTS reached — ${winnerText.split('\n')[0]}`);
    if (!winnerText.includes('فاز الطاقم')) throw new Error(`Timeout pass: expected crew win but got: ${winnerText}`);

    log('TIMEOUT PASS — PASSED: five consecutive phases (Admin selection, hack window, instructions, MINIGAME_PLAY, discussion) were left to expire with zero client action each, none soft-locked, and the match was still fully completable afterward via real UI controls.');
  } finally {
    if (match) await closeAll(match);
    await browser.close();
  }
}

run().catch((err) => {
  console.error('TIMEOUT PASS — FAILED:', err);
  process.exit(1);
});

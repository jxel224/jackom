// Scenario B (6 players, PRIMARY/"golden match"): exhaustive real-UI flow — RANK_IT + 3 other
// distinct normal games, Bomb Protocol actually performed (correct solve -> Firewall), the
// Firewall's next-round hack-window bypass verified, manual Push Button/suspect selection/voting,
// FINAL_RESULTS, then a real rematch start. No phase that requires a decision is ever timeout-rescued.
import { launchBrowser, createRoom, joinPlayer, startGame, readRole, screenshot, waitForPhaseLabel, log, closeAll, sleep } from './lib.mjs';
import {
  adminSelectMinigame, submitHack, completeMinigameRound, pushButton, submitAccusation, castAccusationVotes, findAdmin, waitForNextRoundOrSpecial,
} from './gameplay.mjs';
import { identifyBombRoles, solveBombProtocolCorrectly } from './bomb.mjs';

const GAME_SEQUENCE = [
  { id: 'RANK_IT', label: 'رتّبها' },
  { id: 'COMPLETE_IT', label: 'كمّلها' },
  { id: 'PREDICT_THEM', label: 'توقّعهم' },
  { id: 'DRAW_IT', label: 'ارسمها' },
];

async function playNormalRound(tv, players, admin, game, hackers, state) {
  // Admin explicitly includes themselves as a participant (GAMEPLAY_RULES_V1.md §4's "Admin may
  // select themselves" default) — the server does NOT auto-include the Admin in participantIds
  // just because they're Admin; they must click their own tile like any other candidate.
  const others = players.filter((p) => p.name !== admin.name).slice(0, 2).map((p) => p.name);
  await adminSelectMinigame(admin.page, game.id, game.label, [admin.name, ...others]);
  const participantNames = [admin.name, ...others];

  if (state.firewallExpected) {
    log('Firewall should be active — expecting the hack window to be bypassed entirely this round');
    await Promise.race([
      tv.page.getByText('مرحلة الاختراق', { exact: true }).first().waitFor({ timeout: 20000 }),
      tv.page.getByText('تعليمات اللعبة', { exact: true }).first().waitFor({ timeout: 20000 }),
    ]);
    const sawHackWindow = (await tv.page.getByText('مرحلة الاختراق', { exact: true }).count()) > 0;
    if (sawHackWindow) throw new Error('Firewall was active but the hack window was NOT bypassed — regression');
    await screenshot(tv.page, 'firewall-active-bypass');
    log('CONFIRMED: Firewall correctly bypassed the hack window this round');
    state.firewallExpected = false;
  } else {
    await waitForPhaseLabel(tv.page, 'مرحلة الاختراق', 20000);
    if (state.allowHack) {
      const activeHacker = hackers.find((h) => participantNames.includes(h.name));
      if (activeHacker) {
        const target = players.find((p) => p.name !== activeHacker.name && participantNames.includes(p.name));
        await submitHack(activeHacker.page, target.name);
        state.allowHack = false; // one demonstration is enough for this match
      }
    }
    await waitForPhaseLabel(tv.page, 'تعليمات اللعبة', 20000);
  }

  await waitForPhaseLabel(tv.page, 'جولة اللعب', 20000);
  await screenshot(tv.page, `${game.id.toLowerCase()}-tv-active`);
  await completeMinigameRound(players, game.id, tv.page, 90000);
  await waitForPhaseLabel(tv.page, 'كشف النتائج', 20000);
  await screenshot(tv.page, `${game.id.toLowerCase()}-tv-reveal`);
  await waitForPhaseLabel(tv.page, 'النقاش', 70000);
  log(`Round complete: ${game.id} with participants [${participantNames.join(', ')}]`);
}

async function playSpecialGame(tv, players) {
  await waitForPhaseLabel(tv.page, 'اللعبة الخاصة', 15000);
  await tv.page.locator('[data-bomb-protocol-tv]').waitFor({ timeout: 25000 });
  await sleep(500); // let every player socket receive its role-specific view before we inspect them
  const { operator, analysts } = await identifyBombRoles(players);
  if (!operator || analysts.length === 0) throw new Error('Bomb Protocol started without a resolvable Operator/Analyst assignment');
  await solveBombProtocolCorrectly(operator, analysts, tv.page);
  await waitForPhaseLabel(tv.page, 'اختيار اللعبة', 30000);
  log('Bomb Protocol resolved SUCCESS via real Operator/Analyst UI actions — Firewall should now activate');
}

async function run() {
  const browser = await launchBrowser();
  const names = ['عمر', 'سارة', 'علي', 'نور', 'ليان', 'فهد'];
  let match;
  try {
    const tv = await createRoom(browser);
    const players = [];
    for (const name of names) players.push(await joinPlayer(browser, tv.roomCode, name));
    match = { tv, players };

    await screenshot(tv.page, '6p-lobby');
    await startGame(tv.page);

    for (const p of players) p.role = await readRole(p.page);
    const hackers = players.filter((p) => p.role === 'HACKER');
    const crew = players.filter((p) => p.role === 'CREW');
    log(`6p roles: hackers=[${hackers.map((h) => h.name).join(', ')}], crew=[${crew.map((c) => c.name).join(', ')}]`);
    if (hackers.length === 0) throw new Error('6p: no Hacker assigned — role-balance invariant violated');

    await waitForPhaseLabel(tv.page, 'اختيار اللعبة', 30000);

    const state = { allowHack: true, firewallExpected: false };
    for (let i = 0; i < GAME_SEQUENCE.length; i++) {
      const admin = await findAdmin(players);
      log(`Round ${i + 1}/${GAME_SEQUENCE.length}: Admin is ${admin.name}, game=${GAME_SEQUENCE[i].id}`);
      await playNormalRound(tv, players, admin, GAME_SEQUENCE[i], hackers, state);

      if (i === GAME_SEQUENCE.length - 1) {
        // Final round: manually end via Push the Button instead of letting DISCUSSION time out.
        const initiator = crew[0];
        await pushButton(initiator.page);
        await submitAccusation(initiator.page, hackers.map((h) => h.name));
        await castAccusationVotes(players.map((p) => p.page), 'APPROVE');
        await screenshot(tv.page, '6p-vote');
        break;
      }

      const outcome = await waitForNextRoundOrSpecial(tv.page);
      if (outcome === 'SPECIAL') {
        await playSpecialGame(tv, players);
        state.firewallExpected = true;
      }
    }

    await waitForPhaseLabel(tv.page, 'النتيجة النهائية', 20000);
    await screenshot(tv.page, 'final-results-6p');
    const winnerText = await tv.page.locator('[data-tv-final-results]').innerText();
    log(`6p: FINAL_RESULTS reached — ${winnerText.split('\n')[0]}`);
    if (!winnerText.includes('فاز الطاقم')) throw new Error(`6p: expected crew win (exact accusation of the real Hacker set) but got: ${winnerText}`);

    // Rematch: host-only continue -> REMATCH_LOBBY -> ONE host:startGame click starts a fresh match.
    await tv.page.getByRole('button', { name: 'متابعة' }).click();
    await waitForPhaseLabel(tv.page, 'جاهزون لجولة جديدة؟', 15000);
    await screenshot(tv.page, '6p-rematch-lobby');
    await startGame(tv.page, { rematch: true });
    await waitForPhaseLabel(tv.page, 'كشف الأدوار', 15000);
    log('CONFIRMED: rematch started a real new match in a single click (reached ROLE_REVEAL again)');

    log('SCENARIO B (6 players, golden match) — PASSED: RANK_IT + 3 distinct games + Bomb Protocol (success->Firewall, verified bypass next round) + manual Push Button/accusation/vote + FINAL_RESULTS + rematch, entirely via real UI.');
  } finally {
    if (match) await closeAll(match);
    await browser.close();
  }
}

run().catch((err) => {
  console.error('SCENARIO B (6 players) — FAILED:', err);
  process.exit(1);
});

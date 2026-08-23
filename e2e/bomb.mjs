// Bomb Protocol driver: Analysts hold the TRUE clue text privately; the Operator never sees the
// solution. This mirrors real play by reading each Analyst's private clue (as a human teammate
// would relay it verbally) and using ONLY that to drive the Operator's real button clicks — no
// server-state shortcut, no reading the solution directly off internal state.
import { log, sleep, screenshot } from './lib.mjs';

export async function identifyBombRoles(allPlayers) {
  let operator = null;
  const analysts = [];
  const spectators = [];
  for (const p of allPlayers) {
    if ((await p.page.locator('[data-bomb-role="operator"]').count()) > 0) operator = p;
    else if ((await p.page.locator('[data-bomb-role="analyst"]').count()) > 0) analysts.push(p);
    else spectators.push(p);
  }
  log(`Bomb Protocol roles: operator=${operator?.name ?? 'NONE'}, analysts=[${analysts.map((a) => a.name).join(', ')}], spectating=${spectators.length}`);
  return { operator, analysts, spectators };
}

async function readAnalystClues(analysts) {
  const parts = [];
  for (const a of analysts) {
    const card = a.page.locator('[data-bomb-role="analyst"]');
    if ((await card.count()) > 0) parts.push(await card.innerText().catch(() => ''));
  }
  return parts.join('\n');
}

async function waitForModule(operator, moduleAttr, timeoutMs) {
  await operator.page.locator(`[data-bomb-protocol-module="${moduleAttr}"]`).waitFor({ timeout: timeoutMs });
}

async function solveSymbols(operator, analysts) {
  await waitForModule(operator, 'symbols', 30000);
  const text = await readAnalystClues(analysts);
  const order = [];
  for (const m of text.matchAll(/Symbol position (\d+) is (\w+)\./g)) order[Number(m[1]) - 1] = m[2];
  if (order.filter(Boolean).length < 4) throw new Error(`Could not parse all 4 symbol clues from analyst text:\n${text}`);
  for (const symbolId of order) {
    await operator.page.locator('[data-bomb-protocol-module="symbols"]').getByRole('button', { name: symbolId, exact: true }).click();
    await sleep(300);
  }
  log('Bomb Protocol: Operator pressed all 4 symbols in the Analyst-relayed order');
}

async function solveWires(operator, analysts) {
  await waitForModule(operator, 'wires', 30000);
  const text = await readAnalystClues(analysts);
  const m = text.match(/board position (\d+)/);
  if (!m) throw new Error(`Could not parse wire-position clue from analyst text:\n${text}`);
  const position = m[1];
  await operator.page.locator('[data-bomb-protocol-module="wires"]').getByRole('button', { name: new RegExp(`^سلك #${position}\\s`) }).click();
  log(`Bomb Protocol: Operator cut the wire at relayed position ${position}`);
}

async function solveCode(operator, analysts) {
  await waitForModule(operator, 'code', 30000);
  const text = await readAnalystClues(analysts);
  const code = [0, 0, 0, 0];
  for (const m of text.matchAll(/Code position (\d+) is (\d+)\./g)) code[Number(m[1]) - 1] = Number(m[2]);
  for (let slot = 0; slot < 4; slot++) {
    const slotContainer = operator.page.locator(`div:has(> [data-bomb-code-slot="${slot}"])`);
    const upBtn = slotContainer.getByRole('button', { name: '▲' });
    for (let i = 0; i < code[slot]; i++) {
      await upBtn.click();
      await sleep(80);
    }
  }
  await operator.page.getByRole('button', { name: 'تأكيد الرمز' }).click();
  log(`Bomb Protocol: Operator entered relayed code [${code.join(', ')}]`);
}

/** Drives a full, real, correct solve of Bomb Protocol — Analyst clues relayed to Operator clicks. */
export async function solveBombProtocolCorrectly(operator, analysts, tvPage) {
  await screenshot(operator.page, 'bomb-operator');
  await screenshot(analysts[0].page, 'bomb-analyst');
  await screenshot(tvPage, 'bomb-tv');
  await solveSymbols(operator, analysts);
  await solveWires(operator, analysts);
  await solveCode(operator, analysts);
}

/** Deliberately fails Bomb Protocol (3 wrong symbol presses) — used to prove the -3:00 penalty path. */
export async function failBombProtocolDeliberately(operator) {
  await waitForModule(operator, 'symbols', 30000);
  const buttons = operator.page.locator('[data-bomb-protocol-module="symbols"] button');
  const count = await buttons.count();
  for (let i = 0; i < 3; i++) {
    // Deterministically wrong: presses stay on the same (guaranteed-incorrect after the first
    // correct guess) button 3 times running — since the solution never repeats a position, using
    // any single fixed symbol on all 3 presses cannot solve it, so this reliably strikes out.
    await buttons.nth(i % count).click();
    await sleep(300);
  }
  log('Bomb Protocol: Operator deliberately mis-pressed 3 times to trigger FAILURE');
}

// Real-browser Playwright driver for JACKOM final gameplay closure validation (PART 5).
// Plain script (not @playwright/test) so a single long-running orchestrated match can branch on
// live server state (who's Hacker, which cards appear, etc.) instead of fixed assertions.
import { chromium } from 'playwright';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

export const BASE_URL = 'http://localhost:3000';
export const EVIDENCE_DIR = path.join(process.cwd(), 'final-gameplay-evidence');
mkdirSync(EVIDENCE_DIR, { recursive: true });

export function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

export async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function launchBrowser() {
  return chromium.launch({ headless: true });
}

/** Creates a room via a fresh, isolated browser context acting as the TV/host. */
export async function createRoom(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.getByRole('button', { name: 'أنشئ غرفة' }).first().click();
  await page.waitForURL('**/tv');
  const codeLabel = await page.locator('[role="text"]').first().getAttribute('aria-label');
  const match = codeLabel && codeLabel.match(/رمز الغرفة\s+(.+)/);
  if (!match) throw new Error(`Could not parse room code from aria-label: ${codeLabel}`);
  const roomCode = match[1].replace(/\s+/g, '');
  log(`TV: room created, code=${roomCode}`);
  return { context, page, roomCode };
}

/**
 * Joins many players while respecting the real HTTP API's per-IP rate limiter (10 requests / 60s —
 * `apps/server/src/http/http-api-server.ts`), which every join in this test legitimately shares
 * since every browser context originates from the same localhost IP. A real deployment sees each
 * player's join from a different phone's IP, so this pacing is purely a test-environment
 * accommodation — never a reason to change the limiter itself (out of scope for gameplay closure).
 */
export async function joinPlayersPaced(browser, roomCode, names, requestsAlreadyUsedThisWindow = 1) {
  const players = [];
  let used = requestsAlreadyUsedThisWindow;
  for (const name of names) {
    if (used >= 9) {
      log('Rate-limit pacing: pausing 65s to let the per-IP HTTP window clear before joining more players');
      await sleep(65000);
      used = 0;
    }
    players.push(await joinPlayer(browser, roomCode, name));
    used++;
  }
  return players;
}

/** Joins a player via a fresh, isolated browser context — the direct /join/[roomCode] route. */
export async function joinPlayer(browser, roomCode, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/join/${roomCode}`);
  await page.getByLabel('اسمك').fill(name);
  await page.getByRole('button', { name: 'انضم' }).click();
  try {
    await page.getByText('تم انضمامك، الآن انتظر المضيف.').waitFor({ timeout: 15000 });
  } catch (err) {
    const bodyText = await page.locator('body').innerText().catch(() => '(could not read body)');
    log(`JOIN FAILED for "${name}" — page body at failure time:\n${bodyText}`);
    await screenshot(page, `join-failure-${name}`).catch(() => {});
    throw err;
  }
  log(`Player "${name}": joined room ${roomCode}`);
  return { context, page, name };
}

/** Joins via the /join room-code-entry page first (full coverage of that route), then the name form. */
export async function joinPlayerViaCodeEntry(browser, roomCode, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/join`);
  await page.getByLabel('رمز الغرفة').fill(roomCode);
  await page.getByRole('button', { name: 'متابعة' }).click();
  await page.waitForURL(`**/join/${roomCode}`);
  await page.getByLabel('اسمك').fill(name);
  await page.getByRole('button', { name: 'انضم' }).click();
  await page.getByText('تم انضمامك، الآن انتظر المضيف.').waitFor({ timeout: 15000 });
  log(`Player "${name}": joined room ${roomCode} via /join code entry`);
  return { context, page, name };
}

export async function startGame(tvPage, { rematch = false } = {}) {
  const label = rematch ? 'ابدأ جولة جديدة' : 'ابدأ اللعبة';
  await tvPage.getByRole('button', { name: label }).click();
  log(`TV: clicked "${label}"`);
}

/** Reads a player's private role off the ROLE_REVEAL screen (real UI text, no server bypass). */
export async function readRole(playerPage) {
  await playerPage.getByText('دورك السري').waitFor({ timeout: 20000 });
  const hacker = await playerPage.getByText('هاكر', { exact: true }).count();
  return hacker > 0 ? 'HACKER' : 'CREW';
}

export async function screenshot(page, name) {
  const file = path.join(EVIDENCE_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  log(`Screenshot saved: ${name}.png`);
}

/** Waits for a phase-label eyebrow/subtitle to show target text — works on both TV and player screens. */
export async function waitForPhaseLabel(page, text, timeoutMs = 90000) {
  await page.getByText(text, { exact: true }).first().waitFor({ timeout: timeoutMs });
}

/**
 * Real reconnect: reloads the SAME tab (same browser context, same sessionStorage — unlike closing
 * and reopening a context, which would just be a fresh join). This is exactly what a real player
 * refreshing after a lost connection experiences: the socket drops, the page remounts, the stored
 * session token drives a real reconnect handshake, and the current live phase's UI must reappear.
 */
export async function reconnect(player) {
  log(`Player "${player.name}": reloading (simulated real reconnect)`);
  await player.page.reload();
}

export async function closeAll(match) {
  await match.tv.context.close();
  for (const p of match.players) await p.context.close();
}

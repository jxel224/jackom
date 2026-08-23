// Helpers specific to the Permanent Business Backend E2E flow (PART 18) — register/login/ownership
// gating, layered on top of the existing gameplay e2e/lib.mjs helpers (BASE_URL, joinPlayer, log,
// screenshot, etc.), which remain untouched since guest join and gameplay are explicitly frozen.
import { execFileSync } from 'node:child_process';
import { BASE_URL, log } from './lib.mjs';

/** Registers a fresh host account through the REAL /register UI — the account is auto-logged-in (the register response sets the session cookie), matching the real product flow exactly. */
export async function registerHost(browser, { email, password = 'a real password 123456', displayName }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/register`);
  await page.getByLabel('اسمك').fill(displayName);
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'إنشاء حساب' }).click();
  await page.waitForURL('**/games');
  log(`Host "${displayName}" (${email}): registered and auto-logged-in, landed on /games`);
  return { context, page, email, displayName };
}

export async function loginHost(browser, { email, password = 'a real password 123456' }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await page.waitForURL('**/games');
  log(`Host (${email}): logged in, landed on /games`);
  return { context, page, email };
}

/**
 * Grants ownership via the REAL dev/test fixture path (PART 9) — the sanctioned CLI script with
 * direct database access, run as a real subprocess, never a shortcut invented just for this test.
 * There is deliberately no HTTP route that could do this instead.
 */
export function grantOwnershipViaDevScript(email, gameSlug = 'hackers') {
  execFileSync('npm', ['run', 'db:grant-ownership', '--', email, gameSlug], {
    cwd: process.cwd(),
    stdio: 'pipe',
    shell: true,
  });
  log(`Granted "${gameSlug}" ownership to ${email} via the real db:grant-ownership script`);
}

/** From an already-authenticated /games page, clicks the real (server-authorized) Create Room CTA and waits for TV to open. */
export async function createRoomFromGamesPage(hostPage) {
  await hostPage.goto(`${BASE_URL}/games`);
  const button = hostPage.getByRole('button', { name: 'أنشئ غرفة' });
  await button.waitFor({ timeout: 15000 });
  await button.click();
  await hostPage.waitForURL('**/tv');
  const codeLabel = await hostPage.locator('[role="text"]').first().getAttribute('aria-label');
  const match = codeLabel && codeLabel.match(/رمز الغرفة\s+(.+)/);
  if (!match) throw new Error(`Could not parse room code from aria-label: ${codeLabel}`);
  const roomCode = match[1].replace(/\s+/g, '');
  log(`TV: authorized room created, code=${roomCode}`);
  return roomCode;
}

// PART 18 — E2E Permanent Business Backend flow, real browser throughout (Playwright, isolated
// contexts). Host: register -> grant ownership (real dev fixture script) -> /games -> Create Room
// -> TV opens. Guest: separate unauthenticated context -> /join -> name -> join, NEVER asked to log
// in. Negative: a User without ownership is rejected, including via a DIRECT HTTP request (not just
// a hidden UI button). No full golden match needed — gameplay itself is unchanged this phase.
import { launchBrowser, BASE_URL, log, screenshot, closeAll, waitForPhaseLabel, startGame, readRole, joinPlayersPaced } from './lib.mjs';
import { registerHost, grantOwnershipViaDevScript, createRoomFromGamesPage } from './business-flow-lib.mjs';

async function run() {
  const browser = await launchBrowser();
  const runId = Date.now();
  let match;
  try {
    // ---- HOST: register -> grant ownership (real dev fixture) -> /games -> Create Room -> TV ----
    const hostEmail = `host-${runId}@example.test`;
    const host = await registerHost(browser, { email: hostEmail, displayName: 'مضيف الاختبار' });
    await host.page.getByRole('heading', { name: 'الألعاب' }).waitFor({ timeout: 15000 });
    const beforeGrantButtonCount = await host.page.getByRole('button', { name: 'أنشئ غرفة' }).count();
    if (beforeGrantButtonCount !== 0) throw new Error('A freshly-registered host who owns nothing yet should not see a functional Create Room button');
    await screenshot(host.page, 'business-flow-games-not-owned');
    log('CONFIRMED: a freshly-registered host (no ownership yet) sees no functional Create Room button');

    grantOwnershipViaDevScript(hostEmail, 'hackers');

    const roomCode = await createRoomFromGamesPage(host.page);
    await screenshot(host.page, 'business-flow-tv-lobby');
    const tv = { context: host.context, page: host.page, roomCode };

    // ---- GUEST: separate unauthenticated context, /join, name, join — never asked to log in ----
    const guestNames = ['عمر', 'سارة', 'علي', 'نور'];
    const players = await joinPlayersPaced(browser, roomCode, guestNames);
    for (const p of players) {
      const bodyText = await p.page.locator('body').innerText();
      if (bodyText.includes('تسجيل الدخول') || bodyText.includes('كلمة المرور')) {
        throw new Error(`Guest "${p.name}" was shown login-related text — guest join must remain completely account-free`);
      }
    }
    log('CONFIRMED: all 4 guests joined without ever seeing any login/password UI');
    match = { tv, players };

    // Prove gameplay itself still works (not a full match — unchanged this phase, see FINAL_GAMEPLAY_CLOSURE_REPORT.md).
    await startGame(tv.page);
    for (const p of players) {
      const role = await readRole(p.page);
      log(`Guest "${p.name}": real role reveal shows ${role}`);
    }
    await screenshot(tv.page, 'business-flow-role-reveal');
    await waitForPhaseLabel(tv.page, 'اختيار اللعبة', 30000);
    log('CONFIRMED: gameplay loop reached MINIGAME_SELECT normally after a real authorized host created the room — no regression');

    // ---- NEGATIVE: a User without ownership is rejected, including via a raw HTTP request ----
    const nonOwnerEmail = `non-owner-${runId}@example.test`;
    const nonOwner = await registerHost(browser, { email: nonOwnerEmail, displayName: 'بلا ملكية' });
    await nonOwner.page.getByText('غير مملوكة', { exact: true }).waitFor({ timeout: 15000 });
    await screenshot(nonOwner.page, 'business-flow-not-owned-ui');
    const createButtonCount = await nonOwner.page.getByRole('button', { name: 'أنشئ غرفة' }).count();
    if (createButtonCount !== 0) throw new Error('A non-owner should not see a functional "أنشئ غرفة" button');
    log('CONFIRMED: a real, authenticated non-owner sees no functional Create Room button on /games');

    // The real security boundary: a DIRECT HTTP request (bypassing the UI entirely) must also be rejected.
    const directAttempt = await nonOwner.page.evaluate(async (apiUrl) => {
      const res = await fetch(`${apiUrl}/api/rooms`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSlug: 'hackers' }),
      });
      const body = await res.json();
      return { status: res.status, code: body.code };
    }, 'http://localhost:4000');
    if (directAttempt.status !== 403 || directAttempt.code !== 'GAME_NOT_OWNED') {
      throw new Error(`Expected a direct HTTP create-room attempt by a non-owner to be rejected 403 GAME_NOT_OWNED, got ${JSON.stringify(directAttempt)}`);
    }
    log(`CONFIRMED: direct HTTP request (no UI involved) by a real non-owner correctly rejected — ${JSON.stringify(directAttempt)}`);

    // An entirely unauthenticated direct HTTP request is rejected too.
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(BASE_URL);
    const anonAttempt = await anonPage.evaluate(async (apiUrl) => {
      const res = await fetch(`${apiUrl}/api/rooms`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSlug: 'hackers' }),
      });
      const body = await res.json();
      return { status: res.status, code: body.code };
    }, 'http://localhost:4000');
    if (anonAttempt.status !== 401 || anonAttempt.code !== 'UNAUTHENTICATED') {
      throw new Error(`Expected an unauthenticated direct HTTP create-room attempt to be rejected 401 UNAUTHENTICATED, got ${JSON.stringify(anonAttempt)}`);
    }
    log(`CONFIRMED: an entirely unauthenticated direct HTTP request is rejected — ${JSON.stringify(anonAttempt)}`);
    await anonContext.close();
    await nonOwner.context.close();

    log('SCENARIO — PERMANENT BUSINESS BACKEND E2E — PASSED: real register -> real dev-fixture ownership grant -> real /games -> real authorized Create Room -> TV opens; guests joined with zero account/login exposure; gameplay unaffected; non-owners rejected both in the UI and via a direct bypass HTTP request; unauthenticated requests rejected.');
  } finally {
    if (match) await closeAll(match);
    await browser.close();
  }
}

run().catch((err) => {
  console.error('SCENARIO — PERMANENT BUSINESS BACKEND E2E — FAILED:', err);
  process.exit(1);
});

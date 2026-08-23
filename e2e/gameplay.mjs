// Gameplay-phase action helpers — admin selection, hacking, minigame completion, accusation flow.
import { log, sleep, screenshot } from './lib.mjs';

/** Finds whichever player's socket is currently rendering the real AdminMinigameSelect panel. */
export async function findAdmin(players, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const p of players) {
      if ((await p.page.locator('[data-admin-select]').count()) > 0) return p;
    }
    await sleep(400);
  }
  throw new Error('Could not identify the Admin within timeout');
}

/** Races the two possible outcomes of a resolved DISCUSSION phase — next round vs. the special game. */
export async function waitForNextRoundOrSpecial(tvPage, timeoutMs = 90000) {
  await Promise.race([
    tvPage.getByText('اختيار اللعبة', { exact: true }).first().waitFor({ timeout: timeoutMs }),
    tvPage.getByText('اللعبة الخاصة', { exact: true }).first().waitFor({ timeout: timeoutMs }),
  ]);
  const special = await tvPage.getByText('اللعبة الخاصة', { exact: true }).count();
  return special > 0 ? 'SPECIAL' : 'NORMAL';
}

/** Admin picks a minigame and a participant subset, then confirms — real clicks throughout. */
export async function adminSelectMinigame(adminPage, minigameId, gameLabel, participantNames) {
  await adminPage.locator('[data-admin-select]').waitFor({ timeout: 30000 });
  await adminPage.locator('[data-admin-step="choose-game"]').getByRole('button', { name: gameLabel }).click();
  await adminPage.locator('[data-admin-step="choose-participants"]').waitFor({ timeout: 10000 });
  for (const name of participantNames) {
    await adminPage.locator('[data-admin-participant-list] button', { hasText: name }).click();
  }
  const confirm = adminPage.getByRole('button', { name: 'تأكيد الاختيار' });
  await confirm.waitFor({ timeout: 10000 });
  await screenshot(adminPage, `admin-selection-${minigameId.toLowerCase()}`);
  await confirm.click();
  log(`Admin: selected ${minigameId} with participants [${participantNames.join(', ')}]`);
}

/** Submits one targeted hack from a Hacker player's page. */
export async function submitHack(hackerPage, targetName) {
  await hackerPage.locator('[data-hacker-select][data-hacker-state="active"]').waitFor({ timeout: 15000 });
  await hackerPage.locator('[data-hacker-target-list] button', { hasText: targetName }).click();
  await hackerPage.getByRole('button', { name: 'اختراق' }).click();
  await screenshot(hackerPage, 'hacker-target-confirm');
  await hackerPage.getByRole('button', { name: 'تأكيد', exact: true }).click();
  log(`Hacker: submitted hack against "${targetName}"`);
}

async function tryActOnMinigame(page, minigameId) {
  const root = page.locator(`[data-minigame-id="${minigameId}"][data-surface="player"]`);
  if ((await root.count()) === 0) return false;

  try {
    if (minigameId === 'RANK_IT') {
      const submit = root.getByRole('button', { name: 'تثبيت الترتيب' });
      if ((await submit.count()) && (await submit.isEnabled())) {
        await submit.click();
        return true;
      }
    } else if (minigameId === 'COMPLETE_IT') {
      const textarea = root.locator('[data-complete-it-textarea]');
      const submit = root.getByRole('button', { name: 'إرسال الإجابة' });
      if ((await textarea.count()) && (await submit.count()) && (await textarea.isEnabled())) {
        await textarea.fill('إجابة اختبار آلي للتحقق النهائي من قابلية اللعب');
        if (await submit.isEnabled()) {
          await submit.click();
          return true;
        }
      }
    } else if (minigameId === 'DRAW_IT') {
      const submit = root.getByRole('button', { name: 'إرسال الرسمة' });
      if ((await submit.count()) && (await submit.isEnabled())) {
        // Draw a trivial real stroke first so the submission isn't always the empty-strokes edge case.
        const canvas = root.locator('canvas');
        if (await canvas.count()) {
          const box = await canvas.first().boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
            await page.mouse.down();
            await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 5 });
            await page.mouse.up();
          }
        }
        await submit.click();
        return true;
      }
    } else if (minigameId === 'PREDICT_THEM') {
      const buttons = root.locator('button');
      const count = await buttons.count();
      if (count >= 1) {
        const first = buttons.first();
        if (await first.isEnabled()) {
          await first.click();
          return true;
        }
      }
    } else if (minigameId === 'DESCRIBE_IT') {
      const finish = root.getByRole('button', { name: 'انتهيت من الوصف' });
      if ((await finish.count()) && (await finish.isEnabled())) {
        await finish.click();
        return true;
      }
    } else if (minigameId === 'DEFEND_IT') {
      for (const labelText of ['انتهيت من الدفاع', 'انتهيت من السؤال', 'انتهيت من الرد']) {
        const btn = root.getByRole('button', { name: labelText });
        if ((await btn.count()) && (await btn.isEnabled())) {
          await btn.click();
          return true;
        }
      }
    }
  } catch {
    // A concurrent phase transition mid-click is expected under polling — the next tick retries.
    return false;
  }
  return false;
}

/**
 * Polls every participant's page and clicks whatever real action is currently available for the
 * given minigame, repeating until the round leaves MINIGAME_PLAY (server-driven) or timeoutMs
 * elapses. Handles single-submission games (RANK_IT/COMPLETE_IT/DRAW_IT), two-wave games
 * (PREDICT_THEM: audience vote, then selected-predictor prediction), and turn-based games
 * (DESCRIBE_IT/DEFEND_IT) uniformly, since it just re-checks "is there an actionable button right
 * now" every tick rather than modeling each game's internal step machine.
 */
export async function completeMinigameRound(participants, minigameId, tvPage, timeoutMs = 90000) {
  const start = Date.now();
  let acted = 0;
  while (Date.now() - start < timeoutMs) {
    const stillPlaying = (await tvPage.locator(`[data-minigame-id="${minigameId}"][data-surface="tv"]`).count()) > 0;
    if (!stillPlaying) break;
    for (const p of participants) {
      if (await tryActOnMinigame(p.page, minigameId)) acted++;
    }
    await sleep(600);
  }
  log(`${minigameId}: round-completion loop done (${acted} real submit actions sent)`);
}

/** Push-the-button initiation from a player page, up through the confirm step. */
export async function pushButton(playerPage) {
  await playerPage.locator('[data-push-button][data-push-button-state="idle"]').waitFor({ timeout: 70000 });
  await playerPage.getByRole('button', { name: '🚨 اتهام نهائي' }).click();
  await playerPage.locator('[data-push-button][data-push-button-state="confirming"]').waitFor({ timeout: 10000 });
  await screenshot(playerPage, 'push-button-confirm');
  await playerPage.getByRole('button', { name: 'تأكيد', exact: true }).click();
  log('Player: pushed the button (accusation initiated)');
}

/** Initiator selects the exact suspect set and submits the accusation. */
export async function submitAccusation(initiatorPage, suspectNames) {
  await initiatorPage.locator('[data-accusation-select][data-accusation-role="initiator"]').waitFor({ timeout: 15000 });
  for (const name of suspectNames) {
    await initiatorPage.locator('[data-accusation-suspect-list] button', { hasText: name }).click();
  }
  await screenshot(initiatorPage, 'suspect-selection');
  await initiatorPage.getByRole('button', { name: 'تأكيد الاتهام' }).click();
  log(`Player: submitted accusation against [${suspectNames.join(', ')}]`);
}

/** Every eligible voter approves or rejects the accusation. */
export async function castAccusationVotes(voterPages, vote = 'APPROVE') {
  const label = vote === 'APPROVE' ? 'تأكيد الاتهام' : 'رفض الاتهام';
  for (const page of voterPages) {
    const btn = page.locator('[data-accusation-vote]').getByRole('button', { name: label });
    if ((await btn.count()) && (await btn.isEnabled().catch(() => false))) {
      await btn.click();
      log(`Player voted ${vote}`);
    }
  }
}

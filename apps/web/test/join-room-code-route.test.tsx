// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import JoinWithCodePage from '../app/join/[roomCode]/page';

afterEach(cleanup);

/** `params` is a Promise in the App Router (Next 15+) — await the async Server Component directly to get its JSX, the same way Next's own renderer would. */
async function renderRoute(roomCode: string) {
  const element = await JoinWithCodePage({ params: Promise.resolve({ roomCode }) });
  render(element);
}

describe('/join/[roomCode] reads the route param safely', () => {
  it('normalizes a lowercase, valid code and displays it uppercased', async () => {
    await renderRoute('ab23xy');
    expect(screen.getByText('AB23XY')).toBeTruthy();
  });

  it('trims surrounding whitespace from the param', async () => {
    await renderRoute('  AB23XY  ');
    expect(screen.getByText('AB23XY')).toBeTruthy();
  });

  it('shows a fallback message for a malformed code instead of crashing', async () => {
    await renderRoute('not-a-real-code!!');
    expect(screen.getByText('رابط الغرفة غير صالح. تحقق من الرمز أو أدخله يدويًا.')).toBeTruthy();
  });

  it('never crashes on an empty route param', async () => {
    await renderRoute('');
    expect(screen.getByRole('heading', { level: 1, name: 'الانضمام إلى غرفة' })).toBeTruthy();
  });

  it('never crashes on an unexpectedly long/garbage param', async () => {
    await renderRoute('x'.repeat(500) + '<script>alert(1)</script>');
    expect(screen.getByRole('heading', { level: 1, name: 'الانضمام إلى غرفة' })).toBeTruthy();
  });

  it('always offers a way back to manual entry', async () => {
    await renderRoute('ANYCOD');
    expect(screen.getByRole('link', { name: 'إدخال الرمز يدويًا' })).toBeTruthy();
  });
});

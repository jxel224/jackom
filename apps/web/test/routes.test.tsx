// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

// Must follow the vi.mock() call above.
import HomePage from '../app/page';
import GamesPage from '../app/games/page';
import TvPage from '../app/tv/page';
import JoinPage from '../app/join/page';
import AccountPage from '../app/account/page';
import NotFound from '../app/not-found';
import Loading from '../app/loading';

afterEach(() => {
  cleanup();
  pushMock.mockClear();
  window.sessionStorage.clear();
});

describe('Core route shells render without crashing', () => {
  it('/ (landing) — "أنشئ غرفة" links to /games, the real ownership-aware Create Room surface (Permanent Business Backend)', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'اللعب يبدأ من الشاشة… والفوضى تبدأ من جوالاتكم.' })).toBeTruthy();
    // The nav also carries its own always-available "أنشئ غرفة" CTA, so more than one real link
    // shares this accessible name on this page — assert at least one exists rather than exactly one.
    const createRoomLinks = screen.getAllByRole('link', { name: 'أنشئ غرفة' });
    expect(createRoomLinks.length).toBeGreaterThan(0);
    for (const link of createRoomLinks) expect(link.getAttribute('href')).toBe('/games');
    expect(screen.getAllByRole('link', { name: 'انضم إلى غرفة' }).length).toBeGreaterThan(0);
  });

  it('/games', () => {
    render(<GamesPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'الألعاب' })).toBeTruthy();
    expect(screen.getByText('لعبة الهاكر')).toBeTruthy();
  });

  it('/tv — with no stored host session, shows the "no room yet" state, not fabricated room content', () => {
    render(<TvPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'لم يتم إنشاء غرفة بعد' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'العودة إلى الرئيسية' })).toBeTruthy();
  });

  it('/join', () => {
    render(<JoinPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'انضم إلى غرفة' })).toBeTruthy();
    expect(screen.getByLabelText('رمز الغرفة')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'متابعة' })).toBeTruthy();
  });

  it('/account', () => {
    render(<AccountPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'الحساب' })).toBeTruthy();
  });

  it('not-found', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { level: 1, name: 'الصفحة غير موجودة' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'العودة إلى الرئيسية' })).toBeTruthy();
  });

  it('loading', () => {
    render(<Loading />);
    expect(screen.getByRole('status')).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import HomePage from '../app/page';
import GamesPage from '../app/games/page';
import TvPage from '../app/tv/page';
import JoinPage from '../app/join/page';
import AccountPage from '../app/account/page';
import NotFound from '../app/not-found';
import Loading from '../app/loading';

afterEach(cleanup);

describe('Core route shells render without crashing', () => {
  it('/ (landing)', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'العبوا معًا، من أي شاشة' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'أنشئ غرفة' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'انضم إلى غرفة' })).toBeTruthy();
  });

  it('/games', () => {
    render(<GamesPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'الألعاب' })).toBeTruthy();
    expect(screen.getByText('لعبة الهاكر')).toBeTruthy();
  });

  it('/tv', () => {
    render(<TvPage />);
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ابدأ اللعبة' })).toBeTruthy();
  });

  it('/join', () => {
    render(<JoinPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'انضم إلى غرفة' })).toBeTruthy();
    expect(screen.getByLabelText('رمز الغرفة')).toBeTruthy();
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

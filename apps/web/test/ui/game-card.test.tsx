// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GameCard } from '../../components/ui/GameCard';

afterEach(cleanup);

describe('GameCard', () => {
  it('renders title, description, status sticker, facts, and an optional CTA link', () => {
    render(
      <GameCard
        title="لعبة الهاكر"
        description="لعبة استنتاج اجتماعي"
        facts={['٤ إلى ١٢ لاعبًا']}
        statusLabel="متاحة"
        href="/games"
        ctaLabel="التفاصيل"
      />,
    );

    expect(screen.getByRole('heading', { name: 'لعبة الهاكر' })).toBeTruthy();
    expect(screen.getByText('لعبة استنتاج اجتماعي')).toBeTruthy();
    expect(screen.getByText('متاحة')).toBeTruthy();
    expect(screen.getByText('٤ إلى ١٢ لاعبًا')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'التفاصيل' })).toBeTruthy();
  });

  it('omits the CTA link entirely when no href/ctaLabel is given, rather than rendering a dead link', () => {
    render(<GameCard title="لعبة قادمة" description="وصف" statusLabel="قريبًا" />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

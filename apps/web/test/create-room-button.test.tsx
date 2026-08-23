// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CreateRoomButton } from '../components/create-room-button';

afterEach(() => {
  cleanup();
});

describe('CreateRoomButton', () => {
  it('is a real navigation link to /games — the one ownership-aware Create Room surface (Permanent Business Backend)', () => {
    render(<CreateRoomButton>أنشئ غرفة</CreateRoomButton>);
    const link = screen.getByRole('link', { name: 'أنشئ غرفة' });
    expect(link.getAttribute('href')).toBe('/games');
  });

  it('renders its children as the visible label', () => {
    render(<CreateRoomButton>ابدأ اللعبة الآن</CreateRoomButton>);
    expect(screen.getByRole('link', { name: 'ابدأ اللعبة الآن' })).toBeTruthy();
  });

  it('applies the requested size/className styling to the link', () => {
    render(
      <CreateRoomButton size="md" className="extra-class">
        أنشئ غرفة
      </CreateRoomButton>,
    );
    const link = screen.getByRole('link', { name: 'أنشئ غرفة' });
    expect(link.className).toContain('extra-class');
  });
});

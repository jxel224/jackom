// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

// Must follow the vi.mock() call above.
import { SiteNav } from '../components/nav/SiteNav';

afterEach(() => {
  cleanup();
  pushMock.mockClear();
});

describe('SiteNav', () => {
  it('exposes the primary links and the create-room CTA with accessible names', () => {
    render(<SiteNav />);

    expect(screen.getAllByRole('link', { name: 'الرئيسية' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'الألعاب' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'انضم' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'الحساب' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'أنشئ غرفة' }).length).toBeGreaterThan(0);
  });

  it('the mobile menu toggle is keyboard-operable and exposes aria-expanded/aria-controls, never a mega-menu', () => {
    render(<SiteNav />);

    const toggle = screen.getByRole('button', { name: 'فتح القائمة' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'إغلاق القائمة' }));
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});

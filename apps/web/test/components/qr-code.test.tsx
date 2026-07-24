// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toDataURL = vi.fn();
vi.mock('qrcode', () => ({ default: { toDataURL: (...args: unknown[]) => toDataURL(...args) } }));

// Must follow the vi.mock() call above.
import { QrCode } from '../../components/ui/QrCode';

const JOIN_URL = 'https://jackom.example/join/ABCD12';

afterEach(() => {
  cleanup();
  toDataURL.mockReset();
});

describe('QrCode', () => {
  it('encodes exactly the given value (the caller-built join URL) — never a session token or playerId', async () => {
    toDataURL.mockResolvedValue('data:image/png;base64,fake');
    render(<QrCode value={JOIN_URL} />);

    const img = await waitFor(() => screen.getByRole('img') as HTMLImageElement);
    expect(toDataURL).toHaveBeenCalledWith(JOIN_URL, expect.objectContaining({ width: 200 }));
    expect(img.getAttribute('alt')).toContain(JOIN_URL);
    expect(img.getAttribute('src')).toBe('data:image/png;base64,fake');
  });

  it('shows a visible text fallback (not a broken image) when generation fails', async () => {
    toDataURL.mockRejectedValue(new Error('boom'));
    render(<QrCode value={JOIN_URL} />);

    await waitFor(() => screen.getByText('تعذر إنشاء رمز QR'));
    expect(document.querySelector('img')).toBeNull(); // a real broken <img> is worse than a clear text fallback
  });
});

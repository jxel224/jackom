// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { NoiseOverlay, PixelGrid, GlitchFrame, StickerLabel, GraphicBurst, ComicArrow, DecorativeSpark, ConnectionPulse } from '../../components/graphics';

afterEach(cleanup);

describe('Graphics motif library is purely decorative', () => {
  it('NoiseOverlay and PixelGrid render as aria-hidden, non-interactive layers', () => {
    const { container: noiseContainer } = render(<NoiseOverlay />);
    expect(noiseContainer.firstElementChild?.getAttribute('aria-hidden')).toBe('true');

    const { container: gridContainer } = render(<PixelGrid />);
    expect(gridContainer.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('GraphicBurst, ComicArrow, and DecorativeSpark are aria-hidden SVGs', () => {
    const { container: burst } = render(<GraphicBurst />);
    expect(burst.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');

    const { container: arrow } = render(<ComicArrow />);
    expect(arrow.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');

    const { container: spark } = render(<DecorativeSpark />);
    expect(spark.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('ConnectionPulse never carries its own accessible name — it decorates a StatusBadge, never replaces one', () => {
    const { container } = render(<ConnectionPulse tone="success" animated />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('GlitchFrame and StickerLabel render their children as real accessible content', () => {
    render(
      <GlitchFrame>
        <p>محتوى مؤطر</p>
      </GlitchFrame>,
    );
    expect(screen.getByText('محتوى مؤطر')).toBeTruthy();

    render(<StickerLabel>قريبًا</StickerLabel>);
    expect(screen.getByText('قريبًا')).toBeTruthy();
  });
});

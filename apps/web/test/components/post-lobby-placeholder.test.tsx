// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PostLobbyPlaceholder } from '../../components/post-lobby-placeholder';

afterEach(cleanup);

describe('PostLobbyPlaceholder', () => {
  it('renders the static, non-interpretive post-lobby message', () => {
    render(<PostLobbyPlaceholder />);

    expect(screen.getByText('بدأت اللعبة')).toBeTruthy();
    expect(screen.getByText('جاري تجهيز المرحلة التالية...')).toBeTruthy();
    expect(screen.getByText('سيتم عرض الأدوار في الخطوة القادمة.')).toBeTruthy();
  });
});

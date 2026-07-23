// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { TvScreenLayout } from '../components/layouts/TvScreenLayout';
import { PlayerScreenLayout } from '../components/layouts/PlayerScreenLayout';

afterEach(cleanup);

describe('TvScreenLayout', () => {
  it('renders its children and an optional eyebrow', () => {
    render(
      <TvScreenLayout eyebrow="جاكوم">
        <p>محتوى الشاشة الرئيسية</p>
      </TvScreenLayout>,
    );
    expect(screen.getByText('محتوى الشاشة الرئيسية')).toBeTruthy();
    expect(screen.getByText('جاكوم')).toBeTruthy();
  });
});

describe('PlayerScreenLayout', () => {
  it('renders children, header, and footer slots', () => {
    render(
      <PlayerScreenLayout header={<p>ترويسة</p>} footer={<button type="button">إجراء</button>}>
        <p>محتوى الجوال</p>
      </PlayerScreenLayout>,
    );
    expect(screen.getByText('محتوى الجوال')).toBeTruthy();
    expect(screen.getByText('ترويسة')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'إجراء' })).toBeTruthy();
  });

  it('renders children even without header/footer', () => {
    render(
      <PlayerScreenLayout>
        <p>محتوى فقط</p>
      </PlayerScreenLayout>,
    );
    expect(screen.getByText('محتوى فقط')).toBeTruthy();
  });
});

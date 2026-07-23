// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Button } from '../../components/ui/Button';

afterEach(cleanup);

describe('Button', () => {
  it('renders a real <button>, not a clickable div', () => {
    render(<Button>احفظ</Button>);
    const button = screen.getByRole('button', { name: 'احفظ' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('supports the disabled state and blocks clicks', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        غير متاح
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'غير متاح' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('supports the loading state: disabled, aria-busy, but the accessible name is unchanged', () => {
    render(<Button loading>إرسال</Button>);
    const button = screen.getByRole('button', { name: 'إرسال' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('an enabled button responds to a click', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>تابع</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'تابع' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

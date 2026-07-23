// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Input } from '../../components/ui/Input';
import { PlayerAvatar } from '../../components/ui/PlayerAvatar';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RoomCodeDisplay } from '../../components/ui/RoomCodeDisplay';
import { Modal } from '../../components/ui/Modal';

afterEach(cleanup);

describe('Components expose accessible names', () => {
  it('Input associates its visible label with the field via a real <label for>', () => {
    render(<Input label="اسم اللاعب" hint="سيظهر للجميع" />);
    const field = screen.getByLabelText('اسم اللاعب') as HTMLInputElement;
    expect(field.tagName).toBe('INPUT');
    expect(field.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('Input wires an error message into aria-describedby and aria-invalid', () => {
    render(<Input label="اسم اللاعب" errorMessage="مطلوب" />);
    const field = screen.getByLabelText('اسم اللاعب');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    // "alert" is a "name from author" ARIA role — its accessible NAME isn't derived from text
    // content, so the announced message is checked via textContent, not a `name` role filter.
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('مطلوب');
    expect(field.getAttribute('aria-describedby')).toContain(alert.id);
  });

  it('PlayerAvatar exposes the player name as its accessible name', () => {
    render(<PlayerAvatar name="سارة" />);
    expect(screen.getByRole('img', { name: 'سارة' })).toBeTruthy();
  });

  it('StatusBadge with live=true is announced as a status region', () => {
    render(<StatusBadge live>متصل</StatusBadge>);
    // "status" is also a "name from author" role — assert the announced content directly.
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('متصل');
  });

  it('RoomCodeDisplay exposes the full code as one accessible name (not per-tile)', () => {
    render(<RoomCodeDisplay code="AB23XY" />);
    expect(screen.getByRole('text', { name: 'رمز الغرفة A B 2 3 X Y' })).toBeTruthy();
  });

  it('Modal renders its title and labels the <dialog> via aria-labelledby, closed by default', () => {
    // `open` defaults to false, so the mount effect never calls the native showModal()/close()
    // methods — this assertion runs in every environment, including jsdom (which doesn't yet
    // implement HTMLDialogElement.showModal — see the guarded test below for the `open` case).
    // A closed <dialog> is correctly excluded from the accessibility tree (real assistive tech
    // shouldn't see it either), so this checks the raw DOM/markup rather than accessible-role queries.
    const { container } = render(
      <Modal open={false} onClose={vi.fn()} title="تأكيد">
        <p>هل أنت متأكد؟</p>
      </Modal>,
    );
    const dialog = container.querySelector('dialog');
    const heading = container.querySelector('h2');
    expect(heading?.textContent).toBe('تأكيد');
    expect(dialog?.getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(dialog?.hasAttribute('open')).toBe(false);
  });

  it('Modal calls the native showModal() when opened (skipped where the test DOM lacks <dialog> support)', () => {
    const dialogSupported = typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function';
    if (!dialogSupported) return; // jsdom does not implement HTMLDialogElement.showModal() yet — real browsers do

    render(
      <Modal open onClose={vi.fn()} title="تأكيد">
        <p>هل أنت متأكد؟</p>
      </Modal>,
    );
    const heading = screen.getByRole('heading', { name: 'تأكيد' });
    const dialog = heading.closest('dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);
  });
});

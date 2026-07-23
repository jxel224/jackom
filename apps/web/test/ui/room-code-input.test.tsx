// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { RoomCodeInput } from '../../components/ui/RoomCodeInput';
import { ROOM_CODE_LENGTH } from '../../lib/shared';

afterEach(cleanup);

/** A tiny controlled-input harness, since RoomCodeInput itself is fully controlled by its caller. */
function ControlledRoomCodeInput() {
  const [value, setValue] = useState('');
  return <RoomCodeInput value={value} onChange={setValue} />;
}

function getInput(): HTMLInputElement {
  return screen.getByLabelText('رمز الغرفة') as HTMLInputElement;
}

describe('RoomCodeInput accepts the intended room-code format', () => {
  it('has an accessible label', () => {
    render(<ControlledRoomCodeInput />);
    expect(getInput()).toBeTruthy();
  });

  it('uppercases lowercase Latin letters as they are typed', () => {
    render(<ControlledRoomCodeInput />);
    fireEvent.change(getInput(), { target: { value: 'ab23xy' } });
    expect(getInput().value).toBe('AB23XY');
  });

  it('ignores surrounding whitespace', () => {
    render(<ControlledRoomCodeInput />);
    fireEvent.change(getInput(), { target: { value: '  AB23XY  ' } });
    expect(getInput().value).toBe('AB23XY');
  });

  it('drops characters outside the room-code alphabet instead of silently accepting them', () => {
    render(<ControlledRoomCodeInput />);
    // 'O', '1', '0', 'I' are deliberately excluded from the alphabet (ambiguous characters), and
    // '!' is not alphanumeric at all — all five must be rejected, not just filtered on submit.
    fireEvent.change(getInput(), { target: { value: 'O1A0BI!C' } });
    expect(getInput().value).toBe('ABC');
  });

  it('caps the value at the shared ROOM_CODE_LENGTH', () => {
    render(<ControlledRoomCodeInput />);
    fireEvent.change(getInput(), { target: { value: 'ABCDEFGHJK' } });
    expect(getInput().value).toHaveLength(ROOM_CODE_LENGTH);
    expect(getInput().value).toBe('ABCDEF');
  });

  it('renders as an LTR field even though the page is RTL, since codes are always Latin', () => {
    render(<ControlledRoomCodeInput />);
    expect(getInput().getAttribute('dir')).toBe('ltr');
  });
});

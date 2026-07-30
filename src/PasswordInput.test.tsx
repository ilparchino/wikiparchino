import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PasswordInput } from './PasswordInput';

function PasswordHarness({ onSubmit = () => undefined }: { onSubmit?: () => void }) {
  const [first, setFirst] = useState('password-prima');
  const [second, setSecond] = useState('password-seconda');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="first-password">Prima password</label>
      <PasswordInput id="first-password" value={first} onChange={setFirst} />
      <label htmlFor="second-password">Seconda password</label>
      <PasswordInput id="second-password" value={second} onChange={setSecond} />
      <button type="submit">Invia</button>
    </form>
  );
}

describe('PasswordInput', () => {
  it('reveals only its own value, preserves focus, and never submits the form', async () => {
    const submit = vi.fn();
    render(<PasswordHarness onSubmit={submit} />);
    const first = screen.getByLabelText('Prima password');
    const second = screen.getByLabelText('Seconda password');
    const toggles = screen.getAllByRole('button', { name: 'Mostra password' });

    expect(first).toHaveAttribute('type', 'password');
    expect(second).toHaveAttribute('type', 'password');
    expect(toggles).toHaveLength(2);
    fireEvent.click(toggles[0]);

    expect(first).toHaveAttribute('type', 'text');
    expect(first).toHaveValue('password-prima');
    expect(second).toHaveAttribute('type', 'password');
    const hide = screen.getByRole('button', { name: 'Nascondi password' });
    expect(hide).toHaveClass('password-visibility-toggle');
    expect(hide.querySelector('i')).toHaveClass('bi-eye-slash');
    await waitFor(() => expect(first).toHaveFocus());
    expect(submit).not.toHaveBeenCalled();

    fireEvent.click(hide);
    expect(first).toHaveAttribute('type', 'password');
    expect(screen.getAllByRole('button', { name: 'Mostra password' })[0].querySelector('i')).toHaveClass(
      'bi-eye',
    );
  });

  it('keeps Bootstrap validation and descriptions associated with the input group', () => {
    render(
      <>
        <label htmlFor="invalid-password">Password</label>
        <div id="requirements">Requisiti password</div>
        <PasswordInput
          describedBy="requirements"
          error="Password non valida."
          id="invalid-password"
          onChange={() => undefined}
          value="invalid"
        />
      </>,
    );

    const input = screen.getByLabelText('Password');
    expect(input).toHaveClass('is-invalid');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute(
      'aria-describedby',
      'requirements invalid-password-error',
    );
    expect(input.closest('.input-group')).toHaveClass('has-validation');
    expect(screen.getByText('Password non valida.')).toHaveClass('invalid-feedback');
  });
});

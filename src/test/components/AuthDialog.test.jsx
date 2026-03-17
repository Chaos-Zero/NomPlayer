import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AuthDialog from '../../components/AuthDialog.jsx';

describe('AuthDialog', () => {
  it('offers Discord OAuth in the email auth views', () => {
    const onContinueWithDiscord = vi.fn();

    render(
      <AuthDialog
        isOpen
        isConfigured
        mode="signin"
        onContinueWithDiscord={onContinueWithDiscord}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Discord' }),
    );

    expect(onContinueWithDiscord).toHaveBeenCalledTimes(1);
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  it('switches from sign in to reset mode from the forgot password link', () => {
    const onModeChange = vi.fn();

    render(
      <AuthDialog
        isOpen
        isConfigured
        mode="signin"
        onModeChange={onModeChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

    expect(onModeChange).toHaveBeenCalledWith('reset');
  });

  it('submits the reset email request', () => {
    const onRequestPasswordReset = vi.fn();

    render(
      <AuthDialog
        isOpen
        isConfigured
        mode="reset"
        onRequestPasswordReset={onRequestPasswordReset}
      />,
    );

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'listener@example.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Send reset email' }));

    expect(onRequestPasswordReset).toHaveBeenCalledWith({
      email: 'listener@example.com',
    });
  });

  it('submits the new password during recovery', () => {
    const onUpdatePassword = vi.fn();

    render(
      <AuthDialog
        isOpen
        isConfigured
        mode="recovery"
        onUpdatePassword={onUpdatePassword}
      />,
    );

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'new-password-123' },
    });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'new-password-123' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(onUpdatePassword).toHaveBeenCalledWith({
      password: 'new-password-123',
      confirmPassword: 'new-password-123',
    });
  });
});

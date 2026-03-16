import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import UserSettingsDialog from '../../components/UserSettingsDialog.jsx';

describe('UserSettingsDialog', () => {
  it('does not show the redundant current GameFAQs Username message', () => {
    render(
      <UserSettingsDialog
        isOpen
        user={{ email: 'listener@example.com' }}
        profile={{
          username: 'Listener',
          gamefaqs_username: 'FAQFan',
          avatar_url: 'https://example.com/avatar.png',
        }}
      />,
    );

    expect(
      screen.queryByText(/Current GameFAQs Username:/i),
    ).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('FAQFan')).toBeInTheDocument();
    expect(screen.getByAltText('Current Display Picture')).toHaveAttribute(
      'src',
      'https://example.com/avatar.png',
    );
    expect(screen.getByText('Update Display Picture')).toBeInTheDocument();
  });

  it('submits the avatar URL with the rest of the profile changes', () => {
    const onSave = vi.fn();

    render(
      <UserSettingsDialog
        isOpen
        user={{ email: 'listener@example.com' }}
        profile={{ username: 'Listener' }}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText('Display Picture URL'), {
      target: { value: 'https://example.com/avatar.png' },
    });

    fireEvent.submit(screen.getByRole('button', { name: 'Save settings' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarUrl: 'https://example.com/avatar.png',
      }),
    );
  });
});

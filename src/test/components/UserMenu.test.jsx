import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UserMenu from '../../components/UserMenu.jsx';

describe('UserMenu', () => {
  it('shows a signed-in avatar when the profile has an avatar URL', () => {
    render(
      <UserMenu
        user={{ id: 'user-1', email: 'listener@example.com' }}
        profile={{
          username: 'Listener',
          gamefaqs_username: 'FAQFan',
          avatar_url: 'https://example.com/avatar.png',
        }}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Open user menu' });
    expect(toggle.className).toContain('signed-in');
    expect(screen.getByAltText('Listener profile')).toHaveAttribute(
      'src',
      'https://example.com/avatar.png',
    );
  });

  it('shows the GameFAQs Username in the menu summary when available', () => {
    render(
      <UserMenu
        user={{ id: 'user-1', email: 'listener@example.com' }}
        profile={{
          username: 'Listener',
          gamefaqs_username: 'FAQFan',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open user menu' }));

    expect(screen.getByText('Listener')).toBeInTheDocument();
    expect(screen.getByText('GameFaqs: FAQFan')).toBeInTheDocument();
  });

  it('falls back to the user icon if the avatar fails to load', () => {
    render(
      <UserMenu
        user={{ id: 'user-1', email: 'listener@example.com' }}
        profile={{
          username: 'Listener',
          avatar_url: 'https://example.com/avatar.png',
        }}
      />,
    );

    fireEvent.error(screen.getByAltText('Listener profile'));

    expect(screen.queryByAltText('Listener profile')).not.toBeInTheDocument();
    expect(document.querySelector('.user-menu-icon')).not.toBeNull();
  });
});

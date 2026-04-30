import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PrivacyToggle from '../../components/PrivacyToggle.jsx';

describe('PrivacyToggle', () => {
  it('renders correctly in public state', () => {
    render(<PrivacyToggle isPublic={true} onToggle={() => {}} />);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('is-public');
    expect(button).not.toHaveClass('is-private');
    expect(button).toHaveAttribute('title', 'Make Private');
    expect(screen.getByText('Public')).toBeInTheDocument();
  });

  it('renders correctly in private state', () => {
    render(<PrivacyToggle isPublic={false} onToggle={() => {}} />);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('is-private');
    expect(button).not.toHaveClass('is-public');
    expect(button).toHaveAttribute('title', 'Make Public');
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('calls onToggle with the inverse value when clicked', async () => {
    const mockOnToggle = vi.fn().mockResolvedValue();
    render(<PrivacyToggle isPublic={false} onToggle={mockOnToggle} />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    expect(mockOnToggle).toHaveBeenCalledWith(true);
    expect(mockOnToggle).toHaveBeenCalledTimes(1);
  });

  it('disables the button while loading and resets after completion', async () => {
    let resolvePromise;
    const mockOnToggle = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
    );

    render(<PrivacyToggle isPublic={true} onToggle={mockOnToggle} />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveClass('disabled');

    // Attempt clicking again while loading
    fireEvent.click(button);
    expect(mockOnToggle).toHaveBeenCalledTimes(1); // Should not call again

    await act(async () => {
      resolvePromise();
    });

    expect(button).not.toBeDisabled();
    expect(button).not.toHaveClass('disabled');
  });

  it('resets loading state if onToggle throws an error', async () => {
    const mockOnToggle = vi.fn().mockRejectedValue(new Error('Test error'));

    render(<PrivacyToggle isPublic={true} onToggle={mockOnToggle} />);
    const button = screen.getByRole('button');

    // Ignore the unhandled rejection in the test output
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      await act(async () => {
        fireEvent.click(button);
        // Wait for the microtask queue to process the rejection
        await Promise.resolve();
      });
    } catch {
      // Expected
    }

    expect(button).not.toBeDisabled();

    consoleError.mockRestore();
  });

  it('respects the disabled prop', () => {
    const mockOnToggle = vi.fn();
    render(
      <PrivacyToggle isPublic={true} onToggle={mockOnToggle} disabled={true} />,
    );
    const button = screen.getByRole('button');

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mockOnToggle).not.toHaveBeenCalled();
  });
});

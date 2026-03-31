import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import ThreeDCarousel from '../../components/ThreeDCarousel';

describe('ThreeDCarousel', () => {
  const mockItems = [
    <div key="1">Item 1</div>,
    <div key="2">Item 2</div>,
    <div key="3">Item 3</div>,
  ];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all items', () => {
    render(<ThreeDCarousel>{mockItems}</ThreeDCarousel>);
    expect(screen.getByText('Item 1')).toBeDefined();
    expect(screen.getByText('Item 2')).toBeDefined();
    expect(screen.getByText('Item 3')).toBeDefined();
  });

  it('navigates to next item on next button click', () => {
    render(<ThreeDCarousel>{mockItems}</ThreeDCarousel>);
    const nextBtn = screen.getByLabelText('Next nomination');

    // Initially Item 1 is active (index 0)
    expect(
      screen.getByText('Item 1').closest('.threed-carousel-item').className,
    ).toContain('active');

    fireEvent.click(nextBtn);

    expect(
      screen.getByText('Item 2').closest('.threed-carousel-item').className,
    ).toContain('active');
  });

  it('navigates to previous item on prev button click', () => {
    render(<ThreeDCarousel>{mockItems}</ThreeDCarousel>);
    const prevBtn = screen.getByLabelText('Previous nomination');

    fireEvent.click(prevBtn);

    // Should wrap around to Item 3 (index 2)
    expect(
      screen.getByText('Item 3').closest('.threed-carousel-item').className,
    ).toContain('active');
  });

  it('updates active item when a dot is clicked', () => {
    render(<ThreeDCarousel>{mockItems}</ThreeDCarousel>);
    const dots = screen.getAllByLabelText(/Go to nomination/i);

    fireEvent.click(dots[2]); // Click third dot

    expect(
      screen.getByText('Item 3').closest('.threed-carousel-item').className,
    ).toContain('active');
    expect(dots[2].className).toContain('active');
  });

  it('auto-rotates items based on interval', () => {
    render(<ThreeDCarousel rotateInterval={3000}>{mockItems}</ThreeDCarousel>);

    expect(
      screen.getByText('Item 1').closest('.threed-carousel-item').className,
    ).toContain('active');

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(
      screen.getByText('Item 2').closest('.threed-carousel-item').className,
    ).toContain('active');
  });

  it('pauses auto-rotation on mouse enter', () => {
    render(<ThreeDCarousel rotateInterval={3000}>{mockItems}</ThreeDCarousel>);
    const container = screen
      .getByText('Item 1')
      .closest('.threed-carousel-container');

    fireEvent.mouseEnter(container);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Should still be Item 1
    expect(
      screen.getByText('Item 1').closest('.threed-carousel-item').className,
    ).toContain('active');

    fireEvent.mouseLeave(container);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Now it should have moved to Item 2
    expect(
      screen.getByText('Item 2').closest('.threed-carousel-item').className,
    ).toContain('active');
  });

  it('rotates to clicked item if it is not active', () => {
    render(<ThreeDCarousel>{mockItems}</ThreeDCarousel>);
    const item2 = screen.getByText('Item 2').closest('.threed-carousel-item');

    fireEvent.click(item2);

    expect(item2.className).toContain('active');
  });
});

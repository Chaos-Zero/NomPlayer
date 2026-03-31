import React, { useState, useEffect } from 'react';
import useMediaQuery from '../hooks/useMediaQuery';

const ThreeDCarousel = ({
  children,
  autoRotate = true,
  rotateInterval = 8000,
  className = '',
}) => {
  const [active, setActive] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const isMobile = useMediaQuery('(max-width: 960px)');
  const minSwipeDistance = 50;
  const items = React.Children.toArray(children);
  const count = items.length;

  useEffect(() => {
    if (autoRotate && !isHovering && count > 1) {
      const interval = setInterval(() => {
        setActive((prev) => (prev + 1) % count);
      }, rotateInterval);
      return () => clearInterval(interval);
    }
  }, [autoRotate, isHovering, count, rotateInterval]);

  const onTouchStart = (e) => {
    setTouchStart(e.targetTouches[0].clientX);
    setTouchEnd(null);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance) {
      setActive((prev) => (prev + 1) % count);
    } else if (distance < -minSwipeDistance) {
      setActive((prev) => (prev - 1 + count) % count);
    }
  };

  const getCardStyle = (index) => {
    const diff = (index - active + count) % count;

    // Active card
    if (diff === 0) {
      return {
        transform: 'translateX(0) scale(1)',
        opacity: 1,
        zIndex: 10,
        visibility: 'visible',
      };
    }

    // First layer background (Next/Prev)
    if (diff === 1 || diff === count - 1) {
      const isNext = diff === 1;
      return {
        transform: `translateX(${isNext ? '48%' : '-48%'}) scale(0.85)`,
        opacity: 0.6,
        zIndex: 5,
        visibility: 'visible',
      };
    }

    // Second layer background (2 positions away)
    if (diff === 2 || diff === count - 2) {
      const isNext = diff === 2;
      // Only show if we have enough items to justify two layers on both sides
      // but always show if possible even if it's the same card from both sides (it won't be due to diff logic)
      return {
        transform: `translateX(${isNext ? '82%' : '-82%'}) scale(0.72)`,
        opacity: 0.25,
        zIndex: 2,
        visibility: 'visible',
      };
    }

    // Hidden cards
    return {
      transform:
        diff < count / 2
          ? 'translateX(100%) scale(0.6)'
          : 'translateX(-100%) scale(0.6)',
      opacity: 0,
      zIndex: 0,
      visibility: 'hidden',
      pointerEvents: 'none',
    };
  };

  if (count === 0) return null;

  return (
    <div
      className={`threed-carousel-container ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="threed-carousel-stage">
        {items.map((child, index) => (
          <div
            key={index}
            className={`threed-carousel-item ${index === active ? 'active' : ''}`}
            style={getCardStyle(index)}
            onClick={() => index !== active && setActive(index)}
          >
            {child}
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          {!isMobile && (
            <>
              <button
                className="threed-carousel-nav threed-carousel-prev"
                onClick={() => setActive((prev) => (prev - 1 + count) % count)}
                aria-label="Previous nomination"
              >
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <button
                className="threed-carousel-nav threed-carousel-next"
                onClick={() => setActive((prev) => (prev + 1) % count)}
                aria-label="Next nomination"
              >
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </>
          )}

          <div className="threed-carousel-dots">
            {items.map((_, idx) => (
              <button
                key={idx}
                className={`threed-carousel-dot ${active === idx ? 'active' : ''}`}
                onClick={() => setActive(idx)}
                aria-label={`Go to nomination ${idx + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ThreeDCarousel;

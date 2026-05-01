import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from '../lib/utils';

export function AnimatedGridPattern({
  width = 40,
  height = 40,
  x = -1,
  y = -1,
  strokeDasharray = 0,
  numSquares = 20,
  className,
  maxOpacity = 0.5,
  duration = 4,
  repeatDelay = 0.5,
  ...props
}) {
  const id = useId();
  const containerRef = useRef(null);
  const [squares, setSquares] = useState([]);

  const getPos = useCallback(
    (w, h) => [
      Math.floor((Math.random() * w) / width),
      Math.floor((Math.random() * h) / height),
    ],
    [height, width],
  );

  const generateSquares = useCallback(
    (count, w, h) =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        pos: getPos(w, h),
        delay: i * 0.1,
      })),
    [getPos],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        setSquares(generateSquares(numSquares, w, h));
      }
    });
    ro.observe(element);
    return () => ro.disconnect();
  }, [generateSquares, numSquares]);

  // CSS animation duration for a full fade-in → hold → fade-out → pause cycle
  const cycleDuration = duration * 2 + repeatDelay;

  return (
    <svg
      ref={containerRef}
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full hero-grid-svg',
        className,
      )}
      {...props}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <path
            d={`M.5 ${height}V.5H${width}`}
            fill="none"
            strokeDasharray={strokeDasharray}
            className="hero-grid-pattern-path"
          />
        </pattern>
        <style>{`
          @keyframes grid-square-pulse-${id} {
            0%, 100% { opacity: 0; }
            ${(duration / cycleDuration) * 50}%, ${100 - (duration / cycleDuration) * 50}% {
              opacity: ${maxOpacity};
            }
          }
        `}</style>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
      <svg x={x} y={y} className="overflow-visible">
        {squares.map(({ pos: [squareX, squareY], id: sqId, delay }) => (
          <rect
            key={sqId}
            width={width - 1}
            height={height - 1}
            x={squareX * width + 1}
            y={squareY * height + 1}
            fill="currentColor"
            strokeWidth="0"
            className="hero-grid-animated-square"
            style={{
              animation: `grid-square-pulse-${id} ${cycleDuration}s ease-in-out ${delay}s infinite`,
              opacity: 0,
            }}
          />
        ))}
      </svg>
    </svg>
  );
}

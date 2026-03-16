import { useEffect, useRef, useState } from 'react';

export default function ScrollingText({
  text,
  className = '',
  truncateWhenStatic = false,
}) {
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const viewportNode = viewportRef.current;
    const contentNode = contentRef.current;
    if (!viewportNode || !contentNode) return undefined;

    function measureOverflow() {
      setIsOverflowing(contentNode.scrollWidth > viewportNode.clientWidth + 4);
    }

    measureOverflow();

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measureOverflow);

    resizeObserver?.observe(viewportNode);
    resizeObserver?.observe(contentNode);
    window.addEventListener('resize', measureOverflow);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measureOverflow);
    };
  }, [text]);

  return (
    <div
      ref={viewportRef}
      className={`scrolling-text${className ? ` ${className}` : ''}`}
    >
      <div
        className={`scrolling-text-track${isOverflowing ? ' marquee' : ''}${truncateWhenStatic ? ' truncate-static' : ''}`}
      >
        <span ref={contentRef}>{text}</span>
        {isOverflowing && <span aria-hidden="true">{text}</span>}
      </div>
    </div>
  );
}

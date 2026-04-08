import {
  motion as Motion,
  useMotionValue,
  useSpring,
  useTransform,
  AnimatePresence,
} from 'framer-motion';
import { Children, cloneElement, useEffect, useRef, useState } from 'react';

function DockItem({
  children,
  className = '',
  onClick,
  mouseX,
  spring,
  distance,
  magnification,
  baseItemSize,
}) {
  const ref = useRef(null);
  const isHovered = useMotionValue(0);

  const mouseDistance = useTransform(mouseX, (val) => {
    const rect = ref.current?.getBoundingClientRect() ?? {
      x: 0,
      width: baseItemSize,
    };
    return val - rect.x - (rect.width || baseItemSize) / 2;
  });

  const targetSize = useTransform(
    mouseDistance,
    [-distance, 0, distance],
    [baseItemSize, magnification, baseItemSize],
  );
  const size = useSpring(targetSize, spring);

  return (
    <Motion.button
      ref={ref}
      style={{
        width: size,
        height: size,
      }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onBlur={() => isHovered.set(0)}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (onClick) onClick();
      }}
      whileTap={{ scale: 0.9 }}
      className={`dock-item ${className}`}
      type="button"
    >
      {Children.map(children, (child) => {
        // If the child is a component (like DockLabel), pass the isHovered motion value
        if (typeof child.type !== 'string') {
          // For icons, ensure they don't capture pointer events
          const isIcon = child.type === DockIcon;
          return cloneElement(child, {
            isHovered,
            style: isIcon ? { pointerEvents: 'none' } : undefined,
          });
        }
        return child;
      })}
    </Motion.button>
  );
}

function DockLabel({ children, className = '', ...rest }) {
  const { isHovered } = rest;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isHovered) return;
    const unsubscribe = isHovered.on('change', (latest) => {
      setIsVisible(latest === 1);
    });
    return () => unsubscribe();
  }, [isHovered]);

  return (
    <AnimatePresence>
      {isVisible && (
        <Motion.div
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: -42 }}
          exit={{ opacity: 0, y: 0 }}
          transition={{ duration: 0.2 }}
          className={`dock-label ${className}`}
          role="tooltip"
          style={{ x: '-50%' }}
        >
          {children}
        </Motion.div>
      )}
    </AnimatePresence>
  );
}

function DockIcon({ children, className = '', style = {} }) {
  return (
    <div className={`dock-icon ${className}`} style={style}>
      {children}
    </div>
  );
}

export default function Dock({
  items,
  className = '',
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = 72,
  distance = 140,
  panelHeight = 64,
  baseItemSize = 44,
}) {
  const mouseX = useMotionValue(Infinity);
  const isDockHovered = useMotionValue(0);

  return (
    <div className={`dock-outer ${className}`}>
      <Motion.div
        onMouseMove={(e) => {
          isDockHovered.set(1);
          mouseX.set(e.clientX);
        }}
        onMouseLeave={() => {
          isDockHovered.set(0);
          mouseX.set(Infinity);
        }}
        className="dock-panel"
        style={{ height: panelHeight }}
        role="toolbar"
        aria-label="Action dock"
      >
        {items.map((item, index) => (
          <DockItem
            key={index}
            onClick={item.onClick}
            className={item.className}
            mouseX={mouseX}
            spring={spring}
            distance={distance}
            magnification={magnification}
            baseItemSize={baseItemSize}
          >
            <DockIcon>{item.icon}</DockIcon>
            <DockLabel>{item.label}</DockLabel>
          </DockItem>
        ))}
      </Motion.div>
    </div>
  );
}

import React from 'react';

/**
 * DiscoveryMarqueeGrid
 *
 * Simplified grid wrapper that renders children into a native CSS grid.
 */
export default function DiscoveryMarqueeGrid({ children }) {
  if (!children || children.length === 0) return null;

  return <div className="dashboard-discovery-grid">{children}</div>;
}

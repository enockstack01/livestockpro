import { useLayoutEffect, useRef, useState } from 'react';

/* Grid for the "Farm at a glance" and Key Insights tiles: as many columns as
   fit with tiles at least `minTile` px wide (up to six), but never fewer
   than two — the same rule as the mobile app's TileGrid (ui/microViz.js).
   The column count is measured from the grid's own width rather than left
   to CSS functions, so every browser (including older mobile WebViews)
   lays the tiles out two or more per row. */
export default function TileGrid({ className, minTile = 150, gap = 10, children }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') {
      const onResize = () => setWidth(el.clientWidth);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = Math.min(6, Math.max(2, Math.floor((width + gap) / (minTile + gap))));
  // Narrow tiles (small phones) get tighter chart labels — see .tiles-tight.
  const tight = width > 0 && (width - gap * (cols - 1)) / cols < 165;
  return (
    <div ref={ref} className={`${className}${tight ? ' tiles-tight' : ''}`} style={{ display: 'grid', gap, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {children}
    </div>
  );
}

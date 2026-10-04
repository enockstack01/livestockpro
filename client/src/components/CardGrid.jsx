import { Children, createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { layoutCards } from '../../../shared/layout';

/* Chart cards side by side, at least two per row, more on wider screens —
   the packing rules live in shared/layout.js (the mobile app's CardGrid
   uses the same ones). A child's `wide` prop (true, or 'soft' for a
   series that also reads at half width) asks for two columns. Children
   can read useCardSize() to size their chart: `narrow` is true for a
   half-width card on a phone. */

const CardSizeContext = createContext({ narrow: false, cols: 2 });

export function useCardSize() {
  return useContext(CardSizeContext);
}

export default function CardGrid({ children, className = '' }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const el = ref.current;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const items = Children.toArray(children).filter(Boolean);
  const { cols, spans, position } = layoutCards(items.map((c) => ({ wide: c.props.wide || false })), width || 1);

  return (
    <div ref={ref} className={`card-grid ${className}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {items.map((child, i) => (
        <CardSizeContext.Provider key={child.key ?? i} value={{ cols, narrow: width < 600 && spans[i] < cols }}>
          <div className="card-grid-item" style={{ gridColumn: `span ${spans[i]}`, order: position[i] }}>{child}</div>
        </CardSizeContext.Provider>
      ))}
    </div>
  );
}

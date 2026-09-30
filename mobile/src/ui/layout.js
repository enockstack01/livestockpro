import { Children, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

/* Breakpoints mirror client/src/style.css's media queries (480 / 768 /
   1024): from 768px up (tablets) the green sidebar is pinned open; below
   that it becomes a slide-in drawer behind the topbar's hamburger — the
   same split the web app uses. */
export const BREAKPOINTS = { phone: 600, tablet: 768, wide: 1024 };

export function useBreakpoint() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isPhone: width < BREAKPOINTS.phone,
    isTablet: width >= BREAKPOINTS.tablet,
    isWide: width >= BREAKPOINTS.wide,
  };
}

/* CSS-grid stand-in. Two modes, matching the two grid styles the web uses:
   - minItemWidth: `repeat(auto-fill, minmax(min, 1fr))` — as many equal
     columns as fit (summary cards, finance cards, chart rows); `columns`
     alongside it caps the count.
   - columns (no minItemWidth): a 6-track grid where each child takes `span`
     tracks (the analytics grid). It adapts to the space it actually has:
     full width under 640px, thirds widen to halves under 980px, and when a
     row isn't full its last card stretches to close the gap — rows always
     fill edge to edge. */
/* fit: like CSS `auto-fit` (vs `auto-fill`) — never more columns than
   items, so a few cards stretch across the row instead of leaving empty
   tracks (the web's .finance-summary). */
export function Grid({ children, minItemWidth, columns, gap = 16, fillLast, fit, style }) {
  const [w, setW] = useState(0);
  const items = Children.toArray(children).filter(Boolean);

  let widths = [];
  if (w > 0) {
    if (minItemWidth) {
      let cols = Math.max(1, Math.floor((w + gap) / (minItemWidth + gap)));
      if (columns) cols = Math.min(cols, columns);
      if (fit) cols = Math.max(1, Math.min(cols, items.length));
      const track = (w - gap * (cols - 1)) / cols;
      widths = items.map(() => track);
      // fillLast: a short final row shares the full width instead of leaving a gap.
      const rest = items.length % cols;
      if (fillLast && rest) {
        const wide = (w - gap * (rest - 1)) / rest;
        for (let i = items.length - rest; i < items.length; i++) widths[i] = wide;
      }
    } else {
      const cols = columns || 6;
      const track = (w - gap * (cols - 1)) / cols;
      const spans = items.map((c) => {
        const span = Math.min(cols, c.props?.span || cols);
        if (w < 640) return cols;
        if (w < 980) return Math.max(span, Math.ceil(cols / 2));
        return span;
      });
      // Pack into rows; a row that can't take the next card gives its
      // leftover tracks to its own last card.
      let used = 0;
      spans.forEach((span, i) => {
        if (used + span > cols) { spans[i - 1] += cols - used; used = 0; }
        used += span;
      });
      if (used > 0 && used < cols) spans[spans.length - 1] += cols - used;
      widths = spans.map((span) => track * span + gap * (span - 1));
    }
  }

  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap }, style]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && items.map((child, i) => <View key={child.key ?? i} style={{ width: widths[i] }}>{child}</View>)}
    </View>
  );
}

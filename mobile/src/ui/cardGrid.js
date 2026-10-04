import { Children, createContext, useContext, useState } from 'react';
import { View } from 'react-native';
import { layoutCards } from '../../../shared/layout';

/* Chart cards side by side — at least two per row, more on tablets — with
   the same packing rules as the web's client/src/components/CardGrid.jsx
   (shared/layout.js). A child's `wide` prop (true, or 'soft' for a series
   that also reads at half width) asks for two columns. Charts read
   useCardSize(): `narrow` is true for a half-width card on a phone, where
   they draw shorter with smaller type. */

const CardSizeContext = createContext({ narrow: false, cols: 2 });

export function useCardSize() {
  return useContext(CardSizeContext);
}

export function CardGrid({ children, gap, style }) {
  const [w, setW] = useState(0);
  const items = Children.toArray(children).filter(Boolean);
  const { cols, spans, position } = layoutCards(items.map((c) => ({ wide: c.props.wide || false })), w || 1);
  const g = gap ?? (w < 600 ? 10 : 16);
  const ordered = items.map((child, i) => ({ child, i })).sort((a, b) => position[a.i] - position[b.i]);
  /* Explicit rows of flex cells (flex = span) rather than flex-wrap, so
     sub-pixel rounding on the phone can't push a card onto its own line.
     layoutCards' spans always add up to whole rows. */
  const rows = [];
  let row = [];
  let used = 0;
  ordered.forEach((it) => {
    row.push(it);
    used += spans[it.i];
    if (used >= cols) { rows.push(row); row = []; used = 0; }
  });
  if (row.length) rows.push(row);
  return (
    <View style={[{ gap: g, marginBottom: w < 600 ? 18 : 24 }, style]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && rows.map((r, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: g, alignItems: 'stretch' }}>
          {r.map(({ child, i }) => (
            <CardSizeContext.Provider key={child.key ?? i} value={{ cols, narrow: w < 600 && spans[i] < cols }}>
              <View style={{ flex: spans[i], flexBasis: 0, minWidth: 0 }}>{child}</View>
            </CardSizeContext.Provider>
          ))}
        </View>
      ))}
    </View>
  );
}

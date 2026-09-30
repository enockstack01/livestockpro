import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

/* .data-table from client/src/style.css. When the card is wide enough it
   renders the same table as the web (uppercase header row on the page
   background, hairline row dividers, bold first column, actions at the end;
   scrolls sideways if the columns still don't fit). On a phone-width card it
   switches to one stacked block per row — first column as the heading,
   the rest as label/value pairs — so nothing needs sideways scrolling.

   columns: [{ key, label, render?(row) -> node|string, strong?, minWidth? }]
   actions?(row) -> node   (edit/delete buttons) */
export default function DataTable({ columns, rows, keyField = 'id', actions, actionsLabel, empty, stackBelow = 520 }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [w, setW] = useState(0);

  const cell = (col, row) => {
    const v = col.render ? col.render(row) : row[col.key];
    if (v === null || v === undefined || v === '') return <Text style={s.td}>—</Text>;
    return typeof v === 'string' || typeof v === 'number'
      ? <Text style={[s.td, col.strong && s.strong]} numberOfLines={2}>{v}</Text>
      : v;
  };

  if (rows.length === 0) return <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>{empty}</View>;

  const stacked = w > 0 && w < stackBelow;

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w === 0 ? null : stacked ? (
        rows.map((row, i) => (
          <View key={row[keyField] ?? i} style={[s.stackRow, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={s.stackHead}>
              <View style={{ flexShrink: 1 }}>{cell({ ...columns[0], strong: true }, row)}</View>
              {actions ? <View style={s.actions}>{actions(row)}</View> : null}
            </View>
            {columns.slice(1).map((col) => (
              <View key={col.key} style={s.stackPair}>
                <Text style={s.stackLabel}>{col.label}</Text>
                <View style={s.stackValue}>{cell(col, row)}</View>
              </View>
            ))}
          </View>
        ))
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: w }}>
          <View style={{ flex: 1 }}>
            <View style={[s.tr, s.thead]}>
              {columns.map((col) => <Text key={col.key} style={[s.th, s.col, col.minWidth && { minWidth: col.minWidth }]} numberOfLines={1}>{col.label}</Text>)}
              {actions ? <Text style={[s.th, s.actionsCol]}>{actionsLabel}</Text> : null}
            </View>
            {rows.map((row, i) => (
              <View key={row[keyField] ?? i} style={[s.tr, i < rows.length - 1 && s.trBorder]}>
                {columns.map((col) => <View key={col.key} style={[s.col, s.tdWrap, col.minWidth && { minWidth: col.minWidth }]}>{cell(col, row)}</View>)}
                {actions ? <View style={[s.actionsCol, s.tdWrap]}><View style={s.actions}>{actions(row)}</View></View> : null}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    tr: { flexDirection: 'row', alignItems: 'center' },
    thead: { backgroundColor: colors.bg, borderBottomWidth: 1.5, borderBottomColor: colors.border },
    trBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
    th: { paddingVertical: 12, paddingHorizontal: 14, fontSize: 12, fontWeight: '600', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.3 },
    col: { flex: 1, minWidth: 110 },
    actionsCol: { width: 96 },
    tdWrap: { paddingVertical: 12, paddingHorizontal: 14, justifyContent: 'center' },
    td: { fontSize: 13, color: colors.text },
    strong: { fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 4 },

    stackRow: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 6 },
    stackHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 2 },
    stackPair: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    stackLabel: { width: 118, fontSize: 11, fontWeight: '600', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.3 },
    stackValue: { flex: 1, alignItems: 'flex-start' },
  });
}

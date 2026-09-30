import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { haptics } from '../lib/haptics';

/* .data-table from client/src/style.css. When the card is wide enough it
   renders the web's table (uppercase header row, hairline row dividers,
   bold first column, actions at the end; scrolls sideways if the columns
   still don't fit). On a phone-width card it switches to:
   - with `summary(row)` → compact list rows, as in the CropManager app: a
     bold title, one subtitle line, then a badge and a short meta line, with
     the edit/delete buttons at the right;
   - without it → one stacked block per row (heading + label/value pairs).
   `onRowPress(row)` makes rows tappable (e.g. to open a details view).

   columns: [{ key, label, render?(row) -> node|string, strong?, minWidth? }]
   summary?(row) -> { title: node|string, subtitle?, badge?: node, meta? }
   actions?(row) -> node   (edit/delete buttons) */
export default function DataTable({ columns, rows, keyField = 'id', actions, actionsLabel, empty, summary, onRowPress, stackBelow = 520 }) {
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
  const text = (v, style, lines) => (typeof v === 'string' || typeof v === 'number' ? <Text style={style} numberOfLines={lines}>{v}</Text> : v);
  const press = onRowPress ? (row) => () => { haptics.tap(); onRowPress(row); } : () => undefined;

  if (rows.length === 0) return <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>{empty}</View>;

  const stacked = w > 0 && w < stackBelow;

  let body = null;
  if (w > 0 && stacked && summary) {
    body = rows.map((row, i) => {
      const v = summary(row);
      return (
        <Pressable key={row[keyField] ?? i} onPress={press(row)} disabled={!onRowPress} style={({ pressed }) => [s.listRow, i === rows.length - 1 && { borderBottomWidth: 0 }, pressed && { backgroundColor: colors.bg }]}>
          <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
            {text(v.title, s.listTitle, 2)}
            {v.subtitle ? text(v.subtitle, s.listSub, 2) : null}
            {v.badge || v.meta ? (
              <View style={s.listMetaRow}>
                {v.badge || null}
                {v.meta ? text(v.meta, s.listSub, 1) : null}
              </View>
            ) : null}
          </View>
          {actions ? <View style={s.actions}>{actions(row)}</View> : null}
        </Pressable>
      );
    });
  } else if (w > 0 && stacked) {
    body = rows.map((row, i) => (
      <Pressable key={row[keyField] ?? i} onPress={press(row)} disabled={!onRowPress} style={({ pressed }) => [s.stackRow, i === rows.length - 1 && { borderBottomWidth: 0 }, pressed && { backgroundColor: colors.bg }]}>
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
      </Pressable>
    ));
  } else if (w > 0) {
    body = (
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: w }}>
        <View style={{ flex: 1 }}>
          <View style={[s.tr, s.thead]}>
            {columns.map((col) => <Text key={col.key} style={[s.th, s.col, col.minWidth && { minWidth: col.minWidth }]} numberOfLines={1}>{col.label}</Text>)}
            {actions ? <Text style={[s.th, s.actionsCol]}>{actionsLabel}</Text> : null}
          </View>
          {rows.map((row, i) => (
            <Pressable key={row[keyField] ?? i} onPress={press(row)} disabled={!onRowPress} style={({ pressed }) => [s.tr, i < rows.length - 1 && s.trBorder, pressed && { backgroundColor: colors.bg }]}>
              {columns.map((col) => <View key={col.key} style={[s.col, s.tdWrap, col.minWidth && { minWidth: col.minWidth }]}>{cell(col, row)}</View>)}
              {actions ? <View style={[s.actionsCol, s.tdWrap]}><View style={s.actions}>{actions(row)}</View></View> : null}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    );
  }

  return <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>{body}</View>;
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

    listRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingLeft: 16, paddingRight: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    listTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
    listSub: { fontSize: 12, color: colors.textLight },
    listMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 },

    stackRow: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 6 },
    stackHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 2 },
    stackPair: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    stackLabel: { width: 118, fontSize: 11, fontWeight: '600', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.3 },
    stackValue: { flex: 1, alignItems: 'flex-start' },
  });
}

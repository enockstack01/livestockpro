import { Children, useId, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';

/* Small charts for dashboard tiles — the native twins of the web's
   client/src/components/dashboard/MicroViz.jsx: sparkline, mini columns
   (diverging around zero when values go negative), meter, ring gauge and
   two-part split bar. 2px lines, a dot on the latest point, rounded
   data-ends, 2px gaps between fills. Every chart prints its numbers:
   columns carry their value, and a sparkline is paired with SeriesValues. */

export function Sparkline({ values, color, height = 40 }) {
  const gid = 'sp' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [w, setW] = useState(0);
  const n = values.length;
  let line = '';
  let area = '';
  let last = null;
  if (w > 0 && n) {
    const max = Math.max(...values);
    const min = Math.min(0, ...values);
    const span = max - min || 1;
    const x = (i) => ((i + 0.5) * w) / n; // centred in equal slots, like SeriesValues
    const y = (v) => 5 + (1 - (v - min) / span) * (height - 10);
    line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    area = `${line}L${x(n - 1).toFixed(1)},${height}L${x(0).toFixed(1)},${height}Z`;
    last = [x(n - 1), y(values[n - 1])];
  }
  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && n ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.22" />
              <Stop offset="1" stopColor={color} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Path d={area} fill={`url(#${gid})`} />
          <Path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <SurfaceDot x={last[0]} y={last[1]} color={color} />
        </Svg>
      ) : null}
    </View>
  );
}

/* Each sparkline point's value, in the same equal slots as the points;
   optional month names beneath. */
export function SeriesValues({ values, fmt = String, months }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 4 }}>
      <View style={{ flexDirection: 'row' }}>
        {values.map((v, i) => <Text key={i} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, fontWeight: '700', color: colors.text }}>{fmt(v)}</Text>)}
      </View>
      {months ? (
        <View style={{ flexDirection: 'row' }}>
          {months.map((m, i) => <Text key={i} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, color: colors.textLight }}>{m}</Text>)}
        </View>
      ) : null}
    </View>
  );
}

function SurfaceDot({ x, y, color }) {
  const { colors } = useTheme();
  return <Circle cx={x} cy={y} r={4} fill={color} stroke={colors.card} strokeWidth={2} />;
}

export function MiniColumns({ values, color, negColor, height = 40, valueFmt = String }) {
  const { colors } = useTheme();
  if (!values.length) return null;
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const zero = (max / span) * height; // distance of the zero line from the top
  return (
    <View style={{ height, flexDirection: 'row', gap: 4, marginTop: 14, marginBottom: min < 0 ? 14 : 0 }}>
      {min < 0 ? <View style={{ position: 'absolute', left: 0, right: 0, top: zero, height: 1, backgroundColor: colors.border }} /> : null}
      {values.map((v, i) => {
        const h = v === 0 ? 0 : Math.max(2, (Math.abs(v) / span) * height);
        const neg = v < 0;
        return (
          <View key={i} style={{ flex: 1 }}>
            <View
              style={{
                position: 'absolute', left: 0, right: 0, height: h,
                backgroundColor: neg && negColor ? negColor : color,
                ...(neg ? { top: zero, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 } : { bottom: height - zero, borderTopLeftRadius: 4, borderTopRightRadius: 4 }),
              }}
            />
            <Text numberOfLines={1} style={{ position: 'absolute', left: -8, right: -8, textAlign: 'center', fontSize: 9.5, fontWeight: '700', color: colors.text, ...(neg ? { top: zero + h + 2 } : { bottom: height - zero + h + 2 }) }}>{valueFmt(v)}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function Meter({ value, max, color, style }) {
  const { colors } = useTheme();
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <View style={[{ height: 8, borderRadius: 4, backgroundColor: colors.bg, overflow: 'hidden' }, style]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: value }}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

export function Ring({ pct, color, size = 68, stroke = 7, label }) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const len = (Math.max(0, Math.min(100, pct)) / 100) * circ;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.bg} strokeWidth={stroke} fill="none" />
          {len > 0 ? <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${len} ${circ}`} /> : null}
        </Svg>
      </View>
      <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{label}</Text>
    </View>
  );
}

/* parts: [{ key, value, color }] */
export function SplitBar({ parts }) {
  const { colors } = useTheme();
  const shown = parts.filter((p) => p.value > 0);
  return (
    <View style={{ flexDirection: 'row', gap: 2, height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.bg }}>
      {shown.map((p) => <View key={p.key} style={{ flex: p.value, backgroundColor: p.color }} />)}
    </View>
  );
}

/* Tile grid matching the web's .glance-grid / .insight-tiles: as many
   columns as fit with tiles at least minTile wide (up to six), but never
   fewer than two. A child with `wide` spans the whole row. */
export function TileGrid({ children, gap = 10, minTile = 150 }) {
  const [w, setW] = useState(0);
  const items = Children.toArray(children).filter(Boolean);
  const cols = Math.min(6, Math.max(2, Math.floor((w + gap) / (minTile + gap))));
  const track = (w - gap * (cols - 1)) / cols;
  const widthOf = (child) => {
    if (!child.props?.wide) return track;
    return w;
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && items.map((child, i) => <View key={child.key ?? i} style={{ width: widthOf(child) }}>{child}</View>)}
    </View>
  );
}

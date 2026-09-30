import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal as RNModal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../components/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { tone } from '../../../shared/statusMaps';
import { useBreakpoint } from './layout';
import { haptics } from '../lib/haptics';

/* .main-content: the scrolling page body — 16px gutters on phones, 28px
   from tablets up, content capped at 1400px and centered on big screens. */
export function Page({ children, refreshing, onRefresh }) {
  const { colors } = useTheme();
  const { isTablet, isWide } = useBreakpoint();
  const gutter = isTablet ? 28 : 16;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[{ paddingHorizontal: gutter, paddingTop: 20, paddingBottom: 40 }, isWide && { width: '100%', maxWidth: 1400, alignSelf: 'center' }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

/* React Native counterparts of client/src/style.css's component classes —
   same names, same measurements (padding, radii, font sizes, weights), same
   theme tokens — so every mobile screen is assembled from the exact pieces
   the web pages use: .page-header, .card/.card-header/.card-body, .btn-*,
   .btn-icon, .summary-card, .finance-card, .tabs, .filter-bar,
   .form-group/.form-control, .badge-*, .empty-state, .modal. */

export function useKitStyles() {
  const { colors, radius, shadow, shadowLg, scheme } = useTheme();
  return useMemo(() => makeStyles(colors, radius, shadow, shadowLg, scheme), [colors, radius, shadow, shadowLg, scheme]);
}

/* .summary-icon/.badge-* tints: the web mixes the hue 16% into the card
   color (color-mix); the shared badge tones are that mix, precomputed. */
export function useTint(name) {
  const { scheme } = useTheme();
  return tone(name, scheme === 'dark');
}

export function PageHeader({ title, subtitle, children }) {
  const s = useKitStyles();
  const { width } = useBreakpoint();
  return (
    <View style={[s.pageHeader, width <= 768 && { flexDirection: 'column', alignItems: 'flex-start' }]}>
      <View style={{ flexShrink: 1 }}>
        <Text style={s.pageTitle}>{title}</Text>
        {subtitle ? <Text style={s.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {children ? <View style={s.pageActions}>{children}</View> : null}
    </View>
  );
}

export function Card({ children, style, danger }) {
  const s = useKitStyles();
  return <View style={[s.card, danger && s.cardDanger, style]}>{children}</View>;
}

export function CardHeader({ title, icon, iconColor, right, titleColor }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  return (
    <View style={s.cardHeader}>
      <View style={s.cardHeaderTitleRow}>
        {icon ? <Icon name={icon} size={14} color={iconColor || colors.primary} /> : null}
        <Text style={[s.cardHeaderTitle, titleColor && { color: titleColor }]} numberOfLines={2}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function CardBody({ children, flush, style }) {
  const s = useKitStyles();
  return <View style={[flush ? null : s.cardBody, style]}>{children}</View>;
}

/* .btn / .btn-primary / .btn-secondary / .btn-danger (+ .btn-sm) */
export function Button({ title, icon, onPress, variant = 'primary', size, disabled, loading, style, block }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  const fg = variant === 'secondary' ? colors.text : colors.white;
  return (
    <Pressable
      onPress={onPress ? () => { haptics.tap(); onPress(); } : undefined}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, s[`btn_${variant}`], size === 'sm' && s.btnSm, block && { alignSelf: 'stretch' }, (disabled || loading) && { opacity: 0.6 }, pressed && { opacity: 0.85 }, style]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={size === 'sm' ? 11 : 13} color={fg} /> : null}
      {title ? <Text style={[s.btnText, size === 'sm' && s.btnTextSm, { color: fg }]}>{title}</Text> : null}
    </Pressable>
  );
}

/* .btn-icon (+ .danger) — the edit/delete buttons in table rows. */
export function IconButton({ icon, onPress, danger, label }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityLabel={label} style={({ pressed }) => [s.btnIcon, pressed && { backgroundColor: danger ? colors.red + '22' : colors.primaryLight }]}>
      <Icon name={icon} size={14} color={danger ? colors.red : colors.textLight} />
    </Pressable>
  );
}

/* .summary-card: 48px tinted icon tile + big number + label. */
export function SummaryCard({ icon, color = 'green', value, label, onPress }) {
  const s = useKitStyles();
  const tint = useTint(color);
  const { colors } = useTheme();
  const fg = color === 'green' ? colors.primary : colors[color] || tint.fg;
  const { width } = useBreakpoint();
  const compact = width <= 768; // style.css shrinks .summary-card at ≤768px
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} style={[s.summaryCard, compact && { padding: 14, gap: 10 }]}>
      <View style={[s.summaryIcon, { backgroundColor: tint.bg }, compact && { width: 40, height: 40 }]}><Icon name={icon} size={compact ? 16 : 20} color={fg} /></View>
      <View style={{ flexShrink: 1 }}>
        <Text style={[s.summaryValue, compact && { fontSize: 18, lineHeight: 23 }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        <Text style={s.summaryLabel}>{label}</Text>
      </View>
    </Wrapper>
  );
}

/* .finance-card: uppercase caption over a big centered amount. */
export function FinanceCard({ label, value, color }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  return (
    <View style={s.financeCard}>
      <Text style={s.financeLabel}>{label}</Text>
      <Text style={[s.financeAmount, { color: color || colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

/* .tabs / .tab-btn — underlined, horizontally scrollable on narrow screens. */
export function Tabs({ items, value, onChange }) {
  const s = useKitStyles();
  return (
    <View style={s.tabsWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {items.map((it) => {
          const active = it.value === value;
          return (
            <Pressable key={it.value} onPress={() => { haptics.select(); onChange(it.value); }} style={[s.tabBtn, active && s.tabBtnActive]}>
              <Text style={[s.tabText, active && s.tabTextActive]}>{it.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* .segmented — the analytics 6/12-month toggle. */
export function Segmented({ items, value, onChange }) {
  const s = useKitStyles();
  return (
    <View style={s.segmented}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <Pressable key={it.value} onPress={() => { haptics.select(); onChange(it.value); }} style={[s.segBtn, active && s.segBtnActive]}>
            <Text style={[s.segText, active && s.segTextActive]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FilterBar({ children }) {
  const s = useKitStyles();
  const { width } = useBreakpoint();
  // Stacked filters must not wrap — a wrapping column sizes to its widest item instead of stretching.
  return <View style={[s.filterBar, width <= 768 && { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' }]}>{children}</View>;
}

/* .empty-state */
export function EmptyState({ icon = 'inbox', title, message, compact }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.empty, compact && { paddingVertical: 30 }]}>
      <Icon name={icon} size={36} color={colors.border} />
      {title ? <Text style={s.emptyTitle}>{title}</Text> : null}
      {message ? <Text style={s.emptyText}>{message}</Text> : null}
    </View>
  );
}

/* .badge + .badge-{green,orange,red,blue,purple,gray} */
export function Badge({ label, color = 'green', icon }) {
  const s = useKitStyles();
  const tint = useTint(color);
  if (!label) return null;
  return (
    <View style={[s.badge, { backgroundColor: tint.bg }]}>
      {icon ? <Icon name={icon} size={10} color={tint.fg} /> : null}
      <Text style={[s.badgeText, { color: tint.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/* .form-group + label */
export function FormGroup({ label, required, children, style }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.formGroup, style]}>
      {label ? <Text style={s.formLabel}>{label}{required ? <Text style={{ color: colors.red }}> *</Text> : null}</Text> : null}
      {children}
    </View>
  );
}

/* .form-control (text / number / textarea) */
export function Input({ multiline, style, ...props }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.placeholder}
      multiline={multiline}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[s.control, multiline && s.textarea, focused && s.controlFocused, style]}
      {...props}
    />
  );
}

/* select.form-control — a field showing the chosen option with the web's
   chevron; tapping opens the option list (the browser renders <select>
   natively, a phone needs a sheet). */
export function Select({ value, options, onChange, placeholder, compact }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const items = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const current = items.find((o) => o.value === value);
  return (
    <>
      <Pressable style={[s.control, s.selectControl, compact && s.selectCompact]} onPress={() => setOpen(true)}>
        <Text style={[s.selectText, !current && { color: colors.placeholder }]} numberOfLines={1}>{current ? current.label : placeholder || ''}</Text>
        <Icon name="caret-down" size={12} color={colors.textLight} />
      </Pressable>
      <Modal open={open} onClose={() => setOpen(false)} title={placeholder || ''} maxWidth={420}>
        <FlatList
          data={items}
          keyExtractor={(o) => String(o.value) || '(empty)'}
          scrollEnabled={false}
          renderItem={({ item }) => {
            const active = item.value === value;
            return (
              <Pressable onPress={() => { haptics.select(); onChange(item.value); setOpen(false); }} style={[s.option, active && s.optionActive]}>
                <Text style={[s.optionText, active && { color: colors.primary, fontWeight: '700' }]}>{item.label}</Text>
                {active ? <Icon name="check" size={14} color={colors.primary} /> : null}
              </Pressable>
            );
          }}
        />
      </Modal>
    </>
  );
}

/* .modal: centered dialog — header / scrollable body / tinted footer. */
export function Modal({ open, onClose, title, children, footer, maxWidth = 560 }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.modal, { maxWidth }]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle} numberOfLines={1}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={s.modalClose}><Icon name="xmark" size={16} color={colors.textLight} /></Pressable>
          </View>
          <ScrollView style={s.modalBodyScroll} contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={s.modalFooter}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

export function Muted({ children, style }) {
  const s = useKitStyles();
  return <Text style={[s.muted, style]}>{children}</Text>;
}

export function Spinner() {
  const { colors } = useTheme();
  return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
}

export function useT() {
  return useTranslation().t;
}

function makeStyles(colors, radius, shadow, shadowLg) {
  const cardShadow = { shadowColor: shadow.color, shadowOpacity: shadow.opacity, shadowRadius: shadow.radius, shadowOffset: shadow.offset, elevation: shadow.elevation };
  return StyleSheet.create({
    pageHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24 },
    pageTitle: { fontSize: 24, fontWeight: '700', color: colors.text },
    pageSubtitle: { fontSize: 13, color: colors.textLight, marginTop: 2 },
    pageActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

    card: { backgroundColor: colors.card, borderRadius: 10, overflow: 'hidden', ...cardShadow },
    cardDanger: { borderWidth: 1.5, borderColor: colors.red },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
    cardHeaderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
    cardHeaderTitle: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
    cardBody: { padding: 20 },

    btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
    btn_primary: { backgroundColor: colors.primary },
    btn_secondary: { backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 8.5 },
    btn_danger: { backgroundColor: colors.red },
    btnSm: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
    btnText: { fontSize: 14, fontWeight: '600' },
    btnTextSm: { fontSize: 12 },
    btnIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

    summaryCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, backgroundColor: colors.card, borderRadius: 10, padding: 20, ...cardShadow },
    summaryIcon: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    summaryValue: { fontSize: 22, fontWeight: '700', color: colors.text, lineHeight: 27 },
    summaryLabel: { fontSize: 12, fontWeight: '500', color: colors.textLight, marginTop: 2 },

    financeCard: { backgroundColor: colors.card, borderRadius: 10, padding: 20, alignItems: 'center', ...cardShadow },
    financeLabel: { fontSize: 12, fontWeight: '600', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, textAlign: 'center' },
    financeAmount: { fontSize: 26, fontWeight: '800' },

    tabsWrap: { borderBottomWidth: 2, borderBottomColor: colors.border, marginBottom: 20 },
    tabBtn: { paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -2 },
    tabBtnActive: { borderBottomColor: colors.primary },
    tabText: { fontWeight: '600', color: colors.textLight, fontSize: 14 },
    tabTextActive: { color: colors.primary },

    segmented: { flexDirection: 'row', padding: 3, gap: 2, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start' },
    segBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
    segBtnActive: { backgroundColor: colors.primary },
    segText: { fontSize: 13, fontWeight: '600', color: colors.textLight },
    segTextActive: { color: colors.white },

    filterBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 20 },

    empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 6 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 8, textAlign: 'center' },
    emptyText: { fontSize: 13, color: colors.textLight, textAlign: 'center' },

    badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, alignSelf: 'flex-start' },
    badgeText: { fontSize: 11, fontWeight: '600' },

    formGroup: { marginBottom: 18 },
    formLabel: { fontSize: 13, fontWeight: '500', color: colors.text, marginBottom: 6 },
    control: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, fontSize: 14, color: colors.text, backgroundColor: colors.card },
    controlFocused: { borderColor: colors.primary },
    textarea: { minHeight: 80, textAlignVertical: 'top' },
    selectControl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    selectCompact: { paddingVertical: 8, paddingHorizontal: 12, minWidth: 160 },
    selectText: { fontSize: 14, color: colors.text, flexShrink: 1 },
    option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
    optionActive: {},
    optionText: { fontSize: 14, color: colors.text },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
    modal: { width: '100%', maxHeight: '90%', backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden', shadowColor: shadowLg.color, shadowOpacity: shadowLg.opacity, shadowRadius: shadowLg.radius, shadowOffset: shadowLg.offset, elevation: shadowLg.elevation },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, flex: 1 },
    modalClose: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    modalBodyScroll: { flexGrow: 0 },
    modalBody: { padding: 24 },
    modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 24, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },

    muted: { color: colors.textLight, fontSize: 13, lineHeight: 19 },
  });
}

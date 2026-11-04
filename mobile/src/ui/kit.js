import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Keyboard, KeyboardAvoidingView, Modal as RNModal, PanResponder, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Icon from '../components/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { tone } from '../../../shared/statusMaps';
import { useBreakpoint } from './layout';
import { haptics } from '../lib/haptics';

/* The phone UI kit, built to the CropManager mobile app's design (the
   Agriplan style, mobile/src/components/ui.tsx, Button.tsx and Sheet.tsx
   there): flat 16 radius cards with a Fern border, pill buttons and
   badges, round 44px icon buttons, 48px inputs, solid round icons on the
   stat cards, and bottom sheets for every dialog and picker on phones
   (a centred dialog on tablets). Same component names and props as before,
   so every screen picks the design up. */

/* The title the app bar is showing; PageHeader leaves out a title that
   repeats it (the app bar already says where you are). */
export const AppBarTitleContext = createContext('');

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

export function useKitStyles() {
  const { colors, radius, shadowLg, scheme } = useTheme();
  return useMemo(() => makeStyles(colors, radius, shadowLg, scheme), [colors, radius, shadowLg, scheme]);
}

/* Solid tone fills with their glyph colour (the shared badge tones). */
export function useTint(name) {
  const { scheme } = useTheme();
  return tone(name, scheme === 'dark');
}

/* Lead in for a screen: the intro line and the main actions. A title the
   app bar already shows is kept only as the screen reader heading. */
export function PageHeader({ title, subtitle, children }) {
  const s = useKitStyles();
  const barTitle = useContext(AppBarTitleContext);
  const showTitle = !!title && title !== barTitle;
  return (
    <View style={s.pageHeader} accessible={!children} accessibilityRole="header" accessibilityLabel={title}>
      {showTitle ? <Text style={s.pageTitle}>{title}</Text> : null}
      {subtitle ? <Text style={[s.pageSubtitle, !showTitle && { marginTop: 0 }]}>{subtitle}</Text> : null}
      {children ? <View style={s.pageActions}>{children}</View> : null}
    </View>
  );
}

export function Card({ children, style, danger }) {
  const s = useKitStyles();
  return <View style={[s.card, danger && s.cardDanger, style]}>{children}</View>;
}

export function CardHeader({ title, icon, iconColor, right, titleColor, compact, tiled }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.cardHeader, compact && s.cardHeaderCompact]}>
      <View style={s.cardHeaderTitleRow}>
        {icon && tiled ? (
          // Chart cards: the icon on a solid round tile.
          <View style={[s.cardHeaderIconTile, { backgroundColor: iconColor || colors.leaf }]}><Icon name={icon} size={compact ? 11 : 12} color={iconColor === colors.orange ? colors.text : '#FFFFFF'} /></View>
        ) : icon ? <Icon name={icon} size={compact ? 13 : 15} color={iconColor || colors.primary} /> : null}
        <Text style={[s.cardHeaderTitle, compact && s.cardHeaderTitleCompact, titleColor && { color: titleColor }]} numberOfLines={2}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function CardBody({ children, flush, style }) {
  const s = useKitStyles();
  return <View style={[flush ? null : s.cardBody, style]}>{children}</View>;
}

/* Pill buttons, bold label with the icon before it, 48px tall (44px small).
   primary: Leaf (Forest in dark mode), secondary: outlined card, danger:
   Alert Red, ghost: text only. */
export function Button({ title, icon, onPress, variant = 'primary', size, disabled, loading, style, block }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  const fg = variant === 'secondary' ? colors.text : variant === 'ghost' ? colors.primary : colors.white;
  return (
    <Pressable
      onPress={onPress ? () => { haptics.tap(); onPress(); } : undefined}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [s.btn, s[`btn_${variant}`], size === 'sm' && s.btnSm, block && { alignSelf: 'stretch' }, (disabled || loading) && { opacity: 0.6 }, pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] }, style]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={size === 'sm' ? 12 : 13} color={fg} /> : null}
      {title ? <Text style={[s.btnText, size === 'sm' && s.btnTextSm, { color: fg }]} numberOfLines={1}>{title}</Text> : null}
    </Pressable>
  );
}

/* Round 44px icon button (row actions, sheet close). */
export function IconButton({ icon, onPress, danger, label, color }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress ? () => { haptics.select(); onPress(); } : undefined} hitSlop={4} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [s.btnIcon, pressed && { backgroundColor: danger ? colors.red + '22' : colors.primaryLight }]}>
      <Icon name={icon} size={15} color={color || (danger ? colors.red : colors.heading)} />
    </Pressable>
  );
}

/* Stat card: a solid round icon, the number and what it counts. */
export function SummaryCard({ icon, color = 'green', value, label, onPress }) {
  const s = useKitStyles();
  const tint = useTint(color);
  const { width } = useBreakpoint();
  const compact = width <= 768;
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${label}: ${value}`} style={[s.summaryCard, compact && { padding: 14, gap: 8 }]}>
      <View style={[s.summaryIcon, { backgroundColor: tint.bg }, compact && { width: 36, height: 36 }]}><Icon name={icon} size={compact ? 14 : 16} color={tint.fg} /></View>
      <View>
        <Text style={[s.summaryValue, compact && { fontSize: 22, lineHeight: 27 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{value}</Text>
        <Text style={s.summaryLabel} numberOfLines={2}>{label}</Text>
      </View>
    </Wrapper>
  );
}

/* Centered label / amount tile. */
export function FinanceCard({ label, value, color }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  return (
    <View style={s.financeCard}>
      <Text style={s.financeLabel} numberOfLines={2}>{label}</Text>
      <Text style={[s.financeAmount, { color: color || colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{value}</Text>
    </View>
  );
}

/* Filter chips: pills in a sideways scrolling row, the chosen one filled. */
export function Tabs({ items, value, onChange }) {
  const s = useKitStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsWrap} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <Pressable key={it.value} onPress={() => { haptics.select(); onChange(it.value); }} accessibilityRole="tab" accessibilityState={{ selected: active }} style={[s.tabBtn, active && s.tabBtnActive]}>
            <Text style={[s.tabText, active && s.tabTextActive]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* Two or three options in one pill (the analytics 6/12-month toggle). */
export function Segmented({ items, value, onChange }) {
  const s = useKitStyles();
  return (
    <View style={s.segmented}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <Pressable key={it.value} onPress={() => { haptics.select(); onChange(it.value); }} accessibilityRole="tab" accessibilityState={{ selected: active }} style={[s.segBtn, active && s.segBtnActive]}>
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

/* Tinted icon circle, title, muted text and an optional action button. */
export function EmptyState({ icon = 'inbox', title, message, compact, actionLabel, onAction }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.empty, compact && { paddingVertical: 28 }]}>
      <View style={[s.emptyIcon, compact && { width: 56, height: 56, borderRadius: 28 }]}><Icon name={icon} size={compact ? 22 : 28} color={colors.primary} /></View>
      {title ? <Text style={s.emptyTitle}>{title}</Text> : null}
      {message ? <Text style={s.emptyText}>{message}</Text> : null}
      {actionLabel && onAction ? <Button icon="plus" title={actionLabel} onPress={onAction} style={{ marginTop: 12 }} /> : null}
    </View>
  );
}

/* Status pill. */
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

/* 48px field, 12 radius, Leaf border while focused. */
export function Input({ multiline, style, ...props }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.placeholder}
      {...props}
      multiline={multiline}
      onFocus={(e) => { setFocused(true); props.onFocus && props.onFocus(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur && props.onBlur(e); }}
      style={[s.control, multiline && s.textarea, focused && s.controlFocused, style]}
    />
  );
}

/* A field showing the chosen option; tapping opens the options in a
   bottom sheet. */
export function Select({ value, options, onChange, placeholder, compact }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const items = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const current = items.find((o) => o.value === value);
  return (
    <>
      <Pressable style={[s.control, s.selectControl, compact && s.selectCompact]} onPress={() => { haptics.select(); setOpen(true); }} accessibilityRole="button" accessibilityLabel={placeholder}>
        <Text style={[s.selectText, !current && { color: colors.placeholder }]} numberOfLines={1}>{current ? current.label : placeholder || ''}</Text>
        <Icon name="chevron-down" size={12} color={colors.textLight} />
      </Pressable>
      <Modal open={open} onClose={() => setOpen(false)} title={placeholder || ''} maxWidth={420}>
        <FlatList
          data={items}
          keyExtractor={(o) => String(o.value) || '(empty)'}
          scrollEnabled={false}
          renderItem={({ item, index }) => {
            const active = item.value === value;
            return (
              <Pressable onPress={() => { haptics.select(); onChange(item.value); setOpen(false); }} accessibilityRole="radio" accessibilityState={{ checked: active }} style={({ pressed }) => [s.option, index === items.length - 1 && { borderBottomWidth: 0 }, pressed && { backgroundColor: colors.primaryLight }]}>
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

/* Dialogs. Phones: a bottom sheet that slides up, with a drag handle and
   rounded top corners; swipe it down, tap outside or press back to close,
   and its actions stay above the keyboard and the gesture bar. Tablets:
   the same content in a centred dialog. */
export function Modal({ open, onClose, title, children, footer, maxWidth = 560 }) {
  const s = useKitStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isTablet } = useBreakpoint();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const progress = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (open) {
      drag.setValue(0);
      setMounted(true);
      Animated.spring(progress, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 3 }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dismiss = useCallback(() => { Keyboard.dismiss(); closeRef.current && closeRef.current(); }, []);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_e, g) => {
      if (g.dy > 110 || g.vy > 0.9) dismiss();
      else Animated.spring(drag, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 4 }).start();
    },
  })).current;

  if (!mounted) return null;

  const header = (
    <View style={s.modalHeader}>
      <Text style={s.modalTitle} numberOfLines={1} accessibilityRole="header">{title}</Text>
      <IconButton icon="xmark" label="Close" onPress={dismiss} color={colors.textLight} />
    </View>
  );
  const body = (
    <ScrollView style={s.modalBodyScroll} contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled" bounces={false}>
      {children}
    </ScrollView>
  );
  const foot = footer ? <View style={[s.modalFooter, { paddingBottom: isTablet ? 16 : 12 + insets.bottom }]}>{footer}</View> : null;

  if (isTablet) {
    return (
      <RNModal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View style={[s.dialogOverlay, { opacity: progress }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Close" />
            <Animated.View style={[s.dialog, { maxWidth, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}>
              {header}
              {body}
              {foot}
            </Animated.View>
          </Animated.View>
        </KeyboardAvoidingView>
      </RNModal>
    );
  }

  const translateY = Animated.add(progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }), drag);
  return (
    <RNModal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View style={[s.sheet, { paddingBottom: footer ? 0 : insets.bottom, transform: [{ translateY }] }]}>
          <View {...(Platform.OS === 'web' ? null : pan.panHandlers)}>
            <View style={s.sheetHandleWrap}><View style={s.sheetHandle} /></View>
            {header}
          </View>
          {body}
          {foot}
        </Animated.View>
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

function makeStyles(colors, radius, shadowLg, scheme) {
  const primaryFill = scheme === 'dark' ? colors.forest : colors.leaf;
  const lift = { shadowColor: shadowLg.color, shadowOpacity: shadowLg.opacity, shadowRadius: shadowLg.radius / 2, shadowOffset: shadowLg.offset, elevation: shadowLg.elevation };
  return StyleSheet.create({
    pageHeader: { gap: 12, marginBottom: 20 },
    pageTitle: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: colors.text },
    pageSubtitle: { fontSize: 15, lineHeight: 22, color: colors.textLight, marginTop: 2 },
    pageActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

    card: { backgroundColor: colors.card, borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
    cardDanger: { borderWidth: 1.5, borderColor: colors.red },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
    cardHeaderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
    cardHeaderTitle: { fontSize: 17, fontWeight: '700', color: colors.heading, flexShrink: 1 },
    cardBody: { padding: 20 },
    cardHeaderIconTile: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    cardHeaderCompact: { paddingVertical: 10, paddingHorizontal: 12, gap: 6 },
    cardHeaderTitleCompact: { fontSize: 13, fontWeight: '700' },

    btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, paddingHorizontal: 18, borderRadius: radius.button, borderWidth: 1, borderColor: 'transparent' },
    btn_primary: { backgroundColor: primaryFill, borderColor: primaryFill },
    btn_secondary: { backgroundColor: colors.card, borderColor: colors.border },
    btn_danger: { backgroundColor: colors.red, borderColor: colors.red },
    btn_ghost: { backgroundColor: 'transparent' },
    btnSm: { minHeight: 40, paddingHorizontal: 14 },
    btnText: { fontSize: 14, fontWeight: '700' },
    btnTextSm: { fontSize: 13 },
    btnIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

    summaryCard: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
    summaryIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    summaryValue: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: colors.heading },
    summaryLabel: { fontSize: 14, color: colors.textLight },

    financeCard: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center' },
    financeLabel: { fontSize: 12, fontWeight: '600', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, textAlign: 'center' },
    financeAmount: { fontSize: 24, fontWeight: '800' },

    tabsWrap: { flexGrow: 0, marginBottom: 16 },
    tabBtn: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    tabBtnActive: { backgroundColor: colors.forest, borderColor: colors.forest },
    tabText: { fontWeight: '600', color: colors.text, fontSize: 13 },
    tabTextActive: { color: colors.white, fontWeight: '700' },

    segmented: { flexDirection: 'row', padding: 3, gap: 2, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start' },
    segBtn: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill },
    segBtnActive: { backgroundColor: colors.forest },
    segText: { fontSize: 13, fontWeight: '600', color: colors.textLight },
    segTextActive: { color: colors.white, fontWeight: '700' },

    filterBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 },

    empty: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 24, gap: 6 },
    emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight, marginBottom: 8 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
    emptyText: { fontSize: 13, lineHeight: 19, color: colors.textLight, textAlign: 'center', maxWidth: 340 },

    badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 12, borderRadius: radius.pill, alignSelf: 'flex-start' },
    badgeText: { fontSize: 12, fontWeight: '700' },

    formGroup: { marginBottom: 16 },
    formLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
    control: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.input, paddingVertical: 10, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
    controlFocused: { borderColor: colors.primary, borderWidth: 1.5 },
    textarea: { minHeight: 96, textAlignVertical: 'top' },
    selectControl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    selectCompact: { minHeight: 44, minWidth: 160 },
    selectText: { fontSize: 15, color: colors.text, flexShrink: 1 },
    option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    optionText: { fontSize: 15, color: colors.text, flexShrink: 1 },

    sheet: { backgroundColor: colors.card, maxHeight: '92%', borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, overflow: 'hidden' },
    sheetHandleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
    dialogOverlay: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 20 },
    dialog: { width: '100%', maxHeight: '90%', backgroundColor: colors.card, borderRadius: radius.dialog, overflow: 'hidden', ...lift },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingLeft: 20, paddingRight: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, flex: 1 },
    modalBodyScroll: { flexGrow: 0, flexShrink: 1 },
    modalBody: { padding: 20 },
    modalFooter: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 10, paddingTop: 12, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },

    muted: { color: colors.textLight, fontSize: 13, lineHeight: 19 },
  });
}

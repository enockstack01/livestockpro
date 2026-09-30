import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import { useTheme } from '../theme/ThemeProvider';

/* Port of client/src/lib/toast.jsx: single toast at a time, 4 types,
   ~4s auto-dismiss. Used after every mutation app-wide, same as web. Icon
   names match web's fa-check-circle/fa-exclamation-circle/
   fa-exclamation-triangle/fa-info-circle exactly (see client/src/lib/toast.jsx). */

const ICONS = { success: 'circle-check', error: 'circle-exclamation', warning: 'triangle-exclamation', info: 'circle-info' };

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timers = useRef([]);

  const showToast = useCallback((message, type = 'info') => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setToast({ message, type });
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    timers.current.push(setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setToast(null));
    }, 4000));
  }, [opacity]);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && <ToastView toast={toast} opacity={opacity} />}
    </ToastContext.Provider>
  );
}

/* Same look as the web's .toast: a solid colored pill (green / red / orange
   / blue) with white text — dark text on orange, which stays light in both
   themes — pinned top-right on wide screens, full-width on phones. */
function ToastView({ toast, opacity }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const typeColors = { success: colors.primary, error: colors.red, warning: colors.orange, info: colors.blue };
  const bg = typeColors[toast.type] || typeColors.info;
  const fg = toast.type === 'warning' ? '#263238' : '#FFFFFF';
  const wide = width > 600;

  return (
    <Animated.View style={[styles.wrap, { top: insets.top + 20, opacity }, wide ? { right: 20, left: undefined, alignItems: 'flex-end' } : null]} pointerEvents="none">
      <View style={[styles.toast, { backgroundColor: bg }]}>
        <Icon name={ICONS[toast.type] || ICONS.info} size={16} color={fg} />
        <Text style={[styles.text, { color: fg }]} numberOfLines={3}>{toast.message}</Text>
      </View>
    </Animated.View>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() must be used inside <ToastProvider>');
  return ctx;
}

function makeStyles(colors) {
  return StyleSheet.create({
    wrap: { position: 'absolute', left: 16, right: 16, zIndex: 999, alignItems: 'center' },
    toast: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderRadius: 10, paddingVertical: 14, paddingHorizontal: 20,
      maxWidth: 380, width: '100%',
      shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 30, shadowOffset: { width: 0, height: 8 }, elevation: 8,
    },
    text: { flex: 1, fontSize: 13, fontWeight: '500' },
  });
}

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
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

function ToastView({ toast, opacity }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const typeColors = { success: colors.primary, error: colors.red, warning: colors.orange, info: colors.blue };
  const tint = typeColors[toast.type] || typeColors.info;

  return (
    <Animated.View style={[styles.wrap, { top: insets.top + 8, opacity }]} pointerEvents="none">
      <View style={[styles.toast, { borderLeftColor: tint }]}>
        <Icon name={ICONS[toast.type] || ICONS.info} size={20} color={tint} />
        <Text style={styles.text} numberOfLines={3}>{toast.message}</Text>
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
      flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card,
      borderLeftWidth: 4, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14,
      maxWidth: 480, width: '100%',
      shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
    },
    text: { flex: 1, color: colors.text, fontSize: 14 },
  });
}

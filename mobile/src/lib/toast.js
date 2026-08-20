import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/* Port of client/src/lib/toast.jsx: single toast at a time, 4 types,
   ~4s auto-dismiss. Used after every mutation app-wide, same as web. */

const ICONS = { success: 'checkmark-circle', error: 'close-circle', warning: 'warning', info: 'information-circle' };
const COLORS = { success: '#2E7D32', error: '#D32F2F', warning: '#E65100', info: '#1976D2' };

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
  return (
    <Animated.View style={[styles.wrap, { top: insets.top + 8, opacity }]} pointerEvents="none">
      <View style={[styles.toast, { borderLeftColor: COLORS[toast.type] || COLORS.info }]}>
        <Ionicons name={ICONS[toast.type] || ICONS.info} size={20} color={COLORS[toast.type] || COLORS.info} />
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

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 999, alignItems: 'center' },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff',
    borderLeftWidth: 4, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14,
    maxWidth: 480, width: '100%',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  text: { flex: 1, color: '#263238', fontSize: 14 },
});

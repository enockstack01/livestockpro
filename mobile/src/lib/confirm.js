import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import Modal from '../components/Modal';
import { useTheme } from '../theme/ThemeProvider';

/* Imperative confirm() dialog, same pattern as useToast(). Built on our own
   Modal instead of React Native's Alert.alert() — react-native-web's Alert
   is a no-op stub (`static alert() {}`, see node_modules/react-native-web/
   dist/exports/Alert/index.js), so Alert.alert-based confirms silently do
   nothing on the web target. This works identically on web and native. */
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const styles = useMemo(() => makeStyles(colors, radius), [colors, radius]);
  const [state, setState] = useState(null); // { title, message, confirmLabel, destructive, resolve }

  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);

  function close(result) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title || t('common.confirm')}
        footer={
          <>
            <Pressable style={[styles.btn, styles.btnSecondary]} onPress={() => close(false)}>
              <Text style={styles.btnSecondaryText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable style={[styles.btn, state?.destructive ? styles.btnDanger : styles.btnPrimary]} onPress={() => close(true)}>
              <Text style={styles.btnPrimaryText}>{state?.confirmLabel || t('common.confirm')}</Text>
            </Pressable>
          </>
        }
      >
        <Text style={styles.message}>{state?.message}</Text>
      </Modal>
    </ConfirmContext.Provider>
  );
}

/* confirm({ title, message, confirmLabel, destructive }) -> Promise<boolean> */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm() must be used inside <ConfirmProvider>');
  return ctx;
}

function makeStyles(colors, radius) {
  return StyleSheet.create({
    message: { fontSize: 14, color: colors.textLight, lineHeight: 20 },
    btn: { flex: 1, paddingVertical: 13, borderRadius: radius.button, alignItems: 'center' },
    btnPrimary: { backgroundColor: colors.primary },
    btnPrimaryText: { color: colors.white, fontWeight: '700' },
    btnSecondary: { backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.border },
    btnSecondaryText: { color: colors.text, fontWeight: '700' },
    btnDanger: { backgroundColor: colors.red },
  });
}

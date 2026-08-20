import { createContext, useCallback, useContext, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Modal from '../components/Modal';

/* Imperative confirm() dialog, same pattern as useToast(). Built on our own
   Modal instead of React Native's Alert.alert() — react-native-web's Alert
   is a no-op stub (`static alert() {}`, see node_modules/react-native-web/
   dist/exports/Alert/index.js), so Alert.alert-based confirms silently do
   nothing on the web target. This works identically on web and native. */
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
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
        title={state?.title || 'Are you sure?'}
        footer={
          <>
            <Pressable style={[styles.btn, styles.btnSecondary]} onPress={() => close(false)}>
              <Text style={styles.btnSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.btn, state?.destructive ? styles.btnDanger : styles.btnPrimary]} onPress={() => close(true)}>
              <Text style={styles.btnPrimaryText}>{state?.confirmLabel || 'Confirm'}</Text>
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

const styles = StyleSheet.create({
  message: { fontSize: 14, color: '#37474F', lineHeight: 20 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#2E7D32' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  btnSecondary: { backgroundColor: '#ECEFF1' },
  btnSecondaryText: { color: '#37474F', fontWeight: '700' },
  btnDanger: { backgroundColor: '#D32F2F' },
});

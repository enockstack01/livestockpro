import { createContext, useCallback, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Muted } from '../ui/kit';

/* Imperative confirm() dialog, same pattern as useToast(). Built on our own
   Modal instead of React Native's Alert.alert() — react-native-web's Alert
   is a no-op stub (`static alert() {}`, see node_modules/react-native-web/
   dist/exports/Alert/index.js), so Alert.alert-based confirms silently do
   nothing on the web target. This works identically on web and native, and
   looks like the web app's confirm modals (secondary Cancel + primary or
   danger action, right-aligned in the footer). */
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const { t } = useTranslation();
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
        maxWidth={420}
        footer={
          <>
            <Button variant="secondary" title={t('common.cancel')} onPress={() => close(false)} />
            <Button
              variant={state?.destructive ? 'danger' : 'primary'}
              icon={state?.destructive ? 'trash' : 'check'}
              title={state?.confirmLabel || t('common.confirm')}
              onPress={() => close(true)}
            />
          </>
        }
      >
        <Muted>{state?.message}</Muted>
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

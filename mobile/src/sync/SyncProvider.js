import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSQLiteContext } from 'expo-sqlite';
import { useAuth } from '@clerk/expo';
import { useApi } from '../api/client';
import { runSync } from './syncEngine';
import { rescheduleReminders } from '../notifications/scheduler';
import { registerForPushNotifications } from '../notifications/registerPushToken';

const SyncContext = createContext(null);

/* Wires runSync() (src/sync/syncEngine.js) to the three v1 triggers: app
   foreground, network reconnect, and whatever manual pull-to-refresh calls
   triggerSync(). No background/periodic sync — see the plan's rationale
   (unreliable on iOS, not worth the complexity for this usage pattern). */
export function SyncProvider({ children }) {
  const db = useSQLiteContext();
  const api = useApi();
  const { isSignedIn } = useAuth();
  const [state, setState] = useState({ syncing: false, lastSyncedAt: null, lastError: null, failedCount: 0 });
  const runningRef = useRef(false);

  const triggerSync = useCallback(async () => {
    if (!isSignedIn || runningRef.current) return;
    runningRef.current = true;
    setState((s) => ({ ...s, syncing: true }));
    try {
      const result = await runSync(db, api);
      setState({ syncing: false, lastSyncedAt: new Date().toISOString(), lastError: null, failedCount: result.push.failed });
      await rescheduleReminders(db);
    } catch (err) {
      setState((s) => ({ ...s, syncing: false, lastError: err.message }));
    } finally {
      runningRef.current = false;
    }
  }, [db, api, isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    triggerSync();
    registerForPushNotifications(api).catch(() => {}); // best-effort; local reminders don't depend on this
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') triggerSync();
    });
    const unsubNet = NetInfo.addEventListener((netState) => {
      if (netState.isConnected) triggerSync();
    });
    return () => {
      appSub.remove();
      unsubNet();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  return <SyncContext.Provider value={{ ...state, triggerSync }}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync() must be used inside <SyncProvider>');
  return ctx;
}

import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/* One view of the connection for the whole app (offline mode, the offline
   AI download, the API client). Offline means no network, or a network
   with no internet (Wi-Fi without data). Going offline waits a moment so a
   short drop does not switch the app; coming back online is immediate. */

const OFFLINE_DELAY_MS = 2500;
let state = { online: null, wifi: false };
let pending = null;
const listeners = new Set();

function publish(next) {
  if (next.online === state.online && next.wifi === state.wifi) return;
  state = next;
  listeners.forEach((fn) => fn(state));
}

NetInfo.addEventListener((s) => {
  const online = s.isConnected !== false && s.isInternetReachable !== false;
  const next = { online, wifi: online && (s.type === 'wifi' || s.type === 'ethernet') };
  clearTimeout(pending);
  if (online || state.online === null) publish(next);
  else pending = setTimeout(() => publish(next), OFFLINE_DELAY_MS);
});

/* True only once the phone is known to be offline. */
export const isOffline = () => state.online === false;
export const connectivity = () => state;

export function subscribeConnectivity(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* { online: true | false | null (not known yet), wifi }. */
export function useConnectivity() {
  const [s, setS] = useState(state);
  useEffect(() => {
    setS(state);
    return subscribeConnectivity(setS);
  }, []);
  return s;
}

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@clerk/expo';
import { useApi } from '../api/client';
import { CURRENCIES, setCurrency, setRates } from '../../../shared/currency';

const AccountContext = createContext(null);

/* The signed-in user's account ({ status, role, accountType, currency, ... }
   from GET /api/account) — same source as the web's AccountGate. The last
   answer is cached per user on-device so an approved farmer can still open
   the app (and see their currency) with no signal; a fresh answer replaces
   it whenever the server is reachable. */
const cacheKey = (userId) => `lp_account_${userId}`;
const RATES_KEY = 'lp_rates';

/* Exchange rates for converting per-record currencies in totals. Only the
   offered currencies are cached (SecureStore values are kept small), so
   totals still convert offline with the last rates seen. */
async function loadRates(api) {
  try {
    const cached = await SecureStore.getItemAsync(RATES_KEY);
    if (cached) setRates(JSON.parse(cached));
  } catch { /* no cache yet */ }
  const { data } = await api.rates();
  if (!data || !data.rates) return false;
  const subset = {};
  CURRENCIES.forEach((c) => { if (data.rates[c.code]) subset[c.code] = data.rates[c.code]; });
  setRates(subset);
  SecureStore.setItemAsync(RATES_KEY, JSON.stringify(subset)).catch(() => {});
  return true;
}

export function AccountProvider({ children }) {
  const api = useApi();
  const { isSignedIn, userId } = useAuth();
  const [account, setAccountState] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [ratesVersion, setRatesVersion] = useState(0);

  const setAccount = useCallback((next) => {
    setCurrency(next && next.currency);
    setAccountState(next);
    if (next && userId) SecureStore.setItemAsync(cacheKey(userId), JSON.stringify(next)).catch(() => {});
  }, [userId]);

  const refresh = useCallback(async () => {
    setChecking(true);
    const { data, error } = await api.myAccount();
    setChecking(false);
    if (error) { setLoadError(true); return null; }
    setLoadError(false);
    setAccount(data);
    return data;
  }, [api, setAccount]);

  useEffect(() => {
    setAccountState(null);
    setLoadError(false);
    if (!isSignedIn || !userId) return;
    let cancelled = false;
    loadRates(api).then(() => { if (!cancelled) setRatesVersion((v) => v + 1); });
    (async () => {
      try {
        const cached = await SecureStore.getItemAsync(cacheKey(userId));
        if (cached && !cancelled) {
          const parsed = JSON.parse(cached);
          setCurrency(parsed.currency);
          setAccountState((cur) => cur || parsed);
        }
      } catch { /* no cache (or the web shim) — wait for the server */ }
      if (!cancelled) refresh();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, userId]);

  // ratesVersion changes the context value when rates arrive, so screens re-total.
  const value = { account, setAccount, refresh, loadError, checking, ratesVersion, approved: !!account && account.status === 'approved' };
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount() must be used inside <AccountProvider>');
  return ctx;
}

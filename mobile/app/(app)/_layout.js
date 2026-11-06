import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/expo';
import { Redirect, Slot, usePathname } from 'expo-router';
import LoadingScreen from '../../src/components/LoadingScreen';
import AppShell from '../../src/ui/AppShell';
import AccountGate from '../../src/screens/AccountGate';
import OfflineMode from '../../src/screens/OfflineMode';
import { useConnectivity } from '../../src/lib/connectivity';
import { useAccount } from '../../src/account/AccountProvider';
import { useSplashReady } from '../../src/components/AppSplash';
import { pendingJoinToken } from '../../src/lib/joinToken';

/* The CropManager app's frame (src/ui/AppShell.js): a forest app bar and,
   on phones, the bottom tabs with More; on tablets the sidebar. Pages are
   flat siblings; Back (and Android's back button) returns to the page you
   came from. Until an admin approves the account, the account request /
   "request sent" screens stand in for the whole app.

   Offline mode: with no internet, sign in is not asked for. Someone not
   signed in (or whose account cannot be checked offline, or an organization
   account, whose screens all need the server) gets the offline AI assistant
   only (src/screens/OfflineMode.js). An approved farmer keeps the farm app,
   which works offline, with the AI on the phone. Back online, this layout
   returns to sign in or the full app by itself. */
export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { account, approved, loadError } = useAccount();
  const splashReady = useSplashReady();
  const pathname = usePathname();
  const [joinToken, setJoinToken] = useState(null);
  const { online } = useConnectivity();
  const offline = online === false;
  useEffect(() => { if (isSignedIn) pendingJoinToken().then(setJoinToken); }, [isSignedIn, account]);
  // The splash steps aside once we know which screen to show.
  useEffect(() => {
    if (isLoaded && (account || loadError)) splashReady();
  }, [isLoaded, account, loadError, splashReady]);

  if (!isLoaded) return offline ? <OfflineMode /> : <LoadingScreen />;
  if (!isSignedIn) return offline ? <OfflineMode /> : <Redirect href="/sign-in" />;
  if (!account && !loadError) return offline ? <OfflineMode /> : <LoadingScreen />;
  /* Back to the referral link the farmer opened before signing in. */
  if (joinToken && !(account && account.kind === 'organization')) return <Redirect href={`/join/${joinToken}`} />;
  if (!approved) return offline ? <OfflineMode /> : <AccountGate />;
  /* Organization accounts and farmer accounts each stay on their own screens. */
  const isOrg = account && account.kind === 'organization';
  if (isOrg && offline) return <OfflineMode />;
  if (isOrg && !pathname.startsWith('/organization') && !pathname.startsWith('/settings') && pathname !== '/more') return <Redirect href="/organization" />;
  if (!isOrg && pathname.startsWith('/organization')) return <Redirect href="/" />;

  return (
    <AppShell>
      <Slot />
    </AppShell>
  );
}

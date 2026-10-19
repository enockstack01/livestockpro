import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/expo';
import { Redirect, Slot, usePathname } from 'expo-router';
import LoadingScreen from '../../src/components/LoadingScreen';
import AppShell from '../../src/ui/AppShell';
import AccountGate from '../../src/screens/AccountGate';
import { useAccount } from '../../src/account/AccountProvider';
import { useSplashReady } from '../../src/components/AppSplash';
import { pendingJoinToken } from '../../src/lib/joinToken';

/* Same frame as the web app (client/src/components/Layout.jsx): a green
   sidebar + topbar around one page at a time. Pages are flat siblings
   switched from the sidebar (like the web's routes) rather than a tab bar
   or a push/pop stack; Android's back button returns to the dashboard
   (handled in AppShell). Until an admin approves the account, the account
   request / "request sent" screens stand in for the whole app. */
export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { account, approved, loadError } = useAccount();
  const splashReady = useSplashReady();
  const pathname = usePathname();
  const [joinToken, setJoinToken] = useState(null);
  useEffect(() => { if (isSignedIn) pendingJoinToken().then(setJoinToken); }, [isSignedIn, account]);
  // The splash steps aside once we know which screen to show.
  useEffect(() => {
    if (isLoaded && (account || loadError)) splashReady();
  }, [isLoaded, account, loadError, splashReady]);

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (!account && !loadError) return <LoadingScreen />;
  /* Back to the referral link the farmer opened before signing in. */
  if (joinToken && !(account && account.kind === 'organization')) return <Redirect href={`/join/${joinToken}`} />;
  if (!approved) return <AccountGate />;
  /* Organization accounts and farmer accounts each stay on their own screens. */
  const isOrg = account && account.kind === 'organization';
  if (isOrg && !pathname.startsWith('/organization') && !pathname.startsWith('/settings')) return <Redirect href="/organization" />;
  if (!isOrg && pathname.startsWith('/organization')) return <Redirect href="/" />;

  return (
    <AppShell>
      <Slot />
    </AppShell>
  );
}

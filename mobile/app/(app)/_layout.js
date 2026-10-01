import { useAuth } from '@clerk/expo';
import { Redirect, Slot } from 'expo-router';
import LoadingScreen from '../../src/components/LoadingScreen';
import AppShell from '../../src/ui/AppShell';
import AccountGate from '../../src/screens/AccountGate';
import { useAccount } from '../../src/account/AccountProvider';

/* Same frame as the web app (client/src/components/Layout.jsx): a green
   sidebar + topbar around one page at a time. Pages are flat siblings
   switched from the sidebar (like the web's routes) rather than a tab bar
   or a push/pop stack; Android's back button returns to the dashboard
   (handled in AppShell). Until an admin approves the account, the account
   request / "request sent" screens stand in for the whole app. */
export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { account, approved, loadError } = useAccount();

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (!account && !loadError) return <LoadingScreen />;
  if (!approved) return <AccountGate />;

  return (
    <AppShell>
      <Slot />
    </AppShell>
  );
}

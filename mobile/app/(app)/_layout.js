import { useAuth } from '@clerk/expo';
import { Redirect, Slot } from 'expo-router';
import LoadingScreen from '../../src/components/LoadingScreen';
import AppShell from '../../src/ui/AppShell';

/* Same frame as the web app (client/src/components/Layout.jsx): a green
   sidebar + topbar around one page at a time. Pages are flat siblings
   switched from the sidebar (like the web's routes) rather than a tab bar
   or a push/pop stack; Android's back button returns to the dashboard
   (handled in AppShell). */
export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;

  return (
    <AppShell>
      <Slot />
    </AppShell>
  );
}

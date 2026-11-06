import { useAuth } from '@clerk/expo';
import { Redirect, Stack } from 'expo-router';
import LoadingScreen from '../../src/components/LoadingScreen';
import { SplashReadyOnMount } from '../../src/components/AppSplash';
import { useConnectivity } from '../../src/lib/connectivity';

/* Signing in needs internet: offline, the app opens offline mode instead
   (app/(app)/_layout.js), and comes back here by itself once online. */
export default function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { online } = useConnectivity();

  if (online === false) return <Redirect href="/" />;
  if (!isLoaded) return <LoadingScreen />;
  if (isSignedIn) return <Redirect href="/" />;

  return (
    <>
      <SplashReadyOnMount />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

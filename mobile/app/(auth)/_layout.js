import { useAuth } from '@clerk/expo';
import { Redirect, Stack } from 'expo-router';
import LoadingScreen from '../../src/components/LoadingScreen';
import { SplashReadyOnMount } from '../../src/components/AppSplash';

export default function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return <LoadingScreen />;
  if (isSignedIn) return <Redirect href="/" />;

  return (
    <>
      <SplashReadyOnMount />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

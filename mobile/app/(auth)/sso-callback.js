import { useEffect, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth, useClerk } from '@clerk/expo';
import LoadingScreen from '../../src/components/LoadingScreen';

/* Deep-link target for `livestockpro://sso-callback` (see redirectUrl in
   GoogleSignInButton.js) — Clerk's Google OAuth flow lands here after the
   browser redirects back into the app. Without a route matching this path,
   Expo Router has nothing to render for the incoming URL and shows its
   "Unmatched Route" screen instead of completing sign-in. This is most
   visible running as a web build, where the redirect is a real page
   navigation rather than an in-memory AuthSession promise.
   startSSOFlow() in GoogleSignInButton.js already calls setActive() once
   its own promise resolves, so this screen only has to finish the job when
   that promise never settles (the redirect arrived as a fresh navigation
   instead) by activating the session id Clerk put in the URL itself. */
export default function SSOCallback() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { setActive } = useClerk();
  const { created_session_id: createdSessionId } = useLocalSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (!isLoaded || handled.current) return;

    if (isSignedIn) {
      handled.current = true;
      router.replace('/');
      return;
    }

    if (typeof createdSessionId === 'string' && createdSessionId) {
      handled.current = true;
      setActive({ session: createdSessionId })
        .then(() => router.replace('/'))
        .catch(() => router.replace('/sign-in'));
      return;
    }

    handled.current = true;
    router.replace('/sign-in');
  }, [isLoaded, isSignedIn, createdSessionId, setActive, router]);

  return <LoadingScreen />;
}

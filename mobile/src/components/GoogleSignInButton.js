import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import { useSSO } from '@clerk/expo';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import { makeAuthStyles } from './AuthStyles';
import { useTheme } from '../theme/ThemeProvider';

/* "Continue with Google" — Clerk's useSSO()/startSSOFlow(), same flow for
   both sign-in and sign-up (Clerk creates the account automatically on
   first Google sign-in, matching how the web app's prebuilt <SignIn>/
   <SignUp> components already behave when a social connection is enabled).
   Requires Google to be turned on as an SSO connection in the Clerk
   Dashboard (Configure > SSO Connections) — this button will error with
   "not enabled" until that's done. */
export default function GoogleSignInButton({ onError }) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const styles = useMemo(() => makeAuthStyles(colors, radius), [colors, radius]);
  const { startSSOFlow } = useSSO();
  const [busy, setBusy] = useState(false);

  async function handlePress() {
    setBusy(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri({ scheme: 'livestockpro', path: '/sso-callback' }),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
      // If createdSessionId is missing, the flow needs another step (e.g. an
      // extra verification) that Clerk's own UI would normally handle next —
      // out of scope for this button; the user can retry or use email/password.
    } catch (err) {
      const message = err?.errors?.[0]?.message || err?.message || t('auth.googleSignInFailed');
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable style={styles.googleButton} onPress={handlePress} disabled={busy}>
      {busy ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          <Icon name="google" variant="brand" size={16} color={colors.text} />
          <Text style={styles.googleButtonText}>{t('auth.continueWithGoogle')}</Text>
        </>
      )}
    </Pressable>
  );
}

import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import { useSSO } from '@clerk/expo';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import { makeAuthStyles } from './AuthStyles';
import { useTheme } from '../theme/ThemeProvider';

/* "Continue with Google": Clerk's useSSO()/startSSOFlow(), same flow for
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
      const { createdSessionId, setActive, signUp, authSessionResult } = await startSSOFlow({
        strategy: 'oauth_google',
        // always show Google's account picker, then come straight back to the app
        oidcPrompt: 'select_account',
        redirectUrl: AuthSession.makeRedirectUri({ scheme: 'livestockpro', path: 'sso-callback' }),
      });
      if (createdSessionId && setActive) {
        // An existing account is signed in; a new Google user gets an account
        // created on the spot (startSSOFlow turns the sign-in into a sign-up).
        await setActive({ session: createdSessionId });
        return;
      }
      if (authSessionResult && authSessionResult.type !== 'success') return; // closed the Google window
      if (signUp && signUp.status === 'missing_requirements') {
        onError?.(t('auth.googleMissingInfo', { fields: (signUp.missingFields || []).join(', ') }));
        return;
      }
      onError?.(t('auth.googleSignInFailed'));
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

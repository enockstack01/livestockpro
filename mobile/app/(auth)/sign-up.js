import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSignUp } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { makeAuthStyles } from '../../src/components/AuthStyles';
import Icon from '../../src/components/Icon';
import GoogleSignInButton from '../../src/components/GoogleSignInButton';
import { useWarmUpBrowser } from '../../src/hooks/useWarmUpBrowser';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function SignUpScreen() {
  useWarmUpBrowser();
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const styles = useMemo(() => makeAuthStyles(colors, radius), [colors, radius]);
  const { signUp } = useSignUp();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  async function handleSignUp() {
    setError('');
    setBusy(true);
    try {
      const { error: err } = await signUp.password({ emailAddress: email, password });
      if (err) {
        setError(err.message || t('auth.couldNotCreateAccount'));
        return;
      }
      await signUp.verifications.sendEmailCode();
      setNeedsVerification(true);
    } catch (e) {
      setError(e.message || t('auth.somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setError('');
    setBusy(true);
    try {
      await signUp.verifications.verifyEmailCode({ code });
      if (signUp.status === 'complete') {
        await signUp.finalize({ navigate: () => router.replace('/') });
      } else {
        setError(t('auth.verificationIncomplete'));
      }
    } catch (e) {
      setError(e.message || t('auth.invalidCode'));
    } finally {
      setBusy(false);
    }
  }

  if (needsVerification) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.title}>{t('auth.checkYourEmail')}</Text>
        <Text style={styles.subtitle}>{t('auth.verifyCodeSentSignUp', { email })}</Text>
        <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder={t('auth.verificationCode')} keyboardType="number-pad" placeholderTextColor={colors.placeholder} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={handleVerify} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>{t('auth.verify')}</Text>}
        </Pressable>
        <Pressable onPress={() => signUp.verifications.sendEmailCode()}>
          <Text style={styles.link}>{t('auth.resendCode')}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.brand}>
        <Icon name="cow" size={36} color={colors.primary} />
        <Text style={styles.brandName}>{t('auth.brandName')}</Text>
      </View>
      <Text style={styles.title}>{t('auth.createAccount')}</Text>

      <GoogleSignInButton onError={setError} />
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('auth.or')}</Text>
        <View style={styles.dividerLine} />
      </View>

      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder={t('auth.emailAddress')}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholderTextColor={colors.placeholder}
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder={t('auth.password')}
        secureTextEntry
        placeholderTextColor={colors.placeholder}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.button, (!email || !password) && styles.buttonDisabled]}
        onPress={handleSignUp}
        disabled={!email || !password || busy}
      >
        {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>{t('auth.signUp')}</Text>}
      </Pressable>
      <View style={styles.footerRow}>
        <Text style={styles.footerText}>{t('auth.alreadyHaveAccount')}</Text>
        <Link href="/sign-in"><Text style={styles.link}>{t('auth.signIn')}</Text></Link>
      </View>
      {/* Clerk's bot-protection widget renders into this node on web; native
          builds ignore it. Without it Clerk falls back to a slower invisible
          CAPTCHA and logs a warning on every sign-up. */}
      <View nativeID="clerk-captcha" />
    </KeyboardAvoidingView>
  );
}

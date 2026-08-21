import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSignIn } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { makeAuthStyles } from '../../src/components/AuthStyles';
import Icon from '../../src/components/Icon';
import GoogleSignInButton from '../../src/components/GoogleSignInButton';
import { useWarmUpBrowser } from '../../src/hooks/useWarmUpBrowser';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function SignInScreen() {
  useWarmUpBrowser();
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const styles = useMemo(() => makeAuthStyles(colors, radius), [colors, radius]);
  const { signIn } = useSignIn();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);

  function finishSignIn() {
    router.replace('/');
  }

  async function handleSignIn() {
    setError('');
    setBusy(true);
    try {
      const { error: err } = await signIn.password({ emailAddress: email, password });
      if (err) {
        setError(err.message || t('auth.couldNotSignIn'));
        return;
      }
      if (signIn.status === 'complete') {
        await signIn.finalize({ navigate: finishSignIn });
      } else if (signIn.status === 'needs_client_trust' || signIn.status === 'needs_second_factor') {
        const emailFactor = (signIn.supportedSecondFactors || []).find((f) => f.strategy === 'email_code');
        if (emailFactor || signIn.status === 'needs_client_trust') {
          await signIn.mfa.sendEmailCode();
          setNeedsCode(true);
        } else {
          setError(t('auth.mfaNotSupported'));
        }
      } else {
        setError(t('auth.signInDidNotComplete'));
      }
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
      await signIn.mfa.verifyEmailCode({ code });
      if (signIn.status === 'complete') {
        await signIn.finalize({ navigate: finishSignIn });
      } else {
        setError(t('auth.verificationIncomplete'));
      }
    } catch (e) {
      setError(e.message || t('auth.invalidCode'));
    } finally {
      setBusy(false);
    }
  }

  if (needsCode) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.title}>{t('auth.verifyItsYou')}</Text>
        <Text style={styles.subtitle}>{t('auth.verifyCodeSentSignIn')}</Text>
        <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder={t('auth.verificationCode')} keyboardType="number-pad" placeholderTextColor={colors.placeholder} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={handleVerify} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>{t('auth.verify')}</Text>}
        </Pressable>
        <Pressable onPress={() => signIn.mfa.sendEmailCode()}>
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
      <Text style={styles.title}>{t('auth.welcomeBack')}</Text>

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
        onPress={handleSignIn}
        disabled={!email || !password || busy}
      >
        {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>{t('auth.signIn')}</Text>}
      </Pressable>
      <View style={styles.footerRow}>
        <Text style={styles.footerText}>{t('auth.dontHaveAccount')}</Text>
        <Link href="/sign-up"><Text style={styles.link}>{t('auth.signUp')}</Text></Link>
      </View>
    </KeyboardAvoidingView>
  );
}

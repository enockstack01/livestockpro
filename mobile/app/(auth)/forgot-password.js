import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSignIn } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { makeAuthStyles } from '../../src/components/AuthStyles';
import Icon from '../../src/components/Icon';
import { useTheme } from '../../src/theme/ThemeProvider';

/* signIn.create({ identifier }) opens a sign-in attempt for this email
   without a password, which is what unlocks the resetPasswordEmailCode.*
   methods below — see Clerk's "Forgot password" custom-flow guide. */
export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const styles = useMemo(() => makeAuthStyles(colors, radius), [colors, radius]);
  const { signIn } = useSignIn();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  async function handleSendCode() {
    setError('');
    setBusy(true);
    try {
      const { error: createErr } = await signIn.create({ identifier: email });
      if (createErr) {
        setError(createErr.message || t('auth.couldNotSendResetCode'));
        return;
      }
      const { error: codeErr } = await signIn.resetPasswordEmailCode.sendCode();
      if (codeErr) {
        setError(codeErr.message || t('auth.couldNotSendResetCode'));
        return;
      }
      setCodeSent(true);
    } catch (e) {
      setError(e.message || t('auth.somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword() {
    setError('');
    setBusy(true);
    try {
      const { error: verifyErr } = await signIn.resetPasswordEmailCode.verifyCode({ code });
      if (verifyErr) {
        setError(verifyErr.message || t('auth.invalidCode'));
        return;
      }
      const { error: submitErr } = await signIn.resetPasswordEmailCode.submitPassword({
        password: newPassword,
        signOutOfOtherSessions: true,
      });
      if (submitErr) {
        setError(submitErr.message || t('auth.couldNotResetPassword'));
        return;
      }
      if (signIn.status === 'complete') {
        await signIn.finalize({ navigate: () => router.replace('/') });
      } else {
        setError(t('auth.couldNotResetPassword'));
      }
    } catch (e) {
      setError(e.message || t('auth.somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Icon name="cow" size={36} color={colors.primary} />
          <Text style={styles.brandName}>{t('auth.brandName')}</Text>
        </View>
        <Text style={styles.title}>{t('auth.resetPasswordTitle')}</Text>

        {!codeSent ? (
          <>
            <Text style={styles.subtitle}>{t('auth.resetPasswordSubtitle')}</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.emailAddress')}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor={colors.placeholder}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={[styles.button, !email && styles.buttonDisabled]}
              onPress={handleSendCode}
              disabled={!email || busy}
            >
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>{t('auth.sendResetCode')}</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>{t('auth.resetCodeSentTo', { email })}</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder={t('auth.verificationCode')}
              keyboardType="number-pad"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={t('auth.newPassword')}
              secureTextEntry
              placeholderTextColor={colors.placeholder}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={[styles.button, (!code || !newPassword) && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={!code || !newPassword || busy}
            >
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>{t('auth.resetPassword')}</Text>}
            </Pressable>
            <Pressable onPress={() => signIn.resetPasswordEmailCode.sendCode()}>
              <Text style={styles.link}>{t('auth.resendCode')}</Text>
            </Pressable>
          </>
        )}

        <View style={styles.footerRow}>
          <Link href="/sign-in"><Text style={styles.link}>{t('auth.backToSignIn')}</Text></Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

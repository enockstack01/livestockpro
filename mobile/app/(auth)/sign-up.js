import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSignUp } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authStyles as styles } from '../../src/components/AuthStyles';

export default function SignUpScreen() {
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
        setError(err.message || 'Could not create your account.');
        return;
      }
      await signUp.verifications.sendEmailCode();
      setNeedsVerification(true);
    } catch (e) {
      setError(e.message || 'Something went wrong.');
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
        setError('Verification incomplete — check the code and try again.');
      }
    } catch (e) {
      setError(e.message || 'Invalid code.');
    } finally {
      setBusy(false);
    }
  }

  if (needsVerification) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>Enter the verification code we sent to {email}.</Text>
        <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="Verification code" keyboardType="number-pad" placeholderTextColor="#90A4AE" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={handleVerify} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
        </Pressable>
        <Pressable onPress={() => signUp.verifications.sendEmailCode()}>
          <Text style={styles.link}>Resend code</Text>
        </Pressable>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.brand}>
        <Ionicons name="paw" size={40} color="#2E7D32" />
        <Text style={styles.brandName}>LivestockPro</Text>
      </View>
      <Text style={styles.title}>Create your account</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Email address"
        autoCapitalize="none"
        keyboardType="email-address"
        placeholderTextColor="#90A4AE"
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        placeholderTextColor="#90A4AE"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.button, (!email || !password) && styles.buttonDisabled]}
        onPress={handleSignUp}
        disabled={!email || !password || busy}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign up</Text>}
      </Pressable>
      <View style={styles.footerRow}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Link href="/sign-in"><Text style={styles.link}>Sign in</Text></Link>
      </View>
      {/* Clerk's bot-protection widget renders into this node on web; native
          builds ignore it. Without it Clerk falls back to a slower invisible
          CAPTCHA and logs a warning on every sign-up. */}
      <View nativeID="clerk-captcha" />
    </KeyboardAvoidingView>
  );
}

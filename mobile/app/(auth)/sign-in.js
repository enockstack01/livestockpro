import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSignIn } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authStyles as styles } from '../../src/components/AuthStyles';

export default function SignInScreen() {
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
        setError(err.message || 'Could not sign you in.');
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
          setError('This account requires a verification method not yet supported in the app. Please sign in on the web instead.');
        }
      } else {
        setError('Sign-in did not complete. Please try again.');
      }
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
      await signIn.mfa.verifyEmailCode({ code });
      if (signIn.status === 'complete') {
        await signIn.finalize({ navigate: finishSignIn });
      } else {
        setError('Verification incomplete — check the code and try again.');
      }
    } catch (e) {
      setError(e.message || 'Invalid code.');
    } finally {
      setBusy(false);
    }
  }

  if (needsCode) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.title}>Verify it's you</Text>
        <Text style={styles.subtitle}>Enter the verification code we emailed you.</Text>
        <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="Verification code" keyboardType="number-pad" placeholderTextColor="#90A4AE" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.button} onPress={handleVerify} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
        </Pressable>
        <Pressable onPress={() => signIn.mfa.sendEmailCode()}>
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
      <Text style={styles.title}>Welcome back</Text>
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
        onPress={handleSignIn}
        disabled={!email || !password || busy}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
      <View style={styles.footerRow}>
        <Text style={styles.footerText}>Don't have an account? </Text>
        <Link href="/sign-up"><Text style={styles.link}>Sign up</Text></Link>
      </View>
    </KeyboardAvoidingView>
  );
}

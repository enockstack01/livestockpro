import { StyleSheet } from 'react-native';

/* Shared visual style for app/(auth)/sign-in.js and sign-up.js — kept in one
   place since both screens are near-identical layouts. */
export const authStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center', gap: 12 },
  brand: { alignItems: 'center', marginBottom: 24, gap: 8 },
  brandName: { fontSize: 22, fontWeight: '800', color: '#1B5E20' },
  title: { fontSize: 20, fontWeight: '700', color: '#1B5E20', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#607D8B', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: '#263238' },
  button: { backgroundColor: '#2E7D32', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  error: { color: '#D32F2F', fontSize: 13 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  footerText: { color: '#607D8B' },
  link: { color: '#2E7D32', fontWeight: '700' },
});

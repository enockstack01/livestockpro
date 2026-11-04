import { StyleSheet } from 'react-native';

/* Shared visual style for app/(auth)/sign-in.js, sign-up.js, and
   forgot-password.js, built to the CropManager app's sign in pages: the
   form sits on a raised white card (16 radius, Fern border), with a large
   green heading, 48px fields with 12 radius, and pill buttons. Themed:
   call with the current theme's colors/radius (see useTheme()) inside a
   useMemo. `content` is the card, passed as the screen ScrollView's
   contentContainerStyle, so a long MFA/reset form scrolls instead of
   clipping its button off screen. */
export function makeAuthStyles(colors, radius) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.card },
    content: {
      gap: 14, width: '100%', maxWidth: 420, alignSelf: 'center',
      marginTop: 20, marginBottom: 32, paddingHorizontal: 24, paddingVertical: 28,
      backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
      shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    forgotRow: { alignItems: 'flex-end', marginTop: -4 },
    title: { fontSize: 28, lineHeight: 36, fontWeight: '700', color: colors.heading || colors.primary },
    subtitle: { fontSize: 15, lineHeight: 22, color: colors.textLight, marginBottom: 6 },
    input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.input || 12, paddingVertical: 10, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
    button: { minHeight: 48, backgroundColor: colors.leaf, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 4 },
    // disabled stays deep green (no faded light green); the label dims instead
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: colors.white, fontWeight: '700', fontSize: 15 },
    error: { color: colors.red, fontSize: 13, backgroundColor: colors.red + '14', borderLeftWidth: 3, borderLeftColor: colors.red, borderRadius: 12, padding: 12, overflow: 'hidden' },
    footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 8 },
    footerText: { color: colors.textLight, fontSize: 14 },
    link: { color: colors.primary, fontWeight: '700', fontSize: 14 },

    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: { color: colors.textLight, fontSize: 13 },

    googleButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 48,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 999,
    },
    googleButtonText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  });
}

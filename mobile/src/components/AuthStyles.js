import { StyleSheet } from 'react-native';

/* Shared visual style for app/(auth)/sign-in.js, sign-up.js, and
   forgot-password.js — kept in one place since all three screens are
   near-identical layouts. Themed: call with the current theme's
   colors/radius (see useTheme()) inside a useMemo.
   `container` is the flex:1 wrapper passed to the screen's outer
   KeyboardAvoidingView; `content` is the centered/padded column passed as
   a ScrollView's contentContainerStyle, so a small screen or a long
   MFA/reset form can scroll instead of clipping its button off-screen. */
export function makeAuthStyles(colors, radius) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { flexGrow: 1, justifyContent: 'center', gap: 12, padding: 24, width: '100%', maxWidth: 480, alignSelf: 'center' },
    forgotRow: { alignItems: 'flex-end', marginTop: -4 },
    brand: { alignItems: 'center', marginBottom: 24, gap: 8 },
    brandName: { fontSize: 22, fontWeight: '800', color: colors.primaryDark },
    title: { fontSize: 20, fontWeight: '700', color: colors.primaryDark, marginBottom: 4 },
    subtitle: { fontSize: 14, color: colors.textLight, marginBottom: 12 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
    button: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.button, alignItems: 'center', marginTop: 4 },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: colors.white, fontWeight: '700', fontSize: 15 },
    error: { color: colors.red, fontSize: 13 },
    footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
    footerText: { color: colors.textLight },
    link: { color: colors.primary, fontWeight: '700' },

    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: { color: colors.textLight, fontSize: 12, fontWeight: '600' },

    googleButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
      paddingVertical: 13, borderRadius: radius.button,
    },
    googleButtonText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  });
}

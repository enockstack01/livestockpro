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
    // .auth-form-section / .auth-form-wrapper: centered column, 420px max.
    content: { flexGrow: 1, justifyContent: 'center', gap: 12, paddingVertical: 30, paddingHorizontal: 20, width: '100%', maxWidth: 460, alignSelf: 'center' },
    forgotRow: { alignItems: 'flex-end', marginTop: -4 },
    title: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 2 },
    subtitle: { fontSize: 14, color: colors.textLight, marginBottom: 12 },
    // .form-control
    input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 14, fontSize: 14, color: colors.text, backgroundColor: colors.card },
    // .btn .btn-primary .btn-block
    button: { backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 4 },
    // disabled stays deep green (no faded light green); the label dims instead
    buttonDisabled: {},
    buttonText: { color: colors.white, fontWeight: '600', fontSize: 14 },
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

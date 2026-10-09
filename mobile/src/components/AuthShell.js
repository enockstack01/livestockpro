import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useBreakpoint } from '../ui/layout';

/* The web sign-in page's layout (client/src/pages/Login.jsx + .auth-page):
   a deep-green gradient brand panel — cow mark, product name, tagline, two
   soft decorative circles — beside the form. Side by side on wide screens;
   on phones (where the web drops the panel) it becomes a compact brand band
   above the form so the app still opens on its identity. */
export default function AuthShell({ children }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const split = width > 768;

  const brand = (
    <View style={[styles.brand, split ? styles.brandSplit : [styles.brandBand, { paddingTop: insets.top + 24 }]]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="authBrand" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#1B5E20" />
            <Stop offset="1" stopColor="#1B5E20" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#authBrand)" />
      </Svg>
      <Icon name="cow" size={split ? 64 : 36} color="#FFFFFF" />
      <Text style={[styles.brandName, !split && { fontSize: 24, marginTop: 10, marginBottom: 4 }]}>{t('auth.brandName')}</Text>
      <Text style={[styles.tagline, !split && { fontSize: 13 }]}>{t('login.tagline')}</Text>
    </View>
  );

  return (
    <View style={[styles.page, { flexDirection: split ? 'row' : 'column', backgroundColor: colors.card }]}>
      {brand}
      <KeyboardAvoidingView style={[styles.formSection, { backgroundColor: colors.card }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  brand: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 40, backgroundColor: '#1B5E20' },
  brandSplit: { flex: 1 },
  brandBand: { paddingBottom: 28 },
  circle: { position: 'absolute' },
  brandName: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', marginTop: 20, marginBottom: 12 },
  tagline: { color: 'rgba(255,255,255,0.85)', fontSize: 16, maxWidth: 360, textAlign: 'center' },
  formSection: { flex: 1 },
});

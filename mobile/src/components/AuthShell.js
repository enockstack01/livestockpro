import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeProvider';
import { useBreakpoint } from '../ui/layout';
import { LanguagePanel } from '../ui/HeaderTools';
import { useLanguage } from '../i18n/LanguageProvider';
import { haptics } from '../lib/haptics';
import Icon from './Icon';

/* The sign-in brand panel, the twin of the web's AuthBrand
   (client/src/components/AuthBrand.jsx), built to the Agricoders brand
   guide: solid Pine (no gradient or glow), the LivestockPro app icon, the
   name in white and the product tagline. Side by side with the form on
   tablets; a compact band above it on phones. The language menu sits at
   the top of the band, so the app can be switched to another language
   before signing in (same menu as the signed in top bar). */
const PINE = '#14532D';

export default function AuthShell({ children }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const split = width > 768;
  const [langOpen, setLangOpen] = useState(false);
  const { language } = useLanguage();
  const langButton = (
    <Pressable
      onPress={() => { haptics.select(); setLangOpen(true); }}
      accessibilityRole="button"
      accessibilityLabel={t('settings.language')}
      hitSlop={6}
      style={({ pressed }) => [styles.langBtn, { top: split ? 20 : insets.top + 10 }, pressed && styles.langBtnPressed]}
    >
      <Icon name="globe" size={14} color="#FFFFFF" />
      <Text style={styles.langCode}>{String(language || 'en').slice(0, 2).toUpperCase()}</Text>
      <Icon name="chevron-down" size={10} color="#FFFFFF" />
    </Pressable>
  );

  const brand = split ? (
    <View style={[styles.brand, styles.brandSplit]}>
      <View style={styles.main}>
        <Image source={require('../../assets/icon.png')} style={styles.appIcon} />
        <Text style={styles.brandName}>{t('auth.brandName')}</Text>
        <Text style={styles.tagline}>{t('brand.tagline')}</Text>
      </View>
      {langButton}
    </View>
  ) : (
    <View style={[styles.brand, styles.band, { paddingTop: insets.top + 18 }]}>
      <View style={styles.bandRow}>
        <Image source={require('../../assets/icon.png')} style={styles.appIconSm} />
        <Text style={styles.brandNameSm}>{t('auth.brandName')}</Text>
      </View>
      <Text style={styles.taglineSm}>{t('brand.tagline')}</Text>
      {langButton}
    </View>
  );

  return (
    <View style={[styles.page, { flexDirection: split ? 'row' : 'column', backgroundColor: colors.card }]}>
      {brand}
      <KeyboardAvoidingView style={[styles.formSection, { backgroundColor: colors.card }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {children}
      </KeyboardAvoidingView>
      <LanguagePanel open={langOpen} onClose={() => setLangOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  brand: { backgroundColor: PINE },
  brandSplit: { flex: 1, paddingHorizontal: 56, paddingTop: 48, paddingBottom: 36, justifyContent: 'space-between' },
  main: { flex: 1, justifyContent: 'center', maxWidth: 440, width: '100%', alignSelf: 'center' },
  appIcon: { width: 88, height: 88, borderRadius: 22, marginBottom: 22 },
  brandName: { color: '#FFFFFF', fontSize: 36, fontWeight: '700' },
  tagline: { color: 'rgba(255,255,255,0.9)', fontSize: 18, lineHeight: 26, marginTop: 10 },
  band: { paddingHorizontal: 20, paddingBottom: 18 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingEnd: 92 },
  appIconSm: { width: 56, height: 56, borderRadius: 14 },
  brandNameSm: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },
  taglineSm: { color: 'rgba(255,255,255,0.9)', fontSize: 14.5, lineHeight: 20, marginTop: 12 },
  formSection: { flex: 1 },
  langBtn: { position: 'absolute', end: 16, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  langBtnPressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  langCode: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});

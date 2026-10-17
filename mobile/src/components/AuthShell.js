import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useBreakpoint } from '../ui/layout';

/* The sign-in brand panel, the twin of the web's AuthBrand
   (client/src/components/AuthBrand.jsx), built to the Agricoders brand
   guide: solid Pine (no gradient or glow), the LivestockPro app icon, the
   name in white, the product tagline, what the app does as white glyphs in
   solid Leaf circles, and the Agricoders mark inside a white disc (the navy
   logo never sits straight on green) with "LivestockPro · by Agricoders".
   Side by side with the form on tablets; a compact band above it on phones. */
const PINE = '#14532D';
const LEAF = '#2E7D32';
const POINTS = [
  { icon: 'cow', key: 'herd' },
  { icon: 'stethoscope', key: 'health' },
  { icon: 'wand-magic-sparkles', key: 'ai' },
];

export default function AuthShell({ children }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const split = width > 768;

  const endorse = (
    <View style={[styles.endorse, split && { marginTop: 28 }]}>
      <View style={[styles.disc, !split && styles.discSm]}>
        <Image source={require('../../assets/agricoders-logo.png')} style={split ? styles.discImg : styles.discImgSm} />
      </View>
      <Text style={[styles.byline, !split && { fontSize: 12 }]}>{t('brand.byline')}</Text>
    </View>
  );

  const brand = split ? (
    <View style={[styles.brand, styles.brandSplit]}>
      <View style={styles.main}>
        <Image source={require('../../assets/icon.png')} style={styles.appIcon} />
        <Text style={styles.brandName}>{t('auth.brandName')}</Text>
        <Text style={styles.tagline}>{t('brand.tagline')}</Text>
        <View style={{ gap: 14 }}>
          {POINTS.map((p) => (
            <View key={p.key} style={styles.point}>
              <View style={styles.pointIcon}><Icon name={p.icon} size={15} color="#FFFFFF" /></View>
              <Text style={styles.pointText}>{t(`auth.points.${p.key}`)}</Text>
            </View>
          ))}
        </View>
      </View>
      {endorse}
    </View>
  ) : (
    <View style={[styles.brand, styles.band, { paddingTop: insets.top + 18 }]}>
      <View style={styles.bandRow}>
        <Image source={require('../../assets/icon.png')} style={styles.appIconSm} />
        <Text style={styles.brandNameSm}>{t('auth.brandName')}</Text>
      </View>
      <Text style={styles.taglineSm}>{t('brand.tagline')}</Text>
      {endorse}
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
  brand: { backgroundColor: PINE },
  brandSplit: { flex: 1, paddingHorizontal: 56, paddingTop: 48, paddingBottom: 36, justifyContent: 'space-between' },
  main: { flex: 1, justifyContent: 'center', maxWidth: 440, width: '100%', alignSelf: 'center' },
  appIcon: { width: 88, height: 88, borderRadius: 22, marginBottom: 22 },
  brandName: { color: '#FFFFFF', fontSize: 36, fontWeight: '700' },
  tagline: { color: 'rgba(255,255,255,0.9)', fontSize: 18, lineHeight: 26, marginTop: 10, marginBottom: 30 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pointIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: LEAF, alignItems: 'center', justifyContent: 'center' },
  pointText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21, flex: 1 },
  band: { paddingHorizontal: 20, paddingBottom: 18 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  appIconSm: { width: 56, height: 56, borderRadius: 14 },
  brandNameSm: { color: '#FFFFFF', fontSize: 26, fontWeight: '700' },
  taglineSm: { color: 'rgba(255,255,255,0.9)', fontSize: 14.5, lineHeight: 20, marginTop: 12 },
  endorse: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, maxWidth: 440, width: '100%', alignSelf: 'center' },
  disc: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  discSm: { width: 40, height: 40, borderRadius: 20 },
  discImg: { width: 40, height: 40 },
  discImgSm: { width: 30, height: 30 },
  byline: { color: 'rgba(255,255,255,0.92)', fontSize: 14 },
  formSection: { flex: 1 },
});

import { useEffect, useRef, useState } from 'react';
import { Animated, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeProvider';
import { LanguagePanel } from '../ui/HeaderTools';
import { useLanguage } from '../i18n/LanguageProvider';
import { haptics } from '../lib/haptics';
import Icon from './Icon';

/* The sign in pages, laid out like the CropManager app's (its
   screens/auth/AuthLayout.tsx): a white page, the LivestockPro icon with
   the name in spaced green capitals and the tagline under it, then the
   form on a raised card (the screen's own ScrollView, styled by
   AuthStyles.content). The language menu sits at the top right so the app
   can be switched to another language before signing in. */
export default function AuthShell({ children }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [langOpen, setLangOpen] = useState(false);
  const { language } = useLanguage();
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(enter, { toValue: 1, duration: 320, useNativeDriver: true }).start(); }, [enter]);

  return (
    <View style={[styles.page, { backgroundColor: colors.card, paddingTop: insets.top }]}>
      <View style={styles.topRow}>
        <Pressable
          onPress={() => { haptics.select(); setLangOpen(true); }}
          accessibilityRole="button"
          accessibilityLabel={t('settings.language')}
          hitSlop={6}
          style={({ pressed }) => [styles.langBtn, { borderColor: colors.border }, pressed && { backgroundColor: colors.primaryLight }]}
        >
          <Icon name="globe" size={14} color={colors.primary} />
          <Text style={[styles.langCode, { color: colors.primary }]}>{String(language || 'en').slice(0, 2).toUpperCase()}</Text>
          <Icon name="chevron-down" size={10} color={colors.primary} />
        </Pressable>
      </View>
      <Animated.View style={[styles.brand, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
        <View style={styles.brandRow}>
          <Image source={require('../../assets/icon.png')} style={styles.appIcon} accessibilityLabel="LivestockPro" />
          <Text style={[styles.brandName, { color: colors.primary }]}>{t('auth.brandName')}</Text>
        </View>
        <Text style={[styles.tagline, { color: colors.textLight }]}>{t('brand.tagline')}</Text>
      </Animated.View>
      <KeyboardAvoidingView style={styles.form} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {children}
      </KeyboardAvoidingView>
      <LanguagePanel open={langOpen} onClose={() => setLangOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8 },
  langBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  langCode: { fontSize: 13, fontWeight: '700' },
  brand: { width: '100%', maxWidth: 460, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appIcon: { width: 42, height: 42, borderRadius: 10 },
  brandName: { fontSize: 19, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase' },
  tagline: { fontSize: 15, lineHeight: 22, marginTop: 12 },
  form: { flex: 1 },
});

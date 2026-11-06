import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import { SplashReadyOnMount } from '../components/AppSplash';
import { useTheme } from '../theme/ThemeProvider';
import { Page } from '../ui/kit';
import { OfflineAssistant } from './AssistantScreen';

/* Offline mode when nobody is signed in, or the account cannot be checked
   without internet (app/(app)/_layout.js). Signing in needs internet, so it
   is not asked for: only the AI assistant runs, with the models on the
   phone, and everything that needs the server is off. When the phone is
   back online the app returns to sign in, or to the farm, by itself. */
export default function OfflineMode() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SplashReadyOnMount />
      <View style={{ backgroundColor: colors.appBar, paddingTop: insets.top }}>
        <View style={styles.bar}>
          <Icon name="wifi" size={16} color="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.title} accessibilityRole="header">{t('offlineMode.title')}</Text>
            <Text style={styles.sub}>{t('offlineMode.subtitle')}</Text>
          </View>
        </View>
      </View>
      <Page>
        <Text style={{ color: colors.text, marginBottom: 12 }}>{t('offlineMode.intro')}</Text>
        <OfflineAssistant />
      </Page>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 8 },
  title: { color: '#FFFFFF', fontSize: 19, fontWeight: '700' },
  sub: { color: '#FFFFFF', opacity: 0.85, fontSize: 12.5 }
});

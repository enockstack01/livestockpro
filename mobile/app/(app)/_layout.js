import { useState } from 'react';
import { useAuth } from '@clerk/expo';
import { Redirect, Tabs } from 'expo-router';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import LoadingScreen from '../../src/components/LoadingScreen';
import Icon from '../../src/components/Icon';
import DrawerMenu from '../../src/components/DrawerMenu';
import { useTheme } from '../../src/theme/ThemeProvider';

/* Icon names match client/src/components/Layout.jsx's sidebar exactly
   (fa-gauge-high, fa-cow, fa-stethoscope, fa-list-check) so the same
   glyphs appear on both platforms. */
const TAB_ICON = { index: 'gauge-high', animals: 'cow', health: 'stethoscope', tasks: 'list-check', more: 'ellipsis' };

export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textLight,
          tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.primaryDark,
          headerLeft: () => (
            <Pressable onPress={() => setDrawerOpen(true)} hitSlop={12} style={{ marginLeft: 16 }}>
              <Icon name="bars" size={20} color={colors.primaryDark} />
            </Pressable>
          ),
        }}
      >
        <Tabs.Screen name="index" options={tabOptions(t('nav.dashboard'), TAB_ICON.index)} />
        <Tabs.Screen name="animals" options={tabOptions(t('nav.animals'), TAB_ICON.animals)} />
        <Tabs.Screen name="health" options={tabOptions(t('nav.health'), TAB_ICON.health)} />
        <Tabs.Screen name="tasks" options={tabOptions(t('nav.tasks'), TAB_ICON.tasks)} />
        <Tabs.Screen name="more" options={tabOptions(t('nav.more'), TAB_ICON.more)} />
        {/* Reachable via the drawer menu / More screen but not shown as their own tab. */}
        <Tabs.Screen name="feeding" options={{ href: null, title: t('nav.feeding') }} />
        <Tabs.Screen name="breeding" options={{ href: null, title: t('nav.breeding') }} />
        <Tabs.Screen name="production" options={{ href: null, title: t('nav.production') }} />
        <Tabs.Screen name="finance" options={{ href: null, title: t('nav.finance') }} />
        <Tabs.Screen name="reports" options={{ href: null, title: t('nav.reports') }} />
        <Tabs.Screen name="settings" options={{ href: null, title: t('nav.settings') }} />
      </Tabs>
      <DrawerMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}

function tabOptions(title, icon) {
  return {
    title,
    tabBarIcon: ({ color, size }) => <Icon name={icon} size={size * 0.85} color={color} />,
  };
}

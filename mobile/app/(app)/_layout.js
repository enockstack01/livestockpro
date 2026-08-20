import { useAuth } from '@clerk/expo';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import LoadingScreen from '../../src/components/LoadingScreen';

const TAB_ICON = { index: 'home', animals: 'paw', health: 'medkit', tasks: 'checkbox', more: 'menu' };

export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#2E7D32', tabBarInactiveTintColor: '#90A4AE', headerTintColor: '#1B5E20' }}>
      <Tabs.Screen name="index" options={tabOptions('Dashboard', TAB_ICON.index)} />
      <Tabs.Screen name="animals" options={tabOptions('Animals', TAB_ICON.animals)} />
      <Tabs.Screen name="health" options={tabOptions('Health', TAB_ICON.health)} />
      <Tabs.Screen name="tasks" options={tabOptions('Tasks', TAB_ICON.tasks)} />
      <Tabs.Screen name="more" options={tabOptions('More', TAB_ICON.more)} />
      {/* Reachable via "More" but not shown as their own tab. */}
      <Tabs.Screen name="feeding" options={{ href: null, title: 'Feeding' }} />
      <Tabs.Screen name="breeding" options={{ href: null, title: 'Breeding' }} />
      <Tabs.Screen name="production" options={{ href: null, title: 'Production' }} />
      <Tabs.Screen name="finance" options={{ href: null, title: 'Finance' }} />
      <Tabs.Screen name="reports" options={{ href: null, title: 'Reports' }} />
      <Tabs.Screen name="settings" options={{ href: null, title: 'Settings' }} />
    </Tabs>
  );
}

function tabOptions(title, icon) {
  return {
    title,
    tabBarIcon: ({ color, size }) => <Ionicons name={icon} color={color} size={size} />,
  };
}

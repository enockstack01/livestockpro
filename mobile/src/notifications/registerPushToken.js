import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

async function getDeviceId() {
  let id = await SecureStore.getItemAsync('lp_device_id');
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync('lp_device_id', id);
  }
  return id;
}

/* Registers this device for server-triggered event push (e.g. an animal's
   health_status flips to Critical — see server/lib/pushNotify.js). This is
   separate from src/notifications/scheduler.js's local date-based reminders,
   which need none of this. Safe to call repeatedly (e.g. every sign-in) —
   it de-dupes by device_id before inserting a fresh token row, since Expo
   push tokens rotate occasionally. */
export async function registerForPushNotifications(api) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2E7D32',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return { granted: false };

  const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
  if (!projectId || projectId === 'REPLACE_WITH_EAS_PROJECT_ID') {
    // Physical push requires `eas init` to have run — see mobile/eas.json / app.json.
    return { granted: true, registered: false, reason: 'missing-eas-project-id' };
  }

  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
  const deviceId = await getDeviceId();

  const existingRows = await api.list('push_tokens', { eq: { device_id: deviceId } });
  if (existingRows.data) {
    for (const row of existingRows.data) {
      await api.remove('push_tokens', row.id);
    }
  }
  await api.insert('push_tokens', [{ expo_push_token: expoPushToken, platform: Platform.OS, device_id: deviceId }]);

  return { granted: true, registered: true };
}

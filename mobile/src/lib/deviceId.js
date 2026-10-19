import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/* A random id for this install, kept in secure storage: used to de-duplicate
   push tokens and sent as X-Device-Id so the join endpoint can rate limit
   per device as well as per IP. */
let cached = null;
export async function getDeviceId() {
  if (cached) return cached;
  try {
    let id = await SecureStore.getItemAsync('lp_device_id');
    if (!id) {
      id = Crypto.randomUUID();
      await SecureStore.setItemAsync('lp_device_id', id);
    }
    cached = id;
  } catch {
    cached = '';
  }
  return cached;
}

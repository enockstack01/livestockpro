import * as SecureStore from 'expo-secure-store';

/* A referral link opened while signed out waits here until the farmer has
   signed in, then the app returns them to it (app/join/[token].js). */
export const JOIN_TOKEN_KEY = 'lp_join_token';

export async function pendingJoinToken() {
  try { return (await SecureStore.getItemAsync(JOIN_TOKEN_KEY)) || ''; } catch { return ''; }
}

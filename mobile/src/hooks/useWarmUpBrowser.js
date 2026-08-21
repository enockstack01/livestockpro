import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

/* Pre-warms Android's Custom Tabs browser so the Google OAuth popup opens
   without a visible delay. iOS's in-app browser doesn't need this. */
export function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => void WebBrowser.coolDownAsync();
  }, []);
}

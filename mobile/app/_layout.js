import 'react-native-gesture-handler';
import '../src/i18n'; // side-effect: initializes i18next before any component calls useTranslation()
import { useFonts, Carlito_400Regular, Carlito_700Bold } from '@expo-google-fonts/carlito';
import { Suspense, useEffect } from 'react';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { resourceCache } from '@clerk/expo/resource-cache';
import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { DB_NAME, migrateDbIfNeeded } from '../src/db/schema';
import { ToastProvider } from '../src/lib/toast';
import { ConfirmProvider } from '../src/lib/confirm';
import { SyncProvider } from '../src/sync/SyncProvider';
import { AccountProvider } from '../src/account/AccountProvider';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { LanguageProvider } from '../src/i18n/LanguageProvider';
import LoadingScreen from '../src/components/LoadingScreen';
import { SplashHost } from '../src/components/AppSplash';
import { startAutoDownload } from '../src/ml/gemma';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout() {
  // Carlito (Calibri compatible), the Agricoders typeface; the splash covers the moment it takes to load.
  const [fontsLoaded, fontError] = useFonts({ Carlito_400Regular, Carlito_700Bold });
  // The offline AI fetches itself on Wi-Fi after install, signed in or not (src/ml/gemma).
  useEffect(() => { startAutoDownload().catch(() => {}); }, []);
  if (!publishableKey) {
    throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — copy mobile/.env.example to mobile/.env and fill it in.');
  }
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            {/* Animated loading splash over everything until the first screen is ready. */}
            <SplashHost>
              {/* The resource cache keeps the signed in session on the phone, so
                  Clerk loads with no internet instead of waiting for it. */}
              <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache} __experimental_resourceCache={resourceCache}>
                <Suspense fallback={<LoadingScreen />}>
                  <SQLiteProvider databaseName={DB_NAME} onInit={migrateDbIfNeeded}>
                    <ToastProvider>
                      <ConfirmProvider>
                        <AccountProvider>
                          <SyncProvider>
                            <ThemedStatusBar />
                            <Slot />
                          </SyncProvider>
                        </AccountProvider>
                      </ConfirmProvider>
                    </ToastProvider>
                  </SQLiteProvider>
                </Suspense>
              </ClerkProvider>
            </SplashHost>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/* Every screen opens under a forest green bar (the app bar, the sign in
   band), so the status bar icons are white in both themes. */
function ThemedStatusBar() {
  return <StatusBar style="light" />;
}

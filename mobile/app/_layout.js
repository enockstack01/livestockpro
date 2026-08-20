import 'react-native-gesture-handler';
import { Suspense } from 'react';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { DB_NAME, migrateDbIfNeeded } from '../src/db/schema';
import { ToastProvider } from '../src/lib/toast';
import { ConfirmProvider } from '../src/lib/confirm';
import { SyncProvider } from '../src/sync/SyncProvider';
import LoadingScreen from '../src/components/LoadingScreen';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout() {
  if (!publishableKey) {
    throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — copy mobile/.env.example to mobile/.env and fill it in.');
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
          <Suspense fallback={<LoadingScreen />}>
            <SQLiteProvider databaseName={DB_NAME} onInit={migrateDbIfNeeded}>
              <ToastProvider>
                <ConfirmProvider>
                  <SyncProvider>
                    <StatusBar style="dark" />
                    <Slot />
                  </SyncProvider>
                </ConfirmProvider>
              </ToastProvider>
            </SQLiteProvider>
          </Suspense>
        </ClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

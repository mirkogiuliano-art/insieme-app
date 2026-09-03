import '@/lib/polyfills';
import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ThemeProvider, useTheme } from '@/theme/theme';
import { AuthProvider } from '@/lib/authStore';
import { AppStoreProvider } from '@/lib/appStore';
import { ToastProvider } from '@/components/Toast';

function ThemedStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />;
}

/** Quando qualcuno condivide qualcosa verso Insieme da un'altra app, il
 * contenuto arriva qui: si apre la schermata di smistamento sopra a quella
 * corrente, così chiudendola si torna dov'era. */
function ShareIntentRouter() {
  const { hasShareIntent } = useShareIntentContext();
  useEffect(() => {
    if (hasShareIntent) router.push('/share');
  }, [hasShareIntent]);
  return null;
}

export default function RootLayout() {
  return (
    // `disabled` va passato esplicitamente: fornendo un oggetto di opzioni si
    // sostituiscono per intero quelle di default della libreria, fra cui la
    // disattivazione su web (dove il modulo nativo non esiste).
    <ShareIntentProvider options={{ debug: false, disabled: Platform.OS === 'web' }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Misura la tastiera a livello nativo e la espone ai
            KeyboardAvoidingView della stessa libreria. Serve perché con la
            modalità edge-to-edge di Android (obbligatoria dalla 15) la
            finestra non viene più ridimensionata: la tastiera si limita a
            coprire il contenuto, ed è esattamente il difetto da correggere. */}
        <KeyboardProvider>
          <SafeAreaProvider>
            <ThemeProvider>
              <AuthProvider>
                <AppStoreProvider>
                  <ToastProvider>
                    <ThemedStatusBar />
                    <ShareIntentRouter />
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="index" />
                      <Stack.Screen name="group/[id]" />
                      <Stack.Screen name="reset-password" />
                      <Stack.Screen name="invite/[token]" />
                      <Stack.Screen name="share" options={{ presentation: 'modal' }} />
                    </Stack>
                  </ToastProvider>
                </AppStoreProvider>
              </AuthProvider>
            </ThemeProvider>
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ShareIntentProvider>
  );
}

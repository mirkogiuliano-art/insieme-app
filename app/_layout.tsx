import '@/lib/polyfills';
import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import * as Notifications from 'expo-notifications';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useFonts, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { configuraNotifiche } from '@/lib/api/push';
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

/** Toccando un avviso si apre il gruppo da cui è arrivato.
 *
 * Due strade: l'app era già accesa (`addNotificationResponseReceived`),
 * oppure era chiusa ed è stata aperta proprio da quell'avviso — in quel
 * caso il tocco è già avvenuto prima che questo componente esistesse, e
 * si recupera con `getLastNotificationResponseAsync`. */
/**
 * Sul web questo componente non va montato affatto: il modulo nativo non
 * esiste e `useLastNotificationResponse` non fallisce in silenzio — solleva
 * un errore che, arrivando da un gancio durante il primo disegno, porta giù
 * l'applicazione intera invece della sola parte degli avvisi.
 */
function AvvisiRouter() {
  // Il gancio copre tutti e due i casi da solo: sia l'avviso toccato con
  // l'app accesa, sia quello che l'ha aperta da spenta — in quel secondo
  // caso il tocco è già avvenuto prima che questo componente esistesse.
  const ultimoTocco = Notifications.useLastNotificationResponse();

  useEffect(() => {
    configuraNotifiche();
  }, []);

  useEffect(() => {
    const groupId = (ultimoTocco?.notification.request.content.data as { groupId?: string } | null)?.groupId;
    if (groupId) router.push(`/group/${groupId}`);
  }, [ultimoTocco]);

  return null;
}

export default function RootLayout() {
  // Il carattere sta dentro l'app, quindi il caricamento è questione di
  // un attimo: aspettarlo evita che i nomi dei gruppi compaiano col
  // carattere di sistema e cambino forma sotto gli occhi. Se per qualche
  // motivo fallisce si prosegue lo stesso, col carattere di sistema.
  const [fontsLoaded, fontError] = useFonts({ Nunito_800ExtraBold });
  if (!fontsLoaded && !fontError) return null;

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
                    {Platform.OS !== 'web' ? <AvvisiRouter /> : null}
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

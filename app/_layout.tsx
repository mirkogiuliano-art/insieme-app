import '@/lib/polyfills';
import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Platform, View, Text } from 'react-native';
import { Pressable } from '@/components/Tocco';
import { Stack, router, useNavigationContainerRef, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import * as Notifications from 'expo-notifications';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useFonts, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { configuraNotifiche } from '@/lib/api/push';
import { ThemeProvider, useTheme } from '@/theme/theme';
import { LinguaProvider } from '@/i18n';
import { AuthProvider } from '@/lib/authStore';
import { AppStoreProvider } from '@/lib/appStore';
import { ToastProvider } from '@/components/Toast';
import * as Linking from 'expo-linking';
import { gestisciLink } from '@/lib/linkAccesso';
import { avviaSentry, avvolgiApp, navigazioneSentry, segnalaErrore, sentryAttivo } from '@/lib/sentry';
import { dizionario } from '@/i18n';
// Prima di tutto il resto: un errore durante l'avvio va raccolto anche lui.
avviaSentry();

// Sul web Chrome colora di giallo (o azzurro) i campi riempiti dalla
// compilazione automatica. Lo sfondo non si può togliere, solo rimandare
// all'infinito con una transizione lunghissima; il testo tiene il colore
// che il campo ha già. È lo stesso effetto del plugin
// withNoAutofillHighlight su Android.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    input:-webkit-autofill,
    input:-webkit-autofill:hover,
    input:-webkit-autofill:focus {
      -webkit-text-fill-color: currentColor;
      caret-color: currentColor;
      transition: background-color 600000s 0s, color 600000s 0s;
    }
  `;
  document.head.appendChild(style);
}

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

/** I link dell'accesso che tornano dalla posta (la nuova password):
 * quello che ha aperto l'app da spenta, e quelli che arrivano mentre è
 * accesa. Sta qui, sempre montato, perché un link che arriva ad app aperta
 * parte prima che la schermata che lo usa esista (vedi lib/linkAccesso). */
function LinkAccessoRouter() {
  useEffect(() => {
    Linking.getInitialURL().then(gestisciLink);
    const sub = Linking.addEventListener('url', ({ url }) => gestisciLink(url));
    return () => sub.remove();
  }, []);
  return null;
}

/**
 * La rete sotto l'app: quello che si vede quando una schermata si rompe,
 * al posto di uno schermo bianco o di un'app che si chiude.
 *
 * Expo Router la mette **attorno** a questo layout, quindi fuori da tema,
 * lingua e aree sicure che il layout stesso fornisce: non può usarli. I
 * testi li prende da `dizionario()`, che funziona anche senza contesto;
 * i colori sono quelli del tema scuro, il punto di partenza dell'app.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const t = dizionario().rottura;
  useEffect(() => {
    // Un errore fermato qui non arriva al gestore globale di Sentry: va
    // mandato a mano.
    segnalaErrore(error, 'rottura.schermata');
  }, [error]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0E141B', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }}>
      <Text style={{ color: '#E8EDF2', fontSize: 22, fontWeight: '800', letterSpacing: -0.4, textAlign: 'center' }}>{t.titolo}</Text>
      <Text style={{ color: '#93A3B2', fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 320 }}>
        {t.testo}
        {sentryAttivo ? `\n${t.arrivato}` : ''}
      </Text>
      <Pressable accessibilityRole="button"
        onPress={retry}
        style={{ marginTop: 10, height: 50, alignSelf: 'stretch', borderRadius: 999, backgroundColor: '#E9A23B', alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: '#23190A', fontSize: 15, fontWeight: '800' }}>{t.riprova}</Text>
      </Pressable>
      <Pressable accessibilityRole="button"
        onPress={() => {
          router.replace('/');
          retry();
        }}
        hitSlop={8}
      >
        <Text style={{ color: '#93A3B2', fontSize: 13, fontWeight: '700', marginTop: 4 }}>{t.inizio}</Text>
      </Pressable>
    </View>
  );
}

function RootLayout() {
  // Sentry segue le schermate aperte: un errore arriva col percorso che
  // l'ha preceduto.
  const navigazione = useNavigationContainerRef();
  useEffect(() => {
    if (navigazione) navigazioneSentry.registerNavigationContainer(navigazione);
  }, [navigazione]);

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
              {/* La lingua sta accanto al tema e prima di tutto il resto:
                  qualunque schermata può averne bisogno per il primo
                  disegno, compresa quella di accesso. */}
              <LinguaProvider>
                <AuthProvider>
                  <AppStoreProvider>
                    <ToastProvider>
                      <ThemedStatusBar />
                      <ShareIntentRouter />
                      {Platform.OS !== 'web' ? <AvvisiRouter /> : null}
                      {Platform.OS !== 'web' ? <LinkAccessoRouter /> : null}
                      {/* freezeOnBlur: la schermata coperta (la home sotto un
                          gruppo) non si ridisegna finché non torna in vista.
                          Prima si ridisegnava intera all'arrivo dei dati del
                          gruppo, proprio durante l'animazione d'apertura. */}
                      <Stack screenOptions={{ headerShown: false, freezeOnBlur: true }}>
                        <Stack.Screen name="index" />
                        <Stack.Screen name="group/[id]" />
                        <Stack.Screen name="pubblico/[id]" />
                        <Stack.Screen name="persona/[id]" />
                        <Stack.Screen name="reset-password" />
                        <Stack.Screen name="invite/[token]" />
                        <Stack.Screen name="share" options={{ presentation: 'modal' }} />
                      </Stack>
                    </ToastProvider>
                  </AppStoreProvider>
                </AuthProvider>
              </LinguaProvider>
            </ThemeProvider>
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ShareIntentProvider>
  );
}

export default avvolgiApp(RootLayout);

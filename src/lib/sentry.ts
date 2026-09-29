/**
 * Gli errori dell'app, mandati a chi la costruisce (Sentry).
 *
 * ── Quando è acceso ────────────────────────────────────────────────
 * Solo nelle build vere (non col server di sviluppo, dove l'errore si vede
 * già sullo schermo) e solo se c'è il DSN del progetto Sentry in
 * `EXPO_PUBLIC_SENTRY_DSN`. Senza, ogni funzione qui dentro non fa niente:
 * l'app si comporta come prima.
 *
 * ── Cosa parte, e cosa no ──────────────────────────────────────────
 * Parte: l'errore con la sua pila, la versione dell'app, il sistema, la
 * lingua, l'id dell'utente, e gli ultimi passi prima dell'errore
 * (schermate aperte, chiamate di rete — senza la parte dopo il `?`, dove
 * stanno i gettoni delle foto e i filtri delle richieste).
 * Non parte: email, nomi, testi dei messaggi, indirizzo IP
 * (`sendDefaultPii: false`).
 *
 * ── Le source map ───────────────────────────────────────────────────
 * Per leggere un errore di una build vera servono le source map, che il
 * plugin di Sentry carica durante la build. Il plugin però **fa fallire la
 * build** se non ha il token, quindi in app.json si aggiunge solo insieme
 * al token (vedi docs/segnalazione-errori.md).
 */

import type React from 'react';
import * as Sentry from '@sentry/react-native';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

export const sentryAttivo = DSN.length > 0 && !__DEV__;

/** Per sapere su che schermata si era quando l'errore è successo. */
export const navigazioneSentry = Sentry.reactNavigationIntegration();

/**
 * Errori che dicono solo «non c'era la rete»: capitano a chiunque in
 * metropolitana, e mandarli seppellirebbe quelli veri. L'app li gestisce
 * già (messaggio all'utente, avviso di caricamento non riuscito).
 */
const SOLO_RETE = [
  'Network request failed',
  'Failed to fetch',
  'La richiesta ha impiegato troppo tempo.',
  'The request took too long.',
];

export function avviaSentry() {
  if (!sentryAttivo) return;
  Sentry.init({
    dsn: DSN,
    sendDefaultPii: false,
    // Niente misure delle prestazioni per ora: servono gli errori.
    tracesSampleRate: 0,
    integrations: [navigazioneSentry],
    ignoreErrors: SOLO_RETE,
    beforeBreadcrumb(briciola) {
      // Gli indirizzi delle chiamate restano, i parametri no: nelle foto ci
      // sono gettoni firmati, nelle richieste a Supabase i filtri.
      const url = briciola.data?.url;
      if (typeof url === 'string' && url.includes('?')) {
        briciola.data = { ...briciola.data, url: url.split('?')[0] };
      }
      return briciola;
    },
  });
}

/**
 * Un errore che l'app ha raccolto e mostrato all'utente con un messaggio:
 * senza questa riga resterebbe fra lui e lo schermo. `azione` dice cosa
 * stava facendo — è la stessa chiave del messaggio nel dizionario
 * (`chat.erroreInvio`), che non cambia con la lingua.
 */
export function segnalaErrore(errore: unknown, azione: string) {
  if (!sentryAttivo) return;
  Sentry.captureException(errore, { tags: { azione } });
}

/** Chi sta usando l'app, solo come id: niente email, niente nome. */
export function utenteSentry(id: string | null) {
  if (!sentryAttivo) return;
  Sentry.setUser(id ? { id } : null);
}

export function linguaSentry(lingua: string) {
  if (!sentryAttivo) return;
  Sentry.setTag('lingua', lingua);
}

/** L'app intera, avvolta perché Sentry veda i tocchi prima di un errore. */
export function avvolgiApp(App: React.ComponentType): React.ComponentType {
  return sentryAttivo ? Sentry.wrap(App) : App;
}

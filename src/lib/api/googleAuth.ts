/**
 * Accesso con Google.
 *
 * ── Due strade, una per dove gira l'app ────────────────────────────
 * Su telefono si usa il selettore di account del sistema
 * (`@react-native-google-signin/google-signin`): un foglio che sale dal
 * basso con gli account già presenti, un tocco e si è dentro. Google
 * restituisce un «id token» firmato, e Supabase lo scambia con una
 * sessione (`signInWithIdToken`). Niente browser, niente rimbalzi.
 *
 * Sul web quella libreria non esiste — è codice nativo — e si passa dalla
 * pagina di Google con `signInWithOAuth`: la pagina va da Google e torna
 * indietro con la sessione nell'indirizzo, che il client raccoglie da sé
 * (`detectSessionInUrl`, acceso solo sul web in lib/supabase.ts).
 *
 * ── Cosa serve perché funzioni ─────────────────────────────────────
 * Le istruzioni per Google Cloud, Supabase ed EAS sono in
 * docs/accesso-google.md. La più insidiosa: su Android l'accesso fallisce
 * con DEVELOPER_ERROR — un numero e nessuna spiegazione — se su Google
 * Cloud manca l'impronta SHA-1 della chiave che ha firmato *quella*
 * build. Sviluppo, produzione e Play Store firmano con chiavi diverse.
 */

import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { dizionario } from '@/i18n';

/** L'id OAuth «Web» di Google Cloud: è quello che Supabase conosce, e il
 * selettore nativo lo usa per farsi dare un token che Supabase accetti.
 * Non è un segreto — finisce comunque dentro l'app. */
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
/** L'id OAuth «iOS», che serve solo su iPhone. */
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

/**
 * Il tasto compare solo quando l'accesso con Google è davvero
 * configurato: senza l'id Web non porterebbe da nessuna parte, e un tasto
 * che non funziona è peggio di un tasto che non c'è.
 */
export const googleAttivo = WEB_CLIENT_ID.length > 0;

export type EsitoGoogle =
  /** Dentro: la sessione è aperta, ci pensa authStore a cambiare schermata. */
  | { esito: 'dentro' }
  /** La persona ha chiuso il selettore: non è un errore, non si dice niente. */
  | { esito: 'annullato' }
  | { esito: 'errore'; messaggio: string };

let configurato = false;

/**
 * La libreria nativa si carica solo qui dentro, al momento dell'uso: un
 * `import` in cima al file la porterebbe anche nel pacchetto del web,
 * dove il suo modulo nativo non c'è.
 */
function libreria() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lib = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
  if (!configurato) {
    lib.GoogleSignin.configure({
      webClientId: WEB_CLIENT_ID,
      iosClientId: IOS_CLIENT_ID || undefined,
    });
    configurato = true;
  }
  return lib;
}

async function accediNativo(): Promise<EsitoGoogle> {
  const e = dizionario().erroriAuth;
  const { GoogleSignin, statusCodes, isSuccessResponse, isErrorWithCode } = libreria();
  try {
    // Sui telefoni Android senza servizi Google (alcuni Huawei, per dire)
    // il selettore non può esistere: meglio dirlo che fallire in silenzio.
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const risposta = await GoogleSignin.signIn();
    if (!isSuccessResponse(risposta)) return { esito: 'annullato' };

    const idToken = risposta.data.idToken;
    if (!idToken) return { esito: 'errore', messaggio: e.generico };

    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) return { esito: 'errore', messaggio: error.message || e.generico };
    return { esito: 'dentro' };
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) return { esito: 'annullato' };
      // Un secondo tocco mentre il primo è ancora aperto: il foglio c'è già.
      if (err.code === statusCodes.IN_PROGRESS) return { esito: 'annullato' };
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { esito: 'errore', messaggio: dizionario().accesso.senzaServiziGoogle };
      }
      // DEVELOPER_ERROR è quasi sempre l'impronta SHA-1 mancante su Google
      // Cloud. A chi usa l'app non serve saperlo; a chi la sta costruendo sì.
      if (__DEV__) console.warn('[accesso Google]', err.code, err.message);
    }
    return { esito: 'errore', messaggio: e.generico };
  }
}

async function accediWeb(): Promise<EsitoGoogle> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  // Se è andata, la pagina è già partita verso Google: quello che succede
  // dopo lo raccoglie il client al ritorno.
  if (error) return { esito: 'errore', messaggio: error.message || dizionario().erroriAuth.generico };
  return { esito: 'dentro' };
}

export function accediConGoogle(): Promise<EsitoGoogle> {
  return Platform.OS === 'web' ? accediWeb() : accediNativo();
}

/**
 * All'uscita dall'account si esce anche dal selettore: altrimenti al
 * prossimo «Accedi con Google» il telefono rientrerebbe da solo con
 * l'ultimo account usato, senza chiedere quale.
 */
export async function esciDaGoogle(): Promise<void> {
  if (Platform.OS === 'web' || !googleAttivo) return;
  try {
    await libreria().GoogleSignin.signOut();
  } catch {
    // Chi non era entrato con Google non ha niente da cui uscire.
  }
}

/**
 * La lingua dell'app, tenuta come il tema: una preferenza salvata sul
 * telefono, il valore «Automatico» che segue il sistema, e un pezzo di
 * contesto che fa ridisegnare tutto quando cambia.
 *
 * Non c'è una libreria di traduzione. Le lingue sono due file di testo
 * (`it.ts`, `en.ts`) e `useT()` restituisce quello in uso: si scrive
 * `t.impostazioni.titolo`, e una voce inesistente non compila. Una libreria
 * avrebbe portato chiavi in forma di stringa — `t('impostazioni.titolo')` —
 * che nessuno controlla, e un pacchetto in più da configurare.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as Localization from 'expo-localization';
import { storage } from '@/lib/storage';
import { eErroreDiRete } from '@/lib/rete';
import { it, type Dizionario } from './it';
import { en } from './en';
import type { LanguageName, LanguagePreference } from '@/types';

const DIZIONARI: Record<LanguageName, Dizionario> = { it, en };

/** Il codice che si passa a `Intl` per date e numeri. Per l'inglese teniamo
 * quello britannico: mantiene giorno/mese come nel resto dell'app, mentre
 * `en-US` girerebbe le date in mese/giorno. */
const LOCALI: Record<LanguageName, string> = { it: 'it-IT', en: 'en-GB' };

/** I nomi delle lingue non si traducono: ognuna si chiama come si chiama nel
 * proprio alfabeto, così chi finisce per sbaglio in quella sbagliata sa
 * ancora riconoscere la sua. */
export const NOMI_LINGUA: Record<LanguageName, string> = { it: 'Italiano', en: 'English' };

export const LINGUE: LanguageName[] = ['it', 'en'];

const LANG_KEY = 'language';

/** La lingua del telefono, se è una di quelle che sappiamo parlare. Chi ha
 * il telefono in spagnolo, in tedesco o in qualunque altra lingua ottiene
 * l'inglese: è quella che ha più probabilità di capire fra le due. */
function linguaDelSistema(): LanguageName {
  const codice = Localization.getLocales()[0]?.languageCode;
  return codice === 'it' ? 'it' : 'en';
}

interface LinguaContextValue {
  /** La lingua in uso adesso: con «Automatico» è quella del telefono. */
  lingua: LanguageName;
  /** Quello che la persona ha scelto nelle impostazioni. */
  preference: LanguagePreference;
  /** Il dizionario in uso. */
  t: Dizionario;
  /** Da passare a `Intl` per date, ore, numeri e distanze. */
  locale: string;
  /** `false` finché la scelta salvata sul telefono non è stata letta: fino
   * ad allora `lingua` è quella del sistema, e potrebbe cambiare subito. */
  pronta: boolean;
  setPreference: (p: LanguagePreference) => void;
}

const LinguaContext = createContext<LinguaContextValue>({
  lingua: 'en',
  preference: 'system',
  t: en,
  locale: LOCALI.en,
  pronta: false,
  setPreference: () => {},
});

/**
 * La lingua anche fuori da React.
 *
 * I moduli in `src/lib/` (le date, le distanze, i messaggi di errore delle
 * chiamate) non sono componenti e non possono usare un hook. Qui resta una
 * copia della lingua in uso, che il provider tiene aggiornata: è lo stesso
 * valore, letto senza contesto.
 */
// Parte già dalla lingua del telefono: i moduli che la leggono prima che
// il provider abbia disegnato qualcosa non devono vedere un'altra lingua.
let corrente: LanguageName = linguaDelSistema();
export function linguaAttuale(): LanguageName {
  return corrente;
}
export function dizionario(): Dizionario {
  return DIZIONARI[corrente];
}
export function localeAttuale(): string {
  return LOCALI[corrente];
}

/**
 * Il messaggio di un errore di Supabase Auth, nella lingua in uso.
 *
 * Supabase risponde sempre in inglese («Invalid login credentials»): finché
 * l'app parlava solo italiano, quelle frasi stonavano; ora stonerebbero
 * comunque, perché non seguono la lingua scelta. Traduciamo i codici che
 * capitano davvero e per gli altri restituiamo una frase generica — meglio
 * di un messaggio tecnico in una lingua che non è quella dell'app.
 */
export function messaggioAuth(err: { code?: string; message?: string } | null | undefined): string {
  const e = dizionario().erroriAuth;
  if (eErroreDiRete(err)) return dizionario().errori.rete;
  switch (err?.code) {
    case 'invalid_credentials':
      return e.credenziali;
    case 'email_not_confirmed':
      return e.nonConfermata;
    case 'user_already_exists':
    case 'email_exists':
      return e.giaRegistrato;
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return e.troppiTentativi;
    case 'weak_password':
      return e.passwordDebole;
    case 'same_password':
      return e.stessaPassword;
    default:
      return e.generico;
  }
}

export function LinguaProvider({ children }: { children: React.ReactNode }) {
  // Chi non ha mai scelto segue il telefono: italiano su un telefono in
  // italiano, inglese su tutti gli altri. La scelta fatta a mano nelle
  // impostazioni resta salvata e da lì in poi vince sul telefono.
  const [preference, setPreferenceState] = useState<LanguagePreference>('system');
  // Rileggere le impostazioni del telefono mentre l'app è aperta non serve:
  // cambiare la lingua di sistema su iOS e Android riavvia l'app.
  const [sistema] = useState<LanguageName>(linguaDelSistema);
  const [pronta, setPronta] = useState(false);

  useEffect(() => {
    storage.get<LanguagePreference>(LANG_KEY).then((p) => {
      if (p === 'it' || p === 'en' || p === 'system') setPreferenceState(p);
      setPronta(true);
    });
  }, []);

  const setPreference = (p: LanguagePreference) => {
    setPreferenceState(p);
    storage.set(LANG_KEY, p);
  };

  const lingua: LanguageName = preference === 'system' ? sistema : preference;
  corrente = lingua;

  const value = useMemo(
    () => ({ lingua, preference, t: DIZIONARI[lingua], locale: LOCALI[lingua], pronta, setPreference }),
    [lingua, preference, pronta],
  );

  return <LinguaContext.Provider value={value}>{children}</LinguaContext.Provider>;
}

/** Tutto della lingua: il dizionario, la scelta fatta, come cambiarla. */
export function useLingua() {
  return useContext(LinguaContext);
}

/** Solo il dizionario — è quello che serve nove volte su dieci. */
export function useT(): Dizionario {
  return useContext(LinguaContext).t;
}

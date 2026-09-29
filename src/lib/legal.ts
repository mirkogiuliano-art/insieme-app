/**
 * Dove stanno i documenti legali, una volta pubblicati.
 *
 * I testi vivono nel repository (cartella `legal/`, con l'inglese in
 * `legal/en/`), ma devono essere raggiungibili anche da un browser
 * qualsiasi, senza l'app: Google chiede l'indirizzo dell'informativa nella
 * scheda del negozio, e chi valuta se installare deve poterla leggere
 * prima.
 *
 * L'app apre la versione nella lingua in cui sta parlando. Ogni pagina ha
 * in cima il collegamento all'altra lingua, e in quella inglese è scritto
 * che in caso di differenze vale l'italiano.
 *
 * Un indirizzo lasciato vuoto nasconde il documento in quella lingua: l'app
 * non mostra collegamenti che non portano da nessuna parte — le voci nelle
 * impostazioni spariscono e la riga di accettazione alla registrazione
 * resta come semplice testo.
 */

import { useLingua } from '@/i18n';
import type { LanguageName } from '@/types';

const BASE = 'https://mirkogiuliano-art.github.io/insieme-app/legal/';

export const DOCUMENTI: Record<LanguageName, { privacy: string; termini: string }> = {
  it: { privacy: `${BASE}privacy.html`, termini: `${BASE}termini.html` },
  en: { privacy: `${BASE}en/privacy.html`, termini: `${BASE}en/terms.html` },
};

/** L'informativa da indicare nella scheda del Play Store: quella
 * italiana, che è l'originale. */
export const PRIVACY_URL = DOCUMENTI.it.privacy;

/** La pagina dove chiedere la cancellazione dell'account senza installare
 * l'app: Google la pretende separata da quella dentro l'app. Di norma è
 * una sezione della stessa informativa. */
export const CANCELLAZIONE_URL = '';

/** I documenti nella lingua in uso, e se ce n'è almeno uno da mostrare. */
export function useDocumenti() {
  const { lingua } = useLingua();
  const { privacy, termini } = DOCUMENTI[lingua];
  return { privacy, termini, pubblicati: privacy.length > 0 || termini.length > 0 };
}

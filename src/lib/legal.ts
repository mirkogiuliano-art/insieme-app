/**
 * Dove stanno i documenti legali, una volta pubblicati.
 *
 * I testi vivono nel repository (cartella `legal/`), ma devono essere
 * raggiungibili anche da un browser qualsiasi, senza l'app: Google chiede
 * l'indirizzo dell'informativa nella scheda del negozio, e chi valuta se
 * installare deve poterla leggere prima.
 *
 * Finché questi due valori restano vuoti l'app non mostra collegamenti
 * rotti: le voci nelle impostazioni spariscono e la riga di accettazione
 * alla registrazione resta come semplice testo. Riempirli qui è l'unica
 * cosa da fare per accenderli ovunque.
 */
export const PRIVACY_URL = 'https://mirkogiuliano-art.github.io/insieme-app/legal/privacy.html';
export const TERMINI_URL = 'https://mirkogiuliano-art.github.io/insieme-app/legal/termini.html';

/** La pagina dove chiedere la cancellazione dell'account senza installare
 * l'app: Google la pretende separata da quella dentro l'app. Di norma è
 * una sezione della stessa informativa. */
export const CANCELLAZIONE_URL = '';

export const haiPubblicatoIDocumenti = PRIVACY_URL.length > 0 || TERMINI_URL.length > 0;

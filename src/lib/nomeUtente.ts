/**
 * Il nome utente: quello con cui ti trova chi cerca, come su Instagram.
 * Serve solo a chi ha un gruppo pubblico, e si sceglie la prima volta che
 * se ne rende pubblico uno, partendo da un suggerimento.
 *
 * Da 3 a 24 caratteri fra lettere minuscole, cifre, punto e trattino
 * basso; niente punto all'inizio o alla fine.
 */
const AMMESSI = /^[a-z0-9._]{3,24}$/;

export function nomeUtenteValido(nome: string): boolean {
  return AMMESSI.test(nome) && !nome.startsWith('.') && !nome.endsWith('.');
}

/** Quello che si scrive, ridotto alla forma ammessa: «@Giulia Romano» →
 * «giulia.romano». */
export function normalizzaNomeUtente(testo: string): string {
  return testo
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._]/g, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, 24);
}

/** Il primo suggerimento, dal nome che la persona ha già scelto. */
export function suggerisciNomeUtente(nome: string): string {
  const base = normalizzaNomeUtente(nome).replace(/^\.+|\.+$/g, '');
  return base.length >= 3 ? base : `${base || 'insieme'}.viaggi`.slice(0, 24);
}

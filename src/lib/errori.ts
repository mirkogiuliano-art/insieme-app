/**
 * Il messaggio da mostrare quando un'azione non riesce.
 *
 * Il testo grezzo di un errore non va mai a schermo: può essere una frase
 * tecnica in inglese del server ("new row violates row-level security
 * policy"), oppure un messaggio delle funzioni del database, che sono
 * scritte in italiano anche per chi usa l'app in inglese. Qui l'errore
 * diventa una frase del dizionario, nella lingua in uso:
 *
 * - senza rete o con il server irraggiungibile, si dice quello;
 * - una richiesta scaduta resta "ha impiegato troppo tempo";
 * - i messaggi che il database solleva di proposito (`raise exception`
 *   nelle migrazioni) hanno ciascuno la sua traduzione;
 * - per tutto il resto vale il messaggio di riserva dell'azione ("Non sono
 *   riuscito a salvare la riga"), che dice almeno cosa non è andato.
 */

import { dizionario } from '@/i18n';
import { it } from '@/i18n/it';
import { en } from '@/i18n/en';
import { eErroreDiRete } from '@/lib/rete';

export { eErroreDiRete };

type ChiaveServer = keyof typeof it.erroriServer;

/** Il testo esatto dei `raise exception` in supabase/migrations. Un
 * messaggio nuovo va aggiunto qui, altrimenti a schermo finisce quello di
 * riserva: niente di sbagliato, solo meno preciso. */
const DAL_DATABASE: Record<string, ChiaveServer> = {
  'Non sei membro di questo gruppo.': 'nonMembro',
  'Non fai parte di questo gruppo.': 'nonMembro',
  'Devi essere autenticato.': 'nonAutenticato',
  'Devi essere autenticato per creare un gruppo.': 'nonAutenticato',
  'Devi essere autenticato per accettare un invito.': 'nonAutenticato',
  'Gruppo non trovato.': 'gruppoNonTrovato',
  'Sondaggio non trovato.': 'sondaggioNonTrovato',
  'Posto non trovato.': 'postoNonTrovato',
  'Categoria non trovata.': 'categoriaNonTrovata',
  'Messaggio inesistente.': 'messaggioInesistente',
  'Categoria non valida per questo gruppo.': 'categoriaNonValida',
  'Questo posto non è di questo gruppo.': 'postoAltroGruppo',
  "Non puoi eliminare l'unica categoria del gruppo.": 'unicaCategoria',
  'Serve una domanda.': 'serveDomanda',
  'Servono almeno due risposte diverse.': 'dueRisposte',
  'Al massimo dieci risposte.': 'dieciRisposte',
  'Risposta non valida.': 'rispostaNonValida',
  'Questo sondaggio è chiuso.': 'sondaggioChiuso',
  'Questo sondaggio accetta una risposta sola.': 'rispostaSola',
  'Può chiuderlo solo chi l’ha aperto.': 'soloChiLoApre',
  'La descrizione è troppo lunga.': 'descrizioneLunga',
  'La data di fine viene prima di quella di inizio.': 'dateInvertite',
  'Invito non valido o revocato.': 'invitoNonValido',
  'Colore non valido.': 'coloreNonValido',
};

type ErroreQualunque = { message?: unknown; code?: unknown; name?: unknown } | null | undefined;

function testoDi(err: unknown): string {
  const m = (err as ErroreQualunque)?.message;
  return typeof m === 'string' ? m.trim() : '';
}

export function messaggioErrore(err: unknown, riserva: string): string {
  const d = dizionario();
  const testo = testoDi(err);
  const codice = (err as ErroreQualunque)?.code;
  if (eErroreDiRete(err)) return d.errori.rete;
  if (testo === it.errori.tempoScaduto || testo === en.errori.tempoScaduto) return d.errori.tempoScaduto;
  const chiave = DAL_DATABASE[testo];
  if (chiave) return d.erroriServer[chiave];
  // 42501: una regola di accesso ha detto di no. Quasi sempre vuol dire
  // che nel frattempo si è usciti dal gruppo.
  if (codice === '42501') return d.erroriServer.permesso;
  // Sessione scaduta o non più valida.
  if (codice === 'PGRST301' || /JWT/.test(testo)) return d.erroriServer.nonAutenticato;
  return riserva;
}

/** Manca la rete, o il server non risponde in tempo: non è un guasto
 * dell'app, e non va mandato a Sentry ogni volta che l'app riprova. */
export function eProblemaDiRete(err: unknown): boolean {
  const testo = testoDi(err);
  return eErroreDiRete(err) || testo === it.errori.tempoScaduto || testo === en.errori.tempoScaduto;
}

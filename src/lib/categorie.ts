/**
 * I nomi delle categorie che nascono con il gruppo.
 *
 * La funzione che crea un gruppo (create_group, nelle migrazioni) scrive le
 * categorie di partenza con il nome italiano: "Generale" per i link, "Da
 * visitare", "Ristorante", "Bar", "Evento", "Altro" per i posti. In un
 * gruppo dove qualcuno usa l'app in inglese, quei nomi resterebbero in
 * italiano. Qui si mostrano nella lingua di chi guarda.
 *
 * Il nome nel database non cambia: finché nessuno rinomina la categoria,
 * ognuno la vede nella sua lingua. Quando qualcuno la rinomina il nome
 * diventa suo, ed è quello per tutti.
 */

import { dizionario } from '@/i18n';
import type { Dizionario } from '@/i18n/it';

type Predefinita = keyof Dizionario['categoria']['predefinite'];

const PREDEFINITE: Record<string, Predefinita> = {
  Generale: 'generale',
  'Da visitare': 'daVisitare',
  Ristorante: 'ristorante',
  Bar: 'bar',
  Evento: 'evento',
  Altro: 'altro',
};

/** Il nome da mostrare: tradotto se è uno di quelli di partenza, quello
 * scelto dal gruppo altrimenti. */
export function nomeCategoria(nome: string): string {
  const chiave = PREDEFINITE[nome];
  return chiave ? dizionario().categoria.predefinite[chiave] : nome;
}

/** La categoria dei link che nasce con il gruppo e non si elimina. Si
 * riconosce dal nome nel database, non da quello mostrato, che cambia con
 * la lingua. */
export function eGeneraleDeiLink(nomeNelDatabase: string): boolean {
  return nomeNelDatabase === 'Generale';
}

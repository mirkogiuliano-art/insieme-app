import { supabase } from '@/lib/supabase';

/**
 * Quello che una scheda della home mostra oltre al nome del gruppo.
 *
 * La funzione `group_previews()` restituisce anche l'ultimo messaggio
 * (testo, tipo di allegato, autore, orario): la scheda per ora non lo
 * mostra, ma resta nel database così rimetterlo non richiede di
 * rilanciare una migrazione. Qui si dichiara solo ciò che serve
 * davvero.
 */
export interface GroupPreview {
  groupId: string;
  /** Messaggi degli altri arrivati dopo l'ultima apertura della chat. */
  unread: number;
  memberCount: number;
  /** Primi quattro membri per data di ingresso: la scheda ne mostra tre
   * più il "+N". */
  memberNames: string[];
}

interface PreviewRow {
  group_id: string;
  unread: number | null;
  member_count: number | null;
  member_names: string[] | null;
}

/**
 * Anteprime di tutti i gruppi di cui faccio parte, indicizzate per id.
 *
 * A differenza dell'elenco dei gruppi, qui un fallimento non è grave e
 * non viene propagato: senza anteprime le schede restano con il solo
 * nome, che è esattamente quello che la home mostrava prima. Bloccare o
 * svuotare la schermata per un dato accessorio sarebbe sproporzionato.
 */
export async function listGroupPreviews(): Promise<Record<string, GroupPreview>> {
  const { data, error } = await supabase.rpc('group_previews');
  if (error || !data) return {};

  const byGroup: Record<string, GroupPreview> = {};
  for (const row of data as PreviewRow[]) {
    byGroup[row.group_id] = {
      groupId: row.group_id,
      unread: row.unread ?? 0,
      memberCount: row.member_count ?? 0,
      memberNames: row.member_names ?? [],
    };
  }
  return byGroup;
}

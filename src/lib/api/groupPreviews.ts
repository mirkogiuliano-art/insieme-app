import { supabase } from '@/lib/supabase';
import { dizionario } from '@/i18n';
import { parsePlaceMessage } from '@/lib/chatPlace';

/** Quello che una scheda della home mostra oltre al nome del gruppo. */
export interface GroupPreview {
  groupId: string;
  /** Messaggi degli altri arrivati dopo l'ultima apertura della chat. */
  unread: number;
  memberCount: number;
  /** Primi quattro membri per data di ingresso: la scheda ne mostra tre
   * più il "+N". */
  memberNames: string[];
  /** Quando è arrivato l'ultimo messaggio: serve a ordinare i gruppi per
   * attività recente. `null` se nel gruppo non si è ancora scritto. */
  lastAt: number | null;
  /** L'ultimo messaggio, senza quelli di chi ho bloccato: chi l'ha scritto
   * e una riga da leggere al posto del messaggio intero. */
  ultimo: { autore: string; testo: string } | null;
  /** I sondaggi aperti in cui non ho ancora votato: la domanda del più
   * recente e quanti sono. */
  daVotare: { domanda: string; quanti: number } | null;
}

interface PreviewRow {
  group_id: string;
  last_text: string | null;
  last_kind: string | null;
  last_name: string | null;
  last_author: string | null;
  last_at: string | null;
  unread: number | null;
  member_count: number | null;
  member_names: string[] | null;
  da_votare: string | null;
  da_votare_n: number | null;
}

/** La riga da leggere sulla scheda: il nome per un posto, la prima riga per
 * un testo, il tipo per un allegato senza testo. */
function rigaDi(row: PreviewRow): string {
  const s = dizionario().segnaposto;
  if (row.last_text) return parsePlaceMessage(row.last_text)?.name ?? row.last_text.split('\n')[0];
  if (row.last_kind === 'image') return s.foto;
  if (row.last_kind === 'video') return s.video;
  if (row.last_kind === 'file') return row.last_name || s.documento;
  return s.allegato;
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
      lastAt: row.last_at ? new Date(row.last_at).getTime() : null,
      ultimo: row.last_at ? { autore: row.last_author ?? dizionario().segnaposto.qualcuno, testo: rigaDi(row) } : null,
      daVotare: row.da_votare ? { domanda: row.da_votare, quanti: row.da_votare_n ?? 1 } : null,
    };
  }
  return byGroup;
}

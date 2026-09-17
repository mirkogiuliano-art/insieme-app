import { supabase } from '@/lib/supabase';

/**
 * Segnalare un messaggio e bloccare una persona.
 *
 * Due strumenti diversi, con due destinatari diversi: la segnalazione
 * parla a chi gestisce il servizio e non cambia niente su quello che si
 * vede; il blocco parla solo al proprio telefono e non lascia traccia
 * all'altra persona. Vedi 20260917090000_segnala_blocca.sql.
 */

/** Manda una segnalazione. Il testo del messaggio viene copiato lato
 * database nel momento della segnalazione, così resta valutabile anche
 * se poi il messaggio o il gruppo spariscono. */
export async function reportMessage(messageId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('report_message', { p_message_id: messageId, p_reason: reason });
  if (error) throw error;
}

/** Chi ho bloccato. Usata per togliere dalla chat i loro messaggi. */
export async function listBlocked(): Promise<string[]> {
  const { data, error } = await supabase.from('blocked_users').select('blocked_id');
  if (error || !data) return [];
  return data.map((r) => (r as { blocked_id: string }).blocked_id);
}

/** Chi ho bloccato, con il nome da mostrare. Due letture invece di un
 * join annidato per lo stesso motivo spiegato in groupMembers.listRoster:
 * fra `blocked_users` e `profiles` non c'è una chiave esterna diretta,
 * quindi PostgREST non saprebbe come collegarle. */
export async function listBlockedWithNames(): Promise<{ id: string; name: string }[]> {
  const ids = await listBlocked();
  if (ids.length === 0) return [];
  const { data } = await supabase.from('profiles').select('id, display_name').in('id', ids);
  const nomi: Record<string, string> = {};
  for (const p of data ?? []) {
    const riga = p as { id: string; display_name: string | null };
    if (riga.display_name) nomi[riga.id] = riga.display_name;
  }
  // Chi non condivide più nessun gruppo con me non è leggibile, ed è
  // giusto così: resta bloccato lo stesso, solo senza nome.
  return ids.map((id) => ({ id, name: nomi[id] ?? 'Utente' }));
}

export async function blockUser(userId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { error } = await supabase
    .from('blocked_users')
    .insert({ blocker_id: auth.user.id, blocked_id: userId });
  // Bloccare due volte non è un errore da mostrare: il risultato voluto
  // — quella persona è bloccata — è già vero.
  if (error && (error as { code?: string }).code !== '23505') throw error;
}

export async function unblockUser(userId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', auth.user.id)
    .eq('blocked_id', userId);
  if (error) throw error;
}

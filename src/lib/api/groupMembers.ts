import { supabase } from '@/lib/supabase';

// L'iscrizione diretta non esiste più: si entra solo riscattando un invito
// (redeemInvite in src/lib/api/invites.ts). Lato database l'inserimento in
// group_members è vietato a tutti proprio per impedire di rientrare da qui.

/** Esce dal gruppo. Se era l'ultimo membro il gruppo viene eliminato con
 * tutto il suo contenuto: ritorna `true` in quel caso, così chi chiama può
 * dirlo all'utente. Vedi 20260902120000_delete_empty_groups.sql. */
export async function leaveGroup(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('leave_group', { p_group_id: code });
  if (error) throw error;
  return data === true;
}

/** Quanti membri ha il gruppo. Serve ad avvisare chi sta per uscire che,
 * essendo rimasto solo, uscendo cancellerà tutto. */
export async function countMembers(code: string): Promise<number> {
  const { data, error } = await supabase.rpc('count_group_members', { p_group_id: code });
  if (error || typeof data !== 'number') return 0;
  return data;
}


/** Mappa userId → nome visualizzato, per risolvere gli autori di
 * messaggi/link/pin senza salvare il nome per riga.
 *
 * Due query separate invece di un join annidato ("group_members.select(
 * 'user_id, profiles(display_name)')"): PostgREST fa l'embedding
 * automatico solo se esiste una foreign key diretta tra le due tabelle,
 * ma group_members e profiles puntano entrambe a auth.users senza
 * riferirsi direttamente l'una all'altra, quindi il join annidato non si
 * risolve. */
export async function listRoster(code: string): Promise<Record<string, string>> {
  const { data: members, error: membersError } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', code);
  if (membersError || !members || members.length === 0) return {};

  const userIds = members.map((m) => m.user_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds);

  const roster: Record<string, string> = {};
  for (const id of userIds) roster[id] = 'Utente';
  if (!profilesError && profiles) {
    for (const p of profiles) {
      if (p.display_name) roster[p.id] = p.display_name;
    }
  }
  return roster;
}

/** Mappa userId → ultima volta che ha aperto la chat (epoch ms), o null se
 * non l'ha mai aperta. Usata per calcolare le spunte di lettura: un
 * messaggio è "letto" se almeno un altro membro ha last_read_at
 * successivo al suo orario di invio. */
/** A differenza degli elenchi principali questa resta tollerante: serve
 * solo alle spunte di lettura, e perderle non svuota nessuna schermata. */
export async function listLastReads(code: string): Promise<Record<string, number | null>> {
  const { data, error } = await supabase.from('group_members').select('user_id, last_read_at').eq('group_id', code);
  if (error || !data) return {};
  const map: Record<string, number | null> = {};
  for (const row of data) map[row.user_id] = row.last_read_at ? new Date(row.last_read_at).getTime() : null;
  return map;
}

/** Segna "letto fino ad ora" per l'utente corrente in questo gruppo. */
export async function updateLastRead(code: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { error } = await supabase
    .from('group_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('group_id', code)
    .eq('user_id', auth.user.id);
  if (error) throw error;
}

/** Sottoscrive gli aggiornamenti di last_read_at degli altri membri, per
 * far comparire le spunte di lettura in tempo reale senza refresh.
 *
 * Il nome del canale include un suffisso casuale: ChatTab e GroupInfoSheet
 * possono essere montati insieme (il secondo è un BottomSheet sopra il
 * primo) e chiamano entrambi questa funzione per lo stesso gruppo — con lo
 * stesso nome, supabase-js riuserebbe il canale già sottoscritto dal primo
 * e il secondo `.on(...)` fallirebbe ("cannot add postgres_changes
 * callbacks... after subscribe()"). */
export function subscribeToLastReads(code: string, onUpdate: (userId: string, lastReadAt: number) => void): () => void {
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const channel = supabase
    .channel(`group_members_read:${code}:${uniqueSuffix}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'group_members', filter: `group_id=eq.${code}` },
      (payload) => {
        const row = payload.new as { user_id: string; last_read_at: string | null };
        if (row.last_read_at) onUpdate(row.user_id, new Date(row.last_read_at).getTime());
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Avvisa quando qualcuno entra nel gruppo dopo che il roster è già stato
 * caricato, così i suoi messaggi/link/pin mostrano subito il nome giusto
 * invece del fallback "Utente". Sul suffisso casuale nel nome del canale
 * vedi subscribeToLastReads qui sopra. */
export function subscribeToRoster(
  code: string,
  onJoin: (userId: string, displayName: string) => void,
): () => void {
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const channel = supabase
    .channel(`group_members:${code}:${uniqueSuffix}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_members', filter: `group_id=eq.${code}` },
      async (payload) => {
        const userId = (payload.new as { user_id: string }).user_id;
        const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
        onJoin(userId, data?.display_name || 'Utente');
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

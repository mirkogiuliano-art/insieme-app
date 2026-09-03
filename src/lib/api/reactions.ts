import { supabase } from '@/lib/supabase';

export interface RawReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
}

interface ReactionRow {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

const SELECT_COLUMNS = 'id, message_id, user_id, emoji';

function toRaw(row: ReactionRow): RawReaction {
  return { id: row.id, messageId: row.message_id, userId: row.user_id, emoji: row.emoji };
}

export async function listReactions(groupId: string): Promise<RawReaction[]> {
  const { data, error } = await supabase.from('message_reactions').select(SELECT_COLUMNS).eq('group_id', groupId);
  // Un elenco vuoto per errore è indistinguibile da un elenco davvero
  // vuoto: chi chiama deve poter distinguere i due casi e riprovare.
  if (error) throw error;
  if (!data) return [];
  return data.map(toRaw);
}

/** Se l'utente ha già messo questa reazione la toglie, altrimenti la aggiunge. */
export async function toggleReaction(
  messageId: string,
  groupId: string,
  userId: string,
  emoji: string,
  alreadyReacted: boolean,
): Promise<void> {
  if (alreadyReacted) {
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('message_reactions')
      .insert({ message_id: messageId, group_id: groupId, user_id: userId, emoji });
    if (error) throw error;
  }
}

/** Il suffisso casuale rende univoco il nome del canale.
 * supabase-js riusa lo stesso oggetto canale a parità di nome: se due
 * componenti montati insieme si iscrivono allo stesso, la seconda `.on()`
 * fallisce ("cannot add postgres_changes callbacks ... after subscribe()").
 * Per `postgres_changes` il nome conta solo per questo client, quindi
 * renderlo univoco non ha controindicazioni — al contrario dei canali
 * broadcast, dove il nome è il punto d'incontro fra client diversi e deve
 * restare identico (vedi typing.ts). */
export function subscribeToReactions(
  groupId: string,
  handlers: { onInsert: (reaction: RawReaction) => void; onDelete: (id: string) => void },
): () => void {
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const channel = supabase
    .channel(`message_reactions:${groupId}:${uniqueSuffix}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: `group_id=eq.${groupId}` },
      (payload) => handlers.onInsert(toRaw(payload.new as ReactionRow)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'message_reactions', filter: `group_id=eq.${groupId}` },
      (payload) => handlers.onDelete((payload.old as { id: string }).id),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

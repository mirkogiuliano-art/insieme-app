import { supabase } from '@/lib/supabase';
import type { AttachmentKind } from '@/lib/api/mediaUpload';

interface MessageRow {
  id: string;
  user_id: string;
  text: string | null;
  created_at: string;
  reply_to_id: string | null;
  attachment_url: string | null;
  attachment_type: AttachmentKind | null;
  attachment_duration_seconds: number | null;
}

export interface RawMessage {
  id: string;
  userId: string;
  text: string | null;
  ts: number;
  replyToId?: string | null;
  attachmentUrl?: string | null;
  attachmentType?: AttachmentKind | null;
  attachmentDurationSeconds?: number | null;
}

const SELECT_COLUMNS =
  'id, user_id, text, created_at, reply_to_id, attachment_url, attachment_type, attachment_duration_seconds';

function toRaw(row: MessageRow): RawMessage {
  return {
    id: row.id,
    userId: row.user_id,
    text: row.text,
    ts: new Date(row.created_at).getTime(),
    replyToId: row.reply_to_id,
    attachmentUrl: row.attachment_url,
    attachmentType: row.attachment_type,
    attachmentDurationSeconds: row.attachment_duration_seconds,
  };
}

/** Ultimi `limit` messaggi del gruppo, dal più recente al più vecchio —
 * ordine che si aspetta la FlatList invertita della chat (indice 0 = messaggio
 * più recente, mostrato in fondo). */
/** Ultimi messaggi del gruppo, dal più recente.
 *
 * `beforeTs` serve a scorrere all'indietro: passando l'orario del messaggio
 * più vecchio già in mano si ottiene la pagina precedente. Senza, la chat
 * si fermava ai primi 150 messaggi e il resto era irraggiungibile — anche
 * per la ricerca, che guarda solo ciò che è stato caricato. */
export async function listMessages(groupId: string, limit = 150, beforeTs?: number): Promise<RawMessage[]> {
  let query = supabase
    .from('messages')
    .select(SELECT_COLUMNS)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (beforeTs !== undefined) query = query.lt('created_at', new Date(beforeTs).toISOString());
  const { data, error } = await query;
  // Un elenco vuoto per errore è indistinguibile da un elenco davvero
  // vuoto: chi chiama deve poter distinguere i due casi e riprovare.
  if (error) throw error;
  if (!data) return [];
  return data.map(toRaw);
}

export interface NewMessageAttachment {
  url: string;
  type: AttachmentKind;
  durationSeconds?: number;
}

export async function sendMessage(
  groupId: string,
  userId: string,
  text: string | null,
  replyToId?: string | null,
  attachment?: NewMessageAttachment | null,
): Promise<RawMessage> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      group_id: groupId,
      user_id: userId,
      text,
      reply_to_id: replyToId ?? null,
      attachment_url: attachment?.url ?? null,
      attachment_type: attachment?.type ?? null,
      attachment_duration_seconds: attachment?.durationSeconds ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error || !data) throw error ?? new Error('Invio del messaggio non riuscito.');
  return toRaw(data);
}

/** Sottoscrive i nuovi messaggi del gruppo in tempo reale. Ritorna una
 * funzione per disiscriversi (da chiamare allo smontaggio del componente).
 *
 * Il suffisso casuale rende univoco il nome del canale: supabase-js riusa
 * lo stesso oggetto a parità di nome, e se due componenti montati insieme
 * si iscrivono allo stesso la seconda `.on()` fallisce. Per
 * `postgres_changes` il nome conta solo per questo client — al contrario
 * dei canali broadcast, dove è il punto d'incontro fra client diversi e
 * deve restare identico (vedi typing.ts). */
export function subscribeToMessages(groupId: string, onInsert: (message: RawMessage) => void): () => void {
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const channel = supabase
    .channel(`messages:${groupId}:${uniqueSuffix}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` },
      (payload) => onInsert(toRaw(payload.new as MessageRow)),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

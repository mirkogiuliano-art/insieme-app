import { supabase } from '@/lib/supabase';

interface PollRow {
  id: string;
  group_id: string;
  created_by: string;
  question: string;
  options: string[];
  multi: boolean;
  secret: boolean;
  counts: number[];
  voters_count: number;
  closed_at: string | null;
  created_at: string;
}

export interface RawPoll {
  id: string;
  createdBy: string;
  question: string;
  options: string[];
  /** Ognuno può scegliere più di una risposta. */
  multi: boolean;
  /** Si vedono i numeri, non chi ha votato cosa. */
  secret: boolean;
  /** Voti per risposta, nello stesso ordine di `options`. Li tiene il
   * database sulla riga del sondaggio, non si contano qui: col voto
   * segreto i voti altrui non sono leggibili, e in ogni caso gli eventi in
   * tempo reale dei voti arrivano filtrati da chi può vederli. */
  counts: number[];
  votersCount: number;
  closed: boolean;
  ts: number;
}

export interface RawVote {
  pollId: string;
  userId: string;
  optionIndex: number;
}

const SELECT_COLUMNS =
  'id, group_id, created_by, question, options, multi, secret, counts, voters_count, closed_at, created_at';

function toRaw(row: PollRow): RawPoll {
  return {
    id: row.id,
    createdBy: row.created_by,
    question: row.question,
    options: row.options ?? [],
    multi: row.multi,
    secret: row.secret,
    counts: row.counts ?? [],
    votersCount: row.voters_count ?? 0,
    closed: row.closed_at !== null,
    ts: new Date(row.created_at).getTime(),
  };
}

/** Tutti i sondaggi del gruppo. Sono pochi e piccoli: si caricano insieme
 * alla chat, così la scheda è già pronta quando compare il messaggio. */
export async function listPolls(groupId: string): Promise<RawPoll[]> {
  const { data, error } = await supabase
    .from('polls')
    .select(SELECT_COLUMNS)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as PollRow[]).map(toRaw);
}

/**
 * I voti che si possono vedere: tutti nei sondaggi normali, solo i propri
 * in quelli a voto segreto. È il database a decidere, non questa funzione.
 */
export async function listVotes(groupId: string): Promise<RawVote[]> {
  const { data, error } = await supabase
    .from('poll_votes')
    .select('poll_id, user_id, option_index')
    .eq('group_id', groupId);
  if (error) throw error;
  return (data as { poll_id: string; user_id: string; option_index: number }[]).map((v) => ({
    pollId: v.poll_id,
    userId: v.user_id,
    optionIndex: v.option_index,
  }));
}

/** Crea il sondaggio e, nello stesso momento, il messaggio che lo porta in
 * chat: è una sola chiamata, così non può restare un sondaggio senza
 * messaggio o viceversa. */
export async function createPoll(
  groupId: string,
  question: string,
  options: string[],
  opts: { multi?: boolean; secret?: boolean } = {},
): Promise<string> {
  const { data, error } = await supabase.rpc('crea_sondaggio', {
    p_group_id: groupId,
    p_question: question,
    p_options: options,
    p_multi: opts.multi ?? false,
    p_secret: opts.secret ?? false,
  });
  if (error) throw error;
  return data as string;
}

/** Vota, o cambia voto: si manda sempre l'elenco completo delle proprie
 * scelte. Un elenco vuoto toglie il voto. */
export async function votePoll(pollId: string, optionIndexes: number[]): Promise<void> {
  const { error } = await supabase.rpc('vota_sondaggio', { p_poll_id: pollId, p_options: optionIndexes });
  if (error) throw error;
}

/** Chiude il sondaggio: dopo non si vota più. Solo chi l'ha aperto. */
export async function closePoll(pollId: string): Promise<void> {
  const { error } = await supabase.rpc('chiudi_sondaggio', { p_poll_id: pollId });
  if (error) throw error;
}

/**
 * I sondaggi e i voti in tempo reale.
 *
 * I conteggi arrivano dagli UPDATE su `polls`, che tutti i membri possono
 * vedere; i voti riga per riga servono solo a sapere chi ha scelto cosa, e
 * nei sondaggi segreti non arrivano affatto.
 */
export function subscribeToPolls(
  groupId: string,
  handlers: { onPoll: (poll: RawPoll) => void; onVotesChanged: () => void },
): () => void {
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const channel = supabase
    .channel(`polls:${groupId}:${uniqueSuffix}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'polls', filter: `group_id=eq.${groupId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') return;
        handlers.onPoll(toRaw(payload.new as PollRow));
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'poll_votes', filter: `group_id=eq.${groupId}` },
      () => handlers.onVotesChanged(),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

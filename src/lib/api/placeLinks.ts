import { supabase } from '@/lib/supabase';

/** Collegamento molti-a-molti fra un posto della mappa e un elemento della
 * sezione Link (vedi supabase/migrations/20260831120000_place_links.sql). */
export interface RawPlaceLink {
  id: string;
  pinId: string;
  linkId: string;
  createdBy: string;
  ts: number;
}

interface PlaceLinkRow {
  id: string;
  pin_id: string;
  link_id: string;
  created_by: string;
  created_at: string;
}

const SELECT_COLUMNS = 'id, pin_id, link_id, created_by, created_at';

function toRaw(row: PlaceLinkRow): RawPlaceLink {
  return {
    id: row.id,
    pinId: row.pin_id,
    linkId: row.link_id,
    createdBy: row.created_by,
    ts: new Date(row.created_at).getTime(),
  };
}

export async function listPlaceLinks(groupId: string): Promise<RawPlaceLink[]> {
  const { data, error } = await supabase
    .from('place_links')
    .select(SELECT_COLUMNS)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  // Un elenco vuoto per errore è indistinguibile da un elenco davvero
  // vuoto: chi chiama deve poter distinguere i due casi e riprovare.
  if (error) throw error;
  if (!data) return [];
  return data.map(toRaw);
}

export async function createPlaceLink(
  groupId: string,
  userId: string,
  pinId: string,
  linkId: string,
): Promise<RawPlaceLink> {
  const { data, error } = await supabase
    .from('place_links')
    .insert({ group_id: groupId, pin_id: pinId, link_id: linkId, created_by: userId })
    .select(SELECT_COLUMNS)
    .single();
  if (error || !data) throw error ?? new Error('Collegamento non riuscito.');
  return toRaw(data);
}

export async function deletePlaceLink(id: string): Promise<void> {
  const { error } = await supabase.from('place_links').delete().eq('id', id);
  if (error) throw error;
}

/** Il suffisso casuale evita la collisione di nome canale quando due
 * componenti montati insieme sottoscrivono lo stesso gruppo: supabase-js
 * riusa l'oggetto canale a parità di topic e la seconda `.on()` fallisce
 * ("cannot add postgres_changes callbacks ... after subscribe()"). */
export function subscribeToPlaceLinks(
  groupId: string,
  handlers: { onInsert: (pl: RawPlaceLink) => void; onDelete: (id: string) => void },
): () => void {
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const channel = supabase
    .channel(`place_links:${groupId}:${uniqueSuffix}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'place_links', filter: `group_id=eq.${groupId}` },
      (payload) => handlers.onInsert(toRaw(payload.new as PlaceLinkRow)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'place_links', filter: `group_id=eq.${groupId}` },
      (payload) => handlers.onDelete((payload.old as { id: string }).id),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

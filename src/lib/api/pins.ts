import { supabase } from '@/lib/supabase';

export interface RawPin {
  id: string;
  userId: string;
  lat: number;
  lng: number;
  name: string;
  categoryId: string | null;
  /** Indirizzo che apre la scheda del luogo su Google Maps, quando lo
   * conosciamo — vedi supabase/migrations/20260901090000_pins_maps_url.sql. */
  mapsUrl: string | null;
  ts: number;
}

interface PinRow {
  id: string;
  user_id: string;
  lat: number;
  lng: number;
  name: string;
  category_id: string | null;
  maps_url: string | null;
  created_at: string;
}

const SELECT_COLUMNS = 'id, user_id, lat, lng, name, category_id, maps_url, created_at';

function toRaw(row: PinRow): RawPin {
  return {
    id: row.id,
    userId: row.user_id,
    lat: row.lat,
    lng: row.lng,
    name: row.name,
    categoryId: row.category_id,
    mapsUrl: row.maps_url ?? null,
    ts: new Date(row.created_at).getTime(),
  };
}

export async function listPins(groupId: string): Promise<RawPin[]> {
  const { data, error } = await supabase
    .from('pins')
    .select(SELECT_COLUMNS)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  // Un elenco vuoto per errore è indistinguibile da un elenco davvero
  // vuoto: chi chiama deve poter distinguere i due casi e riprovare.
  if (error) throw error;
  if (!data) return [];
  return data.map(toRaw);
}

export interface NewPin {
  lat: number;
  lng: number;
  name: string;
  categoryId: string;
  mapsUrl?: string | null;
}

export async function createPin(groupId: string, userId: string, pin: NewPin): Promise<RawPin> {
  const { data, error } = await supabase
    .from('pins')
    .insert({
      group_id: groupId,
      user_id: userId,
      lat: pin.lat,
      lng: pin.lng,
      name: pin.name,
      category_id: pin.categoryId,
      maps_url: pin.mapsUrl ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error || !data) throw error ?? new Error('Salvataggio del posto non riuscito.');
  return toRaw(data);
}

export async function deletePin(id: string): Promise<void> {
  const { error } = await supabase.from('pins').delete().eq('id', id);
  if (error) throw error;
}

/** Il suffisso casuale rende univoco il nome del canale.
 * supabase-js riusa lo stesso oggetto canale a parità di nome: se due
 * componenti montati insieme si iscrivono allo stesso, la seconda `.on()`
 * fallisce ("cannot add postgres_changes callbacks ... after subscribe()").
 * Per `postgres_changes` il nome conta solo per questo client, quindi
 * renderlo univoco non ha controindicazioni — al contrario dei canali
 * broadcast, dove il nome è il punto d'incontro fra client diversi e deve
 * restare identico (vedi typing.ts). */
export function subscribeToPins(
  groupId: string,
  handlers: {
    onInsert: (pin: RawPin) => void;
    onUpdate: (pin: RawPin) => void;
    onDelete: (id: string) => void;
  },
): () => void {
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const channel = supabase
    .channel(`pins:${groupId}:${uniqueSuffix}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pins', filter: `group_id=eq.${groupId}` },
      (payload) => handlers.onInsert(toRaw(payload.new as PinRow)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pins', filter: `group_id=eq.${groupId}` },
      (payload) => handlers.onUpdate(toRaw(payload.new as PinRow)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'pins', filter: `group_id=eq.${groupId}` },
      (payload) => handlers.onDelete((payload.old as { id: string }).id),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

import { supabase } from '@/lib/supabase';

export interface RawPlaceCategory {
  id: string;
  name: string;
  color: string;
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
}

const SELECT_COLUMNS = 'id, name, color';

function toRaw(row: CategoryRow): RawPlaceCategory {
  return { id: row.id, name: row.name, color: row.color };
}

/** Le 5 categorie di default vengono già create insieme al gruppo
 * (funzione create_group), quindi qui non serve alcun seeding lato client. */
export async function listCategories(groupId: string): Promise<RawPlaceCategory[]> {
  const { data, error } = await supabase
    .from('place_categories')
    .select(SELECT_COLUMNS)
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });
  // Un elenco vuoto per errore è indistinguibile da un elenco davvero
  // vuoto: chi chiama deve poter distinguere i due casi e riprovare.
  if (error) throw error;
  if (!data) return [];
  return data.map(toRaw);
}

export async function createCategory(groupId: string, name: string, color: string): Promise<RawPlaceCategory> {
  const { data, error } = await supabase
    .from('place_categories')
    .insert({ group_id: groupId, name, color })
    .select(SELECT_COLUMNS)
    .single();
  if (error || !data) throw error ?? new Error('Creazione categoria non riuscita.');
  return toRaw(data);
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('place_categories').update({ name }).eq('id', id);
  if (error) throw error;
}

/** Il colore di una categoria, per tutto il gruppo. La regola di modifica
 * è la stessa della rinomina. */
export async function recolorCategory(id: string, color: string): Promise<void> {
  const { error } = await supabase.from('place_categories').update({ color }).eq('id', id);
  if (error) throw error;
}

/** Riassegna i posti rimasti alla categoria più vecchia del gruppo, poi
 * cancella la categoria (funzione atomica lato database — vedi migrazione
 * 20260828110000). Fallisce se è l'unica categoria del gruppo. */
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_place_category', { p_category_id: id });
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
export function subscribeToCategories(
  groupId: string,
  handlers: {
    onInsert: (category: RawPlaceCategory) => void;
    onUpdate: (category: RawPlaceCategory) => void;
    onDelete: (id: string) => void;
  },
): () => void {
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const channel = supabase
    .channel(`place_categories:${groupId}:${uniqueSuffix}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'place_categories', filter: `group_id=eq.${groupId}` },
      (payload) => handlers.onInsert(toRaw(payload.new as CategoryRow)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'place_categories', filter: `group_id=eq.${groupId}` },
      (payload) => handlers.onUpdate(toRaw(payload.new as CategoryRow)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'place_categories', filter: `group_id=eq.${groupId}` },
      (payload) => handlers.onDelete((payload.old as { id: string }).id),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

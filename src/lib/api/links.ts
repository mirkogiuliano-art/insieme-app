import { supabase } from '@/lib/supabase';
import type { LinkPlatform } from '@/types';

export interface RawLink {
  id: string;
  userId: string;
  url: string;
  title: string;
  platform: LinkPlatform;
  label: string;
  thumb: string | null;
  categoryId: string;
  /** Preferito condiviso: una stellina sola per link, non una per persona.
   * Vedi supabase/migrations/20260903100000_link_favorites.sql. */
  isFavorite: boolean;
  ts: number;
}

interface LinkRow {
  id: string;
  user_id: string;
  url: string;
  title: string;
  platform: LinkPlatform;
  label: string;
  thumb: string | null;
  category_id: string;
  is_favorite: boolean;
  created_at: string;
}

const SELECT_COLUMNS = 'id, user_id, url, title, platform, label, thumb, category_id, is_favorite, created_at';

function toRaw(row: LinkRow): RawLink {
  return {
    id: row.id,
    userId: row.user_id,
    url: row.url,
    title: row.title,
    platform: row.platform,
    label: row.label,
    thumb: row.thumb,
    categoryId: row.category_id,
    isFavorite: row.is_favorite,
    ts: new Date(row.created_at).getTime(),
  };
}

export async function listLinks(groupId: string): Promise<RawLink[]> {
  const { data, error } = await supabase
    .from('links')
    .select(SELECT_COLUMNS)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  // Un elenco vuoto per errore è indistinguibile da un elenco davvero
  // vuoto: chi chiama deve poter distinguere i due casi e riprovare.
  if (error) throw error;
  if (!data) return [];
  return data.map(toRaw);
}

export interface NewLink {
  url: string;
  title: string;
  platform: LinkPlatform;
  label: string;
  thumb: string | null;
  categoryId: string;
}

export async function createLink(groupId: string, userId: string, link: NewLink): Promise<RawLink> {
  const { data, error } = await supabase
    .from('links')
    .insert({
      group_id: groupId,
      user_id: userId,
      url: link.url,
      title: link.title,
      platform: link.platform,
      label: link.label,
      thumb: link.thumb,
      category_id: link.categoryId,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error || !data) throw error ?? new Error('Salvataggio del link non riuscito.');
  return toRaw(data);
}

export async function deleteLink(id: string): Promise<void> {
  const { error } = await supabase.from('links').delete().eq('id', id);
  if (error) throw error;
}

/** Preferito condiviso: chi lo mette o lo toglie lo fa per tutto il
 * gruppo, non solo per sé — coerente col resto dell'app, dove link e
 * categorie sono già modificabili da chiunque ne fa parte. */
export async function setFavorite(id: string, isFavorite: boolean): Promise<void> {
  const { error } = await supabase.from('links').update({ is_favorite: isFavorite }).eq('id', id);
  if (error) throw error;
}

/** Sposta un link in un'altra categoria, per tutto il gruppo. La regola
 * di modifica è la stessa dei preferiti: può farlo chiunque ne fa parte. */
export async function setLinkCategory(id: string, categoryId: string): Promise<void> {
  const { error } = await supabase.from('links').update({ category_id: categoryId }).eq('id', id);
  if (error) throw error;
}

/** Sottoscrive inserimenti, cancellazioni e modifiche di link nel gruppo.
 * L'UPDATE propaga preferiti e cambi di categoria: quelli fatti dal menu
 * di un link e quelli dovuti all'eliminazione di una categoria non vuota
 * (vedi linkCategories.deleteCategory). */
/** Il suffisso casuale rende univoco il nome del canale.
 * supabase-js riusa lo stesso oggetto canale a parità di nome: se due
 * componenti montati insieme si iscrivono allo stesso, la seconda `.on()`
 * fallisce ("cannot add postgres_changes callbacks ... after subscribe()").
 * Per `postgres_changes` il nome conta solo per questo client, quindi
 * renderlo univoco non ha controindicazioni — al contrario dei canali
 * broadcast, dove il nome è il punto d'incontro fra client diversi e deve
 * restare identico (vedi typing.ts). */
export function subscribeToLinks(
  groupId: string,
  handlers: { onInsert: (link: RawLink) => void; onUpdate: (link: RawLink) => void; onDelete: (id: string) => void },
): () => void {
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const channel = supabase
    .channel(`links:${groupId}:${uniqueSuffix}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'links', filter: `group_id=eq.${groupId}` },
      (payload) => handlers.onInsert(toRaw(payload.new as LinkRow)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'links', filter: `group_id=eq.${groupId}` },
      (payload) => handlers.onUpdate(toRaw(payload.new as LinkRow)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'links', filter: `group_id=eq.${groupId}` },
      (payload) => handlers.onDelete((payload.old as { id: string }).id),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

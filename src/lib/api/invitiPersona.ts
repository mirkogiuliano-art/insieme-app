import { supabase } from '@/lib/supabase';
import { toGroup, type GroupRow } from '@/lib/api/groups';
import type { Group } from '@/types';

/**
 * Inviti a persona — vedi supabase/migrations/20261023120000_inviti_persona.sql.
 *
 * Chi è già in un altro tuo gruppo si invita da qui, e risponde dalla home.
 * Il link (invites.ts) resta per chi non è ancora su Insieme. Le regole
 * (chi può invitare chi, i blocchi) stanno tutte nel database.
 */

/** Una persona che è in almeno un altro dei tuoi gruppi. */
export interface PersonaConosciuta {
  id: string;
  nome: string;
  /** I gruppi in cui siete insieme, per riconoscerla. */
  gruppi: string[];
  invitata: boolean;
}

/** Un invito arrivato a chi guarda. `id` è quello del gruppo: ce n'è al
 * massimo uno per gruppo. */
export interface InvitoRicevuto {
  id: string;
  gruppo: { id: string; nome: string; colore: string };
  da: string;
  /** Chi c'è già, a cominciare da chi invita. */
  membri: string[];
}

export async function personeCheConosco(groupId: string): Promise<PersonaConosciuta[]> {
  const { data, error } = await supabase.rpc('persone_che_conosco', { p_group_id: groupId });
  if (error) throw error;
  return (data ?? []) as PersonaConosciuta[];
}

export async function invitaPersona(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('invita_persona', { p_group_id: groupId, p_utente: userId });
  if (error) throw error;
  // L'avviso si lancia e si dimentica, come per i messaggi: l'invito c'è
  // già, e lo trova in home anche senza.
  supabase.functions.invoke('notify-invite', { body: { groupId, utente: userId } }).catch(() => {});
}

/** Chi è stato invitato nel gruppo e non ha ancora risposto. */
export async function invitiInAttesa(groupId: string): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase.from('inviti_persona').select('invitato_id').eq('group_id', groupId);
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.invitato_id as string);
  if (ids.length === 0) return [];
  const { data: profili } = await supabase.from('profiles').select('id, display_name').in('id', ids);
  const nomi = new Map((profili ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? '']));
  return ids.map((id) => ({ id, nome: nomi.get(id) ?? '' }));
}

export async function mieiInviti(): Promise<InvitoRicevuto[]> {
  const { data, error } = await supabase.rpc('miei_inviti');
  if (error) throw error;
  return ((data ?? []) as { group_id: string; nome: string; colore: string; da: string; membri: string[] | null }[]).map((r) => ({
    id: r.group_id,
    gruppo: { id: r.group_id, nome: r.nome, colore: r.colore },
    da: r.da,
    membri: r.membri ?? [],
  }));
}

/** Entra (e restituisce il gruppo) o rifiuta (`null`). */
export async function rispondiInvito(groupId: string, entra: boolean): Promise<Group | null> {
  const { data, error } = await supabase.rpc('rispondi_invito', { p_group_id: groupId, p_entra: entra });
  if (error) throw error;
  // Rifiutando la funzione restituisce una riga vuota.
  return entra && (data as GroupRow | null)?.id ? toGroup(data as GroupRow) : null;
}

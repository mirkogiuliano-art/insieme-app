import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import type { Group } from '@/types';

/**
 * Inviti ai gruppi — vedi supabase/migrations/20260902100000_invite_only.sql.
 *
 * Il codice del gruppo non è più una credenziale: si entra solo riscattando
 * un invito. Ogni gruppo ha un solo link, riutilizzabile e senza scadenza,
 * che si può revocare o rigenerare (rigenerarlo invalida il precedente).
 */

interface GroupRow {
  id: string;
  name: string;
  color: string | null;
  created_by: string | null;
  created_at: string;
}

function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? '',
    createdBy: row.created_by ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

/** Indirizzo da condividere. Il token sta nel percorso, non il codice del
 * gruppo: chi lo riceve non impara nulla sul gruppo finché non entra. */
export function inviteUrl(token: string): string {
  return Linking.createURL(`/invite/${token}`);
}

/** Token dell'invito in corso, oppure `null` se è stato revocato. */
export async function getInviteToken(groupId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('group_invites')
    .select('token')
    .eq('group_id', groupId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { token: string }).token;
}

/** Crea il link se non c'è, oppure ne genera uno nuovo invalidando il
 * vecchio. Le due cose sono la stessa operazione lato database. */
export async function rotateInvite(groupId: string): Promise<string> {
  const { data, error } = await supabase.rpc('rotate_invite', { p_group_id: groupId });
  if (error || !data) throw error ?? new Error('Non sono riuscito a creare il link di invito.');
  return data as string;
}

/** Disattiva il link: chi ce l'ha non può più entrare. */
export async function revokeInvite(groupId: string): Promise<void> {
  const { error } = await supabase.from('group_invites').delete().eq('group_id', groupId);
  if (error) throw error;
}

/** Accetta un invito ed entra nel gruppo. Riaprire lo stesso link da
 * membri non è un errore: riporta semplicemente al gruppo. */
export async function redeemInvite(token: string): Promise<Group> {
  const { data, error } = await supabase.rpc('redeem_invite', { p_token: token });
  if (error) throw error;
  if (!data) throw new Error('Invito non valido o revocato.');
  return toGroup(data as GroupRow);
}

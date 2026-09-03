import { supabase } from '@/lib/supabase';
import { genGroupCode } from '@/lib/utils';
import { GROUP_PALETTE, type Group } from '@/types';

interface GroupRow {
  id: string;
  name: string;
  color: string | null;
  created_by: string | null;
  created_at: string;
}

function toGroup(row: GroupRow, joinedAt?: number): Group {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? '',
    createdBy: row.created_by ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    joinedAt,
  };
}

/** Dati del gruppo. Le regole di sicurezza lo restituiscono solo a chi ne
 * è già membro: non serve più a "trovare" un gruppo da un codice — quella
 * strada non esiste più, si entra solo da un invito. */
export async function getMyGroup(code: string): Promise<Group | null> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, color, created_by, created_at')
    .eq('id', code)
    .maybeSingle();
  if (error || !data) return null;
  return toGroup(data as GroupRow);
}

/**
 * Crea un gruppo + la membership del creatore + la categoria link
 * "Generale" di default, in un'unica transazione (funzione Postgres
 * create_group). Rigenera il codice e riprova in caso di collisione
 * (rarissima, spazio di 33^6 combinazioni).
 */
export async function createGroupWithMembership(name: string): Promise<Group> {
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = genGroupCode();
    const color = GROUP_PALETTE[Math.abs(code.charCodeAt(0)) % GROUP_PALETTE.length];
    // create_group ritorna una singola riga groups (non SETOF), quindi
    // `data` è già l'oggetto — niente .single() qui.
    const { data, error } = await supabase.rpc('create_group', {
      p_code: code,
      p_name: name,
      p_color: color,
    });
    if (!error && data) return toGroup(data as GroupRow);
    // 23505 = unique_violation: il codice esiste già, si riprova con uno nuovo.
    if (error && (error as { code?: string }).code !== '23505') throw error;
  }
  throw new Error('Impossibile generare un codice gruppo univoco, riprova.');
}

export async function listMyGroups(): Promise<Group[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await supabase
    .from('group_members')
    .select('joined_at, groups(id, name, color, created_by, created_at)')
    .eq('user_id', auth.user.id)
    .order('joined_at', { ascending: false });
  // Un elenco vuoto per errore è indistinguibile da un elenco davvero
  // vuoto: chi chiama deve poter distinguere i due casi e riprovare.
  if (error) throw error;
  if (!data) return [];
  return data
    .filter((row): row is typeof row & { groups: GroupRow } => !!row.groups)
    .map((row) => toGroup(row.groups, new Date(row.joined_at).getTime()));
}

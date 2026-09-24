import { supabase } from '@/lib/supabase';
import { genGroupCode } from '@/lib/utils';
import { GROUP_PALETTE, type Group } from '@/types';

interface GroupRow {
  id: string;
  name: string;
  color: string | null;
  created_by: string | null;
  created_at: string;
  description: string | null;
  starts_on: string | null;
  ends_on: string | null;
  place_pin_id: string | null;
  info_updated_by: string | null;
  info_updated_at: string | null;
}

const SELECT_COLUMNS =
  'id, name, color, created_by, created_at, description, starts_on, ends_on, place_pin_id, info_updated_by, info_updated_at';

function toGroup(row: GroupRow, joinedAt?: number): Group {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? '',
    createdBy: row.created_by ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    joinedAt,
    description: row.description,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    placePinId: row.place_pin_id,
    infoUpdatedBy: row.info_updated_by,
    infoUpdatedAt: row.info_updated_at ? new Date(row.info_updated_at).getTime() : null,
  };
}

/** Dati del gruppo. Le regole di sicurezza lo restituiscono solo a chi ne
 * è già membro: non serve più a "trovare" un gruppo da un codice — quella
 * strada non esiste più, si entra solo da un invito. */
export async function getMyGroup(code: string): Promise<Group | null> {
  const { data, error } = await supabase
    .from('groups')
    .select(SELECT_COLUMNS)
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
/** Crea un gruppo e mi ci iscrive. Il colore della scheda lo sceglie chi
 * crea; se non lo sceglie, uno della tavolozza. */
export async function createGroupWithMembership(name: string, chosenColor?: string): Promise<Group> {
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = genGroupCode();
    const color = chosenColor || GROUP_PALETTE[Math.abs(code.charCodeAt(0)) % GROUP_PALETTE.length];
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

/** Cambia il colore della scheda del gruppo, per tutti. Passa da una
 * funzione del database: vedi 20260922100000_colore_gruppo.sql. */
export async function setGroupColor(groupId: string, color: string): Promise<void> {
  const { error } = await supabase.rpc('cambia_colore_gruppo', { p_group_id: groupId, p_color: color });
  if (error) throw error;
}

/**
 * Descrizione, date e meta del gruppo, tutte insieme: `null` vuol dire
 * "vuoto", ed e' cosi' che si toglie una data o la meta. Passa da una
 * funzione del database - vedi 20260923120000_info_gruppo.sql.
 */
export async function setGroupInfo(
  groupId: string,
  info: { description: string | null; startsOn: string | null; endsOn: string | null; placePinId: string | null },
): Promise<void> {
  const { error } = await supabase.rpc('aggiorna_info_gruppo', {
    p_group_id: groupId,
    p_description: info.description,
    p_starts_on: info.startsOn,
    p_ends_on: info.endsOn,
    p_place_pin_id: info.placePinId,
  });
  if (error) throw error;
}

/** Le info del gruppo cambiate da qualcun altro, mentre si guarda. */
export function subscribeToGroup(groupId: string, onChange: (group: Group) => void): () => void {
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const channel = supabase
    .channel(`groups:${groupId}:${uniqueSuffix}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` },
      (payload) => onChange(toGroup(payload.new as GroupRow)),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function listMyGroups(): Promise<Group[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await supabase
    .from('group_members')
    .select(`joined_at, groups(${SELECT_COLUMNS})`)
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

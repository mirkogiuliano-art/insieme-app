import { supabase } from '@/lib/supabase';

interface FactRow {
  id: string;
  label: string;
  value: string;
  position: number;
  created_by: string;
  created_at: string;
}

export interface RawFact {
  id: string;
  /** L'etichetta breve: "Hotel", "Volo", "Wi-Fi". */
  label: string;
  value: string;
  position: number;
  createdBy: string;
}

const SELECT_COLUMNS = 'id, label, value, position, created_by, created_at';

function toRaw(row: FactRow): RawFact {
  return {
    id: row.id,
    label: row.label,
    value: row.value,
    position: row.position,
    createdBy: row.created_by,
  };
}

/** Le "cose da sapere" del gruppo, nell'ordine deciso da chi le ha
 * scritte (non per data: si riordinano senza riscriverle). */
export async function listFacts(groupId: string): Promise<RawFact[]> {
  const { data, error } = await supabase
    .from('group_facts')
    .select(SELECT_COLUMNS)
    .eq('group_id', groupId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as FactRow[]).map(toRaw);
}

export async function addFact(groupId: string, userId: string, label: string, value: string, position: number): Promise<RawFact> {
  const { data, error } = await supabase
    .from('group_facts')
    .insert({ group_id: groupId, created_by: userId, label: label.trim(), value: value.trim(), position })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return toRaw(data as FactRow);
}

/** Una riga è del gruppo, non di chi l'ha scritta: la corregge chiunque. */
export async function editFact(id: string, label: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('group_facts')
    .update({ label: label.trim(), value: value.trim() })
    .eq('id', id);
  if (error) throw error;
}

export async function removeFact(id: string): Promise<void> {
  const { error } = await supabase.from('group_facts').delete().eq('id', id);
  if (error) throw error;
}

/** Le righe aggiunte, corrette o tolte da qualcun altro. Si ricarica
 * l'elenco intero: sono poche, e così l'ordine resta quello giusto. */
export function subscribeToFacts(groupId: string, onChange: () => void): () => void {
  const uniqueSuffix = Math.random().toString(36).slice(2, 8);
  const channel = supabase
    .channel(`group_facts:${groupId}:${uniqueSuffix}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'group_facts', filter: `group_id=eq.${groupId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

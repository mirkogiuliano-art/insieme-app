import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

export async function getMyProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', auth.user.id)
    .single();
  if (error || !data) return null;
  return { id: data.id, displayName: data.display_name };
}

export async function updateDisplayName(name: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Non autenticato.');
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name.trim().slice(0, 24) })
    .eq('id', auth.user.id);
  if (error) throw error;
}

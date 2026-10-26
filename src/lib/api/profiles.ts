import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';
import { dizionario } from '@/i18n';

export async function getMyProfile(): Promise<Profile | null> {
  // La sessione salvata sul telefono, senza chiedere al server: con
  // getUser, senza rete sembrava che non ci fosse nessuno collegato.
  const { data: sessione } = await supabase.auth.getSession();
  const user = sessione.session?.user;
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, nome_utente')
    .eq('id', user.id)
    .maybeSingle();
  // Un errore si solleva invece di passare per «profilo senza nome»: chi
  // chiama usa la copia salvata, e chi riapre l'app senza rete non si
  // vede chiedere il nome come al primo avvio.
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, displayName: data.display_name, nomeUtente: data.nome_utente };
}

export async function updateDisplayName(name: string): Promise<void> {
  // Come in getMyProfile: senza rete l'errore vero è la rete, non
  // «non autenticato».
  const { data: sessione } = await supabase.auth.getSession();
  const user = sessione.session?.user;
  if (!user) throw new Error(dizionario().errori.nonAutenticato);
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name.trim().slice(0, 24) })
    .eq('id', user.id);
  if (error) throw error;
}

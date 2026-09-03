import { supabase } from '@/lib/supabase';

/** Indicatore "sta scrivendo…": un canale Realtime broadcast, non
 * postgres_changes — il segnale è effimero, non serve (né si vuole)
 * scriverlo su database. `{ broadcast: { self: false } }` evita che il
 * mittente riceva il proprio stesso evento. */
export function subscribeToTyping(
  groupId: string,
  onTyping: (userId: string) => void,
): { send: (userId: string) => void; unsubscribe: () => void } {
  // ATTENZIONE: qui il nome NON va reso univoco, al contrario delle
  // sottoscrizioni postgres_changes. Questo è un canale broadcast, cioè un
  // punto d'incontro: i client si sentono fra loro solo se sono sullo
  // stesso nome. Aggiungerci un suffisso casuale spegnerebbe in silenzio
  // l'indicatore "sta scrivendo".
  const channel = supabase.channel(`typing:${groupId}`, { config: { broadcast: { self: false } } });
  channel.on('broadcast', { event: 'typing' }, (payload) => {
    const userId = (payload.payload as { userId: string }).userId;
    onTyping(userId);
  });
  channel.subscribe();

  return {
    send: (userId: string) => {
      channel.send({ type: 'broadcast', event: 'typing', payload: { userId } });
    },
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}

import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';

export type AttachmentKind = 'image' | 'video' | 'audio';

const EXT_FROM_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'audio/m4a': 'm4a',
  'audio/x-caf': 'caf',
  'audio/mp4': 'm4a',
};

function extensionFromUri(uri: string): string | null {
  const match = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(uri);
  return match ? match[1].toLowerCase() : null;
}

/** Carica un file locale (foto/video/audio) nel bucket pubblico `chat-media`
 * (condiviso anche dagli allegati della tab Link, non solo dalla chat —
 * il nome del bucket è storico), sotto il path `{groupId}/{uuid}.{estensione}`,
 * e ritorna l'URL pubblico pronto da salvare (in messages.attachment_url o
 * in links.url). Il tipo MIME reale del file (`blob.type`) è la fonte più
 * affidabile per l'estensione — su web `localUri` è spesso un `blob:`/`data:`
 * senza nome file riconoscibile. */
/**
 * Chiede alla Edge Function `storage-cleanup` di ripulire i file del gruppo
 * che non sono più usati da nessuna riga.
 *
 * Va chiamata dopo le operazioni che possono lasciare file orfani — l'uscita
 * da un gruppo, l'eliminazione di un link — e si può ignorare l'esito: è una
 * spazzata, non una cancellazione mirata, quindi una chiamata persa viene
 * rimediata dalla successiva. Per questo non attende e non solleva errori:
 * non deve mai far fallire l'operazione dell'utente.
 */
export function sweepGroupMedia(groupId?: string): void {
  supabase.functions.invoke('storage-cleanup', { body: groupId ? { groupId } : {} }).catch(() => {
    // volutamente in silenzio: ci ripensa la prossima spazzata
  });
}

export async function uploadGroupMedia(groupId: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const contentType = blob.type || 'application/octet-stream';
  const ext = EXT_FROM_MIME[contentType] ?? extensionFromUri(localUri) ?? 'bin';
  const path = `${groupId}/${Crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('chat-media').upload(path, blob, { contentType });
  if (error) throw error;
  return supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
}

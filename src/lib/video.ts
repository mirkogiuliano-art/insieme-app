/**
 * I video si comprimono prima di essere caricati.
 *
 * Un video girato col telefono pesa 100-200 MB al minuto: oltre il limite
 * di 50 MB per file (vedi PESO_MASSIMO in api/mediaUpload.ts), e ogni
 * membro del gruppo lo scaricherebbe intero. Compresso come fa WhatsApp
 * (`compressionMethod: 'auto'`, che sceglie risoluzione e bitrate dal
 * video di partenza) pesa diverse volte meno e sul telefono si vede uguale.
 *
 * Se qualcosa va storto si carica l'originale: comprimere è un risparmio,
 * non deve mai costare l'invio.
 */

import { Video } from 'react-native-compressor';
import { segnalaErrore } from '@/lib/sentry';

/** Sotto questo peso non vale la pena ricomprimere. */
const GIA_LEGGERO = 2 * 1024 * 1024;

/** Se il file non dichiara il suo tipo, lo dice l'estensione. */
const DA_ESTENSIONE: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', '3gp': 'video/3gpp' };

export async function comprimiVideo(uri: string, originale: Blob): Promise<{ blob: Blob; contentType: string } | null> {
  const estensione = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(uri)?.[1]?.toLowerCase() ?? '';
  const tipo = originale.type.toLowerCase() || DA_ESTENSIONE[estensione] || '';
  if (!tipo.startsWith('video/') || originale.size <= GIA_LEGGERO) return null;
  try {
    // shortcut: la compressione rientra nei 90 secondi di UPLOAD_TIMEOUT insieme al caricamento, quindi un video di parecchi minuti può scadere; se succede, dare alla compressione un tempo suo.
    const compresso = await Video.compress(uri, { compressionMethod: 'auto' });
    const blob = await (await fetch(compresso)).blob();
    if (blob.size >= originale.size) return null;
    return { blob, contentType: 'video/mp4' };
  } catch (err) {
    segnalaErrore(err, 'video.comprimi');
    return null;
  }
}

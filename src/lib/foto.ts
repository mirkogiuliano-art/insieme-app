/**
 * Le foto si rimpiccioliscono prima di essere caricate.
 *
 * Una foto del telefono è sui 4000 × 3000 pixel e pesa 2-4 MB, ma in chat
 * si vede come una miniatura, e anche aperta a tutto schermo un telefono
 * ne mostra al massimo 1000-1400 di larghezza. Caricata intera, ogni
 * membro del gruppo la scaricava tutta per vederne la miniatura: giga del
 * proprio piano dati, immagini lente a comparire, e lo spazio del progetto
 * Supabase che si riempie. A 1600 pixel sul lato lungo resta nitida e pesa
 * circa dieci volte meno.
 *
 * Se qualcosa va storto si carica l'originale: rimpicciolire è un
 * risparmio, non deve mai costare l'invio.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { segnalaErrore } from '@/lib/sentry';

const LATO_MASSIMO = 1600;
/** Sotto questo peso non vale la pena ricomprimere. */
const GIA_LEGGERA = 400 * 1024;
const QUALITA_JPEG = 0.8;

/** Le GIF restano fuori: rimpicciolite diventerebbero immagini ferme. */
const RIDUCIBILI = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

/** Se il file non dichiara il suo tipo, lo dice l'estensione. */
const DA_ESTENSIONE: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };

export async function rimpicciolisciFoto(uri: string, originale: Blob): Promise<{ blob: Blob; contentType: string } | null> {
  const estensione = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(uri)?.[1]?.toLowerCase() ?? '';
  const tipo = originale.type.toLowerCase() || DA_ESTENSIONE[estensione] || '';
  if (!RIDUCIBILI.has(tipo) || originale.size <= GIA_LEGGERA) return null;
  // Il PNG resta PNG: può avere parti trasparenti, che in JPEG
  // diventerebbero nere. Tutto il resto diventa JPEG.
  const png = tipo === 'image/png';
  const contesto = ImageManipulator.manipulate(uri);
  // Un'immagine decodificata occupa molta più memoria del file (una foto
  // da 12 megapixel sono circa 48 MB): si libera appena finito, senza
  // aspettare che ci pensi il sistema.
  const daLiberare: { release(): void }[] = [contesto];
  try {
    const intera = await contesto.renderAsync();
    daLiberare.push(intera);
    let pronta = intera;
    if (Math.max(intera.width, intera.height) > LATO_MASSIMO) {
      contesto.resize(intera.width >= intera.height ? { width: LATO_MASSIMO } : { height: LATO_MASSIMO });
      pronta = await contesto.renderAsync();
      daLiberare.push(pronta);
    }
    const salvata = await pronta.saveAsync(png ? { format: SaveFormat.PNG } : { format: SaveFormat.JPEG, compress: QUALITA_JPEG });
    const blob = await (await fetch(salvata.uri)).blob();
    // Una foto già piccola e già compressa può uscirne più pesante.
    if (blob.size >= originale.size) return null;
    return { blob, contentType: png ? 'image/png' : 'image/jpeg' };
  } catch (err) {
    segnalaErrore(err, 'foto.rimpicciolisci');
    return null;
  } finally {
    for (const r of daLiberare) r.release();
  }
}

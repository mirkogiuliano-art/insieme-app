/**
 * Le date delle info del gruppo, scritte e lette come le dice una persona.
 *
 * Nel database sono date vere ('AAAA-MM-GG'), qui diventano "12 aprile" e
 * "mancano 24 giorni". Si scelgono dal calendario (vedi CampoData): a mano,
 * con la tastiera del telefono, una data scritta male non si salvava.
 *
 * I nomi dei mesi non sono più scritti qui: li dà `Intl` nella lingua in
 * uso. Le frasi intorno — "mancano N giorni", "giorno 3 di 8" — stanno nel
 * dizionario, perché ogni lingua le costruisce a modo suo.
 */

import { dizionario, localeAttuale } from '@/i18n';

function parti(iso: string): { g: number; m: number; a: number } | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { a: Number(m[1]), m: Number(m[2]), g: Number(m[3]) };
}

/** Il nome del mese nella lingua in uso: "aprile", "April". */
function nomeMese(mese: number): string {
  return new Date(2000, mese - 1, 1).toLocaleDateString(localeAttuale(), { month: 'long' });
}

/** Giorno e mese come li scrive la lingua: "12 aprile" in italiano,
 * "12 April" in inglese — l'inglese britannico tiene lo stesso ordine. */
function giornoEMese(g: number, m: number): string {
  return `${g} ${nomeMese(m)}`;
}

/** Una data sola, corta, per i campi del calendario: «12 apr 2027». */
export function dataCorta(iso: string): string {
  const d = parti(iso);
  return d ? `${d.g} ${nomeMese(d.m).slice(0, 3)} ${d.a}` : iso;
}

/**
 * Le due date in una riga sola: "12 – 19 aprile 2027" quando il mese è lo
 * stesso, "28 marzo – 4 aprile 2027" quando cambia, "dal 12 aprile 2027"
 * quando manca la fine.
 */
export function rangeLabel(startsOn: string | null | undefined, endsOn: string | null | undefined): string | null {
  const a = startsOn ? parti(startsOn) : null;
  const b = endsOn ? parti(endsOn) : null;
  if (!a && !b) return null;
  const c = dizionario().conto;
  if (a && !b) return c.dal(`${giornoEMese(a.g, a.m)} ${a.a}`);
  if (!a && b) return c.finoAl(`${giornoEMese(b!.g, b!.m)} ${b!.a}`);
  if (a!.a === b!.a && a!.m === b!.m) {
    if (a!.g === b!.g) return `${giornoEMese(a!.g, a!.m)} ${a!.a}`;
    return `${a!.g} – ${giornoEMese(b!.g, b!.m)} ${a!.a}`;
  }
  if (a!.a === b!.a) return `${giornoEMese(a!.g, a!.m)} – ${giornoEMese(b!.g, b!.m)} ${a!.a}`;
  return `${giornoEMese(a!.g, a!.m)} ${a!.a} – ${giornoEMese(b!.g, b!.m)} ${b!.a}`;
}

function aMezzanotte(iso: string): number | null {
  const p = parti(iso);
  return p ? new Date(p.a, p.m - 1, p.g).getTime() : null;
}

/**
 * Dove siamo rispetto alle date: "mancano 24 giorni" prima, "giorno 3 di 8"
 * durante, `null` quando è passato (a viaggio finito il conto non serve
 * più a nessuno) o quando non c'è una data d'inizio.
 */
export function countdownLabel(
  startsOn: string | null | undefined,
  endsOn: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!startsOn) return null;
  const inizio = aMezzanotte(startsOn);
  if (inizio == null) return null;
  const c = dizionario().conto;
  const oggi = new Date(now);
  const oggiMezzanotte = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()).getTime();
  const giorno = 86400000;
  const mancano = Math.round((inizio - oggiMezzanotte) / giorno);
  if (mancano > 1) return c.mancano(mancano);
  if (mancano === 1) return c.domani;
  if (mancano === 0) return c.oggi;

  const fine = endsOn ? aMezzanotte(endsOn) : inizio;
  if (fine == null || oggiMezzanotte > fine) return null;
  const numero = Math.round((oggiMezzanotte - inizio) / giorno) + 1;
  const totale = Math.round((fine - inizio) / giorno) + 1;
  return totale > 1 ? c.giornoDi(numero, totale) : c.eOggi;
}

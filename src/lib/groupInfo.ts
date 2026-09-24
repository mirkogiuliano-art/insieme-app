/**
 * Le date delle info del gruppo, scritte e lette come le dice una persona.
 *
 * Nel database sono date vere ('AAAA-MM-GG'), qui diventano "12 aprile" e
 * "mancano 24 giorni". Non c'è un calendario a comparsa perché servirebbe
 * un pacchetto nativo in più, e una data si scrive anche a mano: i campi
 * accettano GG/MM/AAAA e rifiutano quello che non è una data.
 */

const MESI = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

/** 'AAAA-MM-GG' → '12/04/2027', per i campi di scrittura. */
export function isoToInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

/** '12/04/2027' → 'AAAA-MM-GG', oppure `null` se non è una data vera
 * (giorno 31 di febbraio compreso). Una stringa vuota vale "nessuna data". */
export function inputToIso(text: string): { iso: string | null; ok: boolean } {
  const pulito = text.trim();
  if (!pulito) return { iso: null, ok: true };
  const m = pulito.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!m) return { iso: null, ok: false };
  const [, gg, mm, aaaa] = m;
  const giorno = Number(gg);
  const mese = Number(mm);
  const anno = Number(aaaa);
  const d = new Date(anno, mese - 1, giorno);
  // Il 31 febbraio diventerebbe il 3 marzo: si controlla che la data
  // rimessa insieme sia ancora quella scritta.
  if (d.getFullYear() !== anno || d.getMonth() !== mese - 1 || d.getDate() !== giorno) {
    return { iso: null, ok: false };
  }
  return { iso: `${aaaa}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`, ok: true };
}

function parti(iso: string): { g: number; m: number; a: number } | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { a: Number(m[1]), m: Number(m[2]), g: Number(m[3]) };
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
  if (a && !b) return `dal ${a.g} ${MESI[a.m - 1]} ${a.a}`;
  if (!a && b) return `fino al ${b!.g} ${MESI[b!.m - 1]} ${b!.a}`;
  if (a!.a === b!.a && a!.m === b!.m) {
    if (a!.g === b!.g) return `${a!.g} ${MESI[a!.m - 1]} ${a!.a}`;
    return `${a!.g} – ${b!.g} ${MESI[a!.m - 1]} ${a!.a}`;
  }
  if (a!.a === b!.a) return `${a!.g} ${MESI[a!.m - 1]} – ${b!.g} ${MESI[b!.m - 1]} ${a!.a}`;
  return `${a!.g} ${MESI[a!.m - 1]} ${a!.a} – ${b!.g} ${MESI[b!.m - 1]} ${b!.a}`;
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
  const oggi = new Date(now);
  const oggiMezzanotte = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()).getTime();
  const giorno = 86400000;
  const mancano = Math.round((inizio - oggiMezzanotte) / giorno);
  if (mancano > 1) return `mancano ${mancano} giorni`;
  if (mancano === 1) return 'domani';
  if (mancano === 0) return 'si parte oggi';

  const fine = endsOn ? aMezzanotte(endsOn) : inizio;
  if (fine == null || oggiMezzanotte > fine) return null;
  const numero = Math.round((oggiMezzanotte - inizio) / giorno) + 1;
  const totale = Math.round((fine - inizio) / giorno) + 1;
  return totale > 1 ? `giorno ${numero} di ${totale}` : 'è oggi';
}

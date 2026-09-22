import React from 'react';
import Svg, { Path, G, Circle, Rect } from 'react-native-svg';

/**
 * Il segnaposto dei posti salvati.
 *
 * Sostituisce il pin di sistema, che si può soltanto tingere — e su
 * Android nemmeno bene: di un colore conserva la sola tonalità e butta
 * via saturazione e luminosità, così un verde tenue arriva acceso e un
 * ottone arriva arancione. Disegnandolo qui il colore è esattamente
 * quello della categoria, e dentro ci sta un'icona.
 *
 * Il colore da solo non basterebbe: due categorie con tinte simili si
 * confondono, e chi distingue male i colori non le separa affatto.
 * L'icona dice **cosa** è quel posto, il colore dice **di quale gruppo di
 * posti** fa parte.
 *
 * Il contorno è bianco in tutti e due i temi, e non è una svista: sotto
 * c'è sempre la mappa di Google, che resta chiara anche quando l'app è
 * scura. Il bordo segue quello che ha dietro, non il tema dell'app.
 */

/** Le icone, in una scatola di 24×24, ridotte all'osso: a sedici pixel di
 * lato non sopravvive nient'altro. */
const ICONE = {
  vedere: 'M12 3.6l2.6 5.3 5.8.9-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.9z',
  mangiare: 'M8.5 21V3M6 3v4.5a2.5 2.5 0 0 0 5 0V3M16.5 21v-7M16.5 14c2.2 0 2.8-2.4 2.8-5.5S18 3 16.5 3s-2.8 2.4-2.8 5.5S14.3 14 16.5 14z',
  bere: 'M5 4h14l-7 8.5L5 4zM12 12.5V20M8.5 20h7',
  dormire: 'M3 18v-8M3 13h18v5M21 18v-5a3 3 0 0 0-3-3h-7v3',
  comprare: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
} as const;

type Icona = keyof typeof ICONE | 'punto';

/** Parole da cui si indovina di che posto si tratta.
 *
 * Le categorie le scrive chi usa l'app, con nome e colore liberi: non
 * esiste un elenco fisso a cui agganciare le icone. Si tira a indovinare
 * dal nome e, quando non si capisce, si ripiega su un punto — che è
 * meglio di un'icona sbagliata. */
const PAROLE: [Icona, string[]][] = [
  ['mangiare', ['ristorant', 'trattoria', 'pizzer', 'osteria', 'cena', 'pranzo', 'mangiare', 'cibo', 'sushi', 'food']],
  ['bere', ['bar', 'aperitiv', 'drink', 'cocktail', 'pub', 'caff', 'birr', 'vino', 'vini', 'enotec']],
  ['dormire', ['dormire', 'hotel', 'albergo', 'ostello', 'alloggio', 'appartament', 'casa', 'case']],
  ['comprare', ['negoz', 'shopping', 'spesa', 'mercat', 'outlet', 'compr']],
  ['vedere', ['visitar', 'vedere', 'muse', 'monument', 'chies', 'parco', 'parchi', 'panoram', 'attrazion', 'spiagg']],
];

/**
 * Le parole corte devono combaciare per intero, quelle lunghe basta che
 * comincino uguale.
 *
 * Senza questa distinzione «bar» finirebbe dentro «Barche» e «Barbiere»,
 * mentre «ristorant» deve poter prendere sia «ristorante» che
 * «ristoranti». Quattro caratteri è la soglia: sotto, la parola è troppo
 * corta per stare dentro un'altra senza combinare guai.
 */
export function iconaPerCategoria(nome: string): Icona {
  const parole = nome.toLowerCase().split(/[^a-zàèéìòù&]+/).filter(Boolean);
  for (const [icona, chiavi] of PAROLE) {
    const trovata = chiavi.some((k) =>
      parole.some((p) => (k.length >= 4 ? p.startsWith(k) : p === k)),
    );
    if (trovata) return icona;
  }
  return 'punto';
}

/** Misure del segnaposto sulla mappa. Cresciuto oltre non aiuta: già così
 * due posti vicini in centro città si toccano. */
const LARGHEZZA = 34;
const ALTEZZA = 41;

const GOCCIA = 'M20 2C11.2 2 4 9.2 4 18c0 11.5 16 27 16 27s16-15.5 16-27c0-8.8-7.2-16-16-16z';

export function MapPin({
  color,
  categoryName,
  selected,
}: {
  color: string;
  categoryName: string;
  /** Il posto di cui è aperta l'anteprima cresce: con la scheda in basso
   * bisogna capire a quale dei pin si riferisce. */
  selected?: boolean;
}) {
  const icona = iconaPerCategoria(categoryName);
  const scala = selected ? 1.3 : 1;

  return (
    <Svg width={LARGHEZZA * scala} height={ALTEZZA * scala} viewBox="0 0 40 48">
      <Path d={GOCCIA} fill={color} stroke="#FFFFFF" strokeWidth={2.6} />
      {icona === 'punto' ? (
        <Circle cx={20} cy={18} r={4.5} fill="#FFFFFF" />
      ) : (
        // L'icona è disegnata in una scatola di 24 e va portata a 16:
        // da qui la riduzione di due terzi, e lo spostamento che la
        // centra nella testa della goccia.
        <G transform="translate(12 10) scale(0.6667)">
          <Path
            d={ICONE[icona]}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2.4 / 0.6667}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      )}
    </Svg>
  );
}

/**
 * Il riquadro del posto negli elenchi: stesso colore e stessa icona del
 * suo segnaposto sulla mappa, così fra mappa ed elenco il posto si
 * riconosce a colpo d'occhio.
 */
export function PlaceTile({ color, categoryName, size = 52 }: { color: string; categoryName: string; size?: number }) {
  const icona = iconaPerCategoria(categoryName);
  const lato = Math.round(size * 0.46);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect width={size} height={size} rx={size * 0.27} fill={color} />
      {icona === 'punto' ? (
        <Circle cx={size / 2} cy={size / 2} r={size * 0.11} fill="#FFFFFF" />
      ) : (
        <G transform={`translate(${(size - lato) / 2} ${(size - lato) / 2}) scale(${lato / 24})`}>
          <Path
            d={ICONE[icona]}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2.2 / (lato / 24)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      )}
    </Svg>
  );
}
